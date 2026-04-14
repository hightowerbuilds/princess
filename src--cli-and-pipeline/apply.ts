import {
  access,
  cp,
  readdir,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  ApplyOptions,
  PlannedRename,
  ProgressCallback,
  RenamePlan,
  RewriteRecord,
  RunManifest,
  VerificationCheck,
  VerificationSummary,
} from "./contracts";

const REWRITABLE_CODE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
]);

const STRUCTURED_CONFIG_FILES = new Set(["tsconfig.json", "jsconfig.json"]);
const SCRIPT_CONFIG_FILE_PATTERN =
  /(?:^|\/)(?:vite|vitest|jest|next|playwright|webpack|rollup)\.config\.(?:js|ts|mjs|cjs)$/;

export async function executeRenamePlan(
  plan: RenamePlan,
  options: ApplyOptions = {},
  onProgress?: ProgressCallback,
): Promise<RunManifest> {
  if (onProgress) {
    onProgress({ type: "apply", phase: "copy", current: 0, total: 1, currentItem: plan.outputRepoPath });
  }
  await prepareOutputRepo(plan, options);
  if (onProgress) {
    onProgress({ type: "apply", phase: "copy", current: 1, total: 1, currentItem: plan.outputRepoPath });
  }

  const proposals = clonePlannedRenames(plan.proposals);
  const appliedCount = proposals.filter((p) => p.applied).length;

  if (onProgress) {
    onProgress({ type: "apply", phase: "rename", current: 0, total: appliedCount, currentItem: "" });
  }
  await applyDirectoryRenames(plan.outputRepoPath, proposals, onProgress);

  if (onProgress) {
    onProgress({ type: "apply", phase: "rewrite-imports", current: 0, total: 0, currentItem: "" });
  }
  const importRewrites = await rewriteRelativeImports({
    sourceRepoPath: plan.sourceRepoPath,
    outputRepoPath: plan.outputRepoPath,
    proposals,
    onProgress,
  });

  if (onProgress) {
    onProgress({ type: "apply", phase: "rewrite-configs", current: 0, total: 0, currentItem: "" });
  }
  const configRewrites = await rewriteConfigPaths({
    sourceRepoPath: plan.sourceRepoPath,
    outputRepoPath: plan.outputRepoPath,
    proposals,
    onProgress,
  });
  const rewrites = [...importRewrites, ...configRewrites];

  if (onProgress) {
    onProgress({ type: "apply", phase: "verify", current: 0, total: 3, currentItem: "" });
  }
  const verification = await verifyOutputRepo(plan.outputRepoPath, proposals, rewrites);

  const manifest: RunManifest = {
    ...plan,
    proposals,
    rewrites,
    verification,
  };

  await writePrincessArtifacts(plan, manifest);

  return manifest;
}

async function prepareOutputRepo(
  plan: RenamePlan,
  options: ApplyOptions,
): Promise<void> {
  const outputExists = await pathExists(plan.outputRepoPath);

  if (outputExists) {
    if (!options.force) {
      throw new Error(
        `Output path already exists: ${plan.outputRepoPath}. Use --force to replace it.`,
      );
    }

    await rm(plan.outputRepoPath, { recursive: true, force: true });
  }

  await cp(plan.sourceRepoPath, plan.outputRepoPath, {
    recursive: true,
    force: false,
    filter(sourcePath) {
      return shouldCopyPath({
        sourcePath,
        rootPath: plan.sourceRepoPath,
        preserveGit: Boolean(options.preserveGit),
      });
    },
  });
}

async function applyDirectoryRenames(
  outputRepoPath: string,
  proposals: PlannedRename[],
  onProgress?: ProgressCallback,
): Promise<void> {
  const appliedRenames = proposals
    .filter((proposal) => proposal.applied)
    .sort((left, right) => depthOf(right.relativePath) - depthOf(left.relativePath));

  let renameIndex = 0;
  for (const proposal of appliedRenames) {
    const currentRelativePath = proposal.relativePath;
    const targetRelativePath = targetRelativePathForProposal(proposal);
    const currentAbsolutePath = path.join(
      outputRepoPath,
      ...currentRelativePath.split("/"),
    );
    const targetAbsolutePath = path.join(
      outputRepoPath,
      ...targetRelativePath.split("/"),
    );

    const sourceExists = await pathExists(currentAbsolutePath);

    if (!sourceExists) {
      proposal.applied = false;
      proposal.reason = `Skipped because the copied directory was missing at ${currentRelativePath}.`;
      continue;
    }

    const targetExists = await pathExists(targetAbsolutePath);

    if (targetExists) {
      proposal.applied = false;
      proposal.reason = `Skipped because the output target already exists at ${targetRelativePath}.`;
      continue;
    }

    try {
      await rename(currentAbsolutePath, targetAbsolutePath);
    } catch (error) {
      proposal.applied = false;
      proposal.reason = `Rename failed for ${currentRelativePath}: ${error instanceof Error ? error.message : String(error)}`;
    }

    renameIndex += 1;
    if (onProgress) {
      onProgress({ type: "apply", phase: "rename", current: renameIndex, total: appliedRenames.length, currentItem: currentRelativePath });
    }
  }
}

async function rewriteRelativeImports(input: {
  sourceRepoPath: string;
  outputRepoPath: string;
  proposals: PlannedRename[];
  onProgress?: ProgressCallback;
}): Promise<RewriteRecord[]> {
  const records: RewriteRecord[] = [];
  const renameEntries = buildRenameEntries(input.proposals);
  const sourceFiles = await walkFiles(input.sourceRepoPath);

  for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
    const absoluteSourcePath = sourceFiles[fileIndex];
    const relativeSourcePath = normalizePosixPath(
      path.relative(input.sourceRepoPath, absoluteSourcePath),
    );
    const newRelativePath = applyRenameMapToPath(relativeSourcePath, renameEntries);
    const outputFilePath = path.join(
      input.outputRepoPath,
      ...newRelativePath.split("/"),
    );

    if (!(await pathExists(outputFilePath))) {
      continue;
    }

    const extension = path.extname(relativeSourcePath).toLowerCase();

    if (!REWRITABLE_CODE_EXTENSIONS.has(extension)) {
      continue;
    }

    const originalContents = await readFile(outputFilePath, "utf8");
    const rewriteResult = rewriteModuleSpecifiers({
      contents: originalContents,
      oldFilePath: relativeSourcePath,
      newFilePath: newRelativePath,
      renameEntries,
    });

    if (rewriteResult.rewrites === 0) {
      continue;
    }

    await writeFile(outputFilePath, rewriteResult.contents, "utf8");
    records.push({
      filePath: newRelativePath,
      kind: "import",
      status: "updated",
      details: `Updated ${rewriteResult.rewrites} relative module specifier${rewriteResult.rewrites === 1 ? "" : "s"}.`,
    });

    if (input.onProgress) {
      input.onProgress({ type: "apply", phase: "rewrite-imports", current: records.length, total: sourceFiles.length, currentItem: newRelativePath });
    }
  }

  return records;
}

async function rewriteConfigPaths(input: {
  sourceRepoPath: string;
  outputRepoPath: string;
  proposals: PlannedRename[];
  onProgress?: ProgressCallback;
}): Promise<RewriteRecord[]> {
  const records: RewriteRecord[] = [];
  const renameEntries = buildRenameEntries(input.proposals);
  const sourceFiles = await walkFiles(input.sourceRepoPath);

  for (const absoluteSourcePath of sourceFiles) {
    const relativeSourcePath = normalizePosixPath(
      path.relative(input.sourceRepoPath, absoluteSourcePath),
    );
    const newRelativePath = applyRenameMapToPath(relativeSourcePath, renameEntries);
    const outputFilePath = path.join(
      input.outputRepoPath,
      ...newRelativePath.split("/"),
    );

    if (!(await pathExists(outputFilePath))) {
      continue;
    }

    if (isStructuredConfigFile(relativeSourcePath)) {
      const originalContents = await readFile(outputFilePath, "utf8");
      const rewriteResult = rewriteStructuredConfigJson({
        contents: originalContents,
        oldFilePath: relativeSourcePath,
        newFilePath: newRelativePath,
        renameEntries,
      });

      if (rewriteResult.rewrites > 0) {
        await writeFile(outputFilePath, rewriteResult.contents, "utf8");
        records.push({
          filePath: newRelativePath,
          kind: "config",
          status: "updated",
          details: `Updated ${rewriteResult.rewrites} config path${rewriteResult.rewrites === 1 ? "" : "s"}.`,
        });
      }

      continue;
    }

    if (isScriptConfigFile(relativeSourcePath)) {
      const originalContents = await readFile(outputFilePath, "utf8");
      const rewriteResult = rewriteScriptConfigLiterals({
        contents: originalContents,
        oldFilePath: relativeSourcePath,
        newFilePath: newRelativePath,
        renameEntries,
      });

      if (rewriteResult.rewrites > 0) {
        await writeFile(outputFilePath, rewriteResult.contents, "utf8");
        records.push({
          filePath: newRelativePath,
          kind: "config",
          status: "updated",
          details: `Updated ${rewriteResult.rewrites} config literal${rewriteResult.rewrites === 1 ? "" : "s"}.`,
        });
      }
    }
  }

  return records;
}

function rewriteModuleSpecifiers(input: {
  contents: string;
  oldFilePath: string;
  newFilePath: string;
  renameEntries: RenameEntry[];
}): { contents: string; rewrites: number } {
  let rewrites = 0;
  let nextContents = input.contents;

  const patterns: RegExp[] = [
    /(from\s+)(['"])([^'"]+)(\2)/g,
    /(import\s*\(\s*)(['"])([^'"]+)(\2\s*\))/g,
    /(require\s*\(\s*)(['"])([^'"]+)(\2\s*\))/g,
  ];

  for (const pattern of patterns) {
    nextContents = nextContents.replace(
      pattern,
      (fullMatch, prefix, quote, specifier, suffix) => {
        if (typeof specifier !== "string" || !specifier.startsWith(".")) {
          return fullMatch;
        }

        const rewrittenSpecifier = rewriteRelativeSpecifier({
          specifier,
          oldFilePath: input.oldFilePath,
          newFilePath: input.newFilePath,
          renameEntries: input.renameEntries,
        });

        if (rewrittenSpecifier === specifier) {
          return fullMatch;
        }

        rewrites += 1;
        return `${prefix}${quote}${rewrittenSpecifier}${suffix}`;
      },
    );
  }

  return {
    contents: nextContents,
    rewrites,
  };
}

function rewriteRelativeSpecifier(input: {
  specifier: string;
  oldFilePath: string;
  newFilePath: string;
  renameEntries: RenameEntry[];
}): string {
  const [baseSpecifier, suffix = ""] = splitSpecifierSuffix(input.specifier);
  const oldTargetPath = normalizePosixPath(
    path.posix.normalize(
      path.posix.join(path.posix.dirname(input.oldFilePath), baseSpecifier),
    ),
  );
  const newTargetPath = applyRenameMapToPath(oldTargetPath, input.renameEntries);
  const relativeFromNewFile = path.posix.relative(
    path.posix.dirname(input.newFilePath),
    newTargetPath,
  );

  const normalizedRelative =
    relativeFromNewFile === "" ? "." : normalizeRelativeSpecifier(relativeFromNewFile);

  return `${normalizedRelative}${suffix}`;
}

function rewriteStructuredConfigJson(input: {
  contents: string;
  oldFilePath: string;
  newFilePath: string;
  renameEntries: RenameEntry[];
}): { contents: string; rewrites: number } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.contents);
  } catch {
    return {
      contents: input.contents,
      rewrites: 0,
    };
  }

  const result = rewriteStructuredConfigValue({
    value: parsed,
    keyPath: [],
    oldFilePath: input.oldFilePath,
    newFilePath: input.newFilePath,
    renameEntries: input.renameEntries,
  });

  if (result.rewrites === 0) {
    return {
      contents: input.contents,
      rewrites: 0,
    };
  }

  return {
    contents: `${JSON.stringify(result.value, null, 2)}\n`,
    rewrites: result.rewrites,
  };
}

function rewriteStructuredConfigValue(input: {
  value: unknown;
  keyPath: string[];
  oldFilePath: string;
  newFilePath: string;
  renameEntries: RenameEntry[];
}): { value: unknown; rewrites: number } {
  if (typeof input.value === "string") {
    if (!shouldRewriteStructuredConfigString(input.keyPath)) {
      return { value: input.value, rewrites: 0 };
    }

    const rewritten = rewriteConfigPathValue({
      value: input.value,
      oldFilePath: input.oldFilePath,
      newFilePath: input.newFilePath,
      renameEntries: input.renameEntries,
    });

    return {
      value: rewritten,
      rewrites: rewritten === input.value ? 0 : 1,
    };
  }

  if (Array.isArray(input.value)) {
    let rewrites = 0;
    const nextArray = input.value.map((entry, index) => {
      const result = rewriteStructuredConfigValue({
        ...input,
        value: entry,
        keyPath: [...input.keyPath, String(index)],
      });
      rewrites += result.rewrites;
      return result.value;
    });

    return {
      value: nextArray,
      rewrites,
    };
  }

  if (input.value && typeof input.value === "object") {
    let rewrites = 0;
    const nextObject: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(input.value as Record<string, unknown>)) {
      const result = rewriteStructuredConfigValue({
        ...input,
        value: entry,
        keyPath: [...input.keyPath, key],
      });
      rewrites += result.rewrites;
      nextObject[key] = result.value;
    }

    return {
      value: nextObject,
      rewrites,
    };
  }

  return {
    value: input.value,
    rewrites: 0,
  };
}

function rewriteScriptConfigLiterals(input: {
  contents: string;
  oldFilePath: string;
  newFilePath: string;
  renameEntries: RenameEntry[];
}): { contents: string; rewrites: number } {
  let rewrites = 0;

  const contents = input.contents.replace(
    /(['"`])([^'"`\n\r]+)\1/g,
    (fullMatch, quote, literal) => {
      if (typeof literal !== "string") {
        return fullMatch;
      }

      const rewritten = rewriteConfigPathValue({
        value: literal,
        oldFilePath: input.oldFilePath,
        newFilePath: input.newFilePath,
        renameEntries: input.renameEntries,
      });

      if (rewritten === literal) {
        return fullMatch;
      }

      rewrites += 1;
      return `${quote}${rewritten}${quote}`;
    },
  );

  return {
    contents,
    rewrites,
  };
}

function rewriteConfigPathValue(input: {
  value: string;
  oldFilePath: string;
  newFilePath: string;
  renameEntries: RenameEntry[];
}): string {
  if (!looksLikePathValue(input.value)) {
    return input.value;
  }

  const [baseValue, suffix = ""] = splitPathValueDecorations(input.value);

  if (baseValue.startsWith(".")) {
    return rewriteRelativeSpecifier({
      specifier: `${baseValue}${suffix}`,
      oldFilePath: input.oldFilePath,
      newFilePath: input.newFilePath,
      renameEntries: input.renameEntries,
    });
  }

  const normalizedBase = normalizePosixPath(path.posix.normalize(baseValue));
  const rewrittenBase = applyRenameMapToPath(normalizedBase, input.renameEntries);

  if (rewrittenBase === normalizedBase) {
    return input.value;
  }

  return `${rewrittenBase}${suffix}`;
}

async function verifyOutputRepo(
  outputRepoPath: string,
  proposals: PlannedRename[],
  rewrites: RewriteRecord[],
): Promise<VerificationSummary> {
  const checks: VerificationCheck[] = [];
  const outputExists = await pathExists(outputRepoPath);

  checks.push({
    name: "output-repo-exists",
    status: outputExists ? "passed" : "failed",
    details: outputExists ? outputRepoPath : "Output repo was not created.",
  });

  const renamedPathsExist = await verifyRenamedPaths(outputRepoPath, proposals);
  checks.push({
    name: "renamed-paths-exist",
    status: renamedPathsExist.ok ? "passed" : "failed",
    details: renamedPathsExist.details,
  });

  const rewriteFailures = rewrites.filter((record) => record.status === "failed");
  checks.push({
    name: "rewrite-pass",
    status: rewriteFailures.length === 0 ? "passed" : "failed",
    details:
      rewriteFailures.length === 0
        ? `Updated ${rewrites.length} file${rewrites.length === 1 ? "" : "s"}.`
        : `${rewriteFailures.length} rewrite failure${rewriteFailures.length === 1 ? "" : "s"}.`,
  });

  return {
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    checks,
  };
}

async function verifyRenamedPaths(
  outputRepoPath: string,
  proposals: PlannedRename[],
): Promise<{ ok: boolean; details: string }> {
  const missingTargets: string[] = [];

  for (const proposal of proposals) {
    if (!proposal.applied) {
      continue;
    }

    const targetRelativePath = targetRelativePathForProposal(proposal);
    const targetAbsolutePath = path.join(
      outputRepoPath,
      ...targetRelativePath.split("/"),
    );

    if (!(await pathExists(targetAbsolutePath))) {
      missingTargets.push(targetRelativePath);
    }
  }

  if (missingTargets.length > 0) {
    return {
      ok: false,
      details: `Missing renamed output paths: ${missingTargets.join(", ")}`,
    };
  }

  return {
    ok: true,
    details: "All applied rename targets exist in the output repo.",
  };
}

async function writePrincessArtifacts(
  plan: RenamePlan,
  manifest: RunManifest,
): Promise<void> {
  const princessDir = path.join(plan.outputRepoPath, ".princess");
  await mkdir(princessDir, { recursive: true });
  await writeJson(path.join(princessDir, "rename-plan.json"), plan);
  await writeJson(path.join(princessDir, "run-manifest.json"), manifest);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function walkFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  await walkFilesRecursive(rootPath, rootPath, files);

  return files.sort();
}

function buildRenameEntries(proposals: PlannedRename[]): RenameEntry[] {
  return proposals
    .filter((proposal) => proposal.applied)
    .map((proposal) => ({
      from: proposal.relativePath,
      to: targetRelativePathForProposal(proposal),
    }))
    .sort((left, right) => right.from.length - left.from.length);
}

function applyRenameMapToPath(relativePath: string, entries: RenameEntry[]): string {
  const normalized = normalizePosixPath(relativePath);

  for (const entry of entries) {
    if (normalized === entry.from) {
      return entry.to;
    }

    if (normalized.startsWith(`${entry.from}/`)) {
      return `${entry.to}${normalized.slice(entry.from.length)}`;
    }
  }

  return normalized;
}

function targetRelativePathForProposal(proposal: PlannedRename): string {
  const parentPath = path.posix.dirname(proposal.relativePath);
  return parentPath === "."
    ? proposal.proposedName
    : `${parentPath}/${proposal.proposedName}`;
}

function normalizeRelativeSpecifier(value: string): string {
  const normalized = normalizePosixPath(value);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function splitSpecifierSuffix(specifier: string): [string, string?] {
  const match = specifier.match(/^([^?#]*)([?#].*)?$/);

  if (!match) {
    return [specifier];
  }

  return [match[1], match[2]];
}

function splitPathValueDecorations(value: string): [string, string?] {
  const index = value.search(/[*?#]/);

  if (index === -1) {
    return [value];
  }

  return [value.slice(0, index), value.slice(index)];
}

function shouldCopyPath(input: {
  sourcePath: string;
  rootPath: string;
  preserveGit: boolean;
}): boolean {
  if (input.preserveGit) {
    return true;
  }

  const relativePath = normalizePosixPath(
    path.relative(input.rootPath, input.sourcePath),
  );

  return relativePath !== ".git" && !relativePath.startsWith(".git/");
}

function isIgnoredInternalPath(rootPath: string, absolutePath: string): boolean {
  const relativePath = normalizePosixPath(path.relative(rootPath, absolutePath));
  return relativePath.startsWith(".git/") || relativePath.startsWith(".princess/");
}

function depthOf(relativePath: string): number {
  return normalizePosixPath(relativePath).split("/").length;
}

function normalizePosixPath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function clonePlannedRenames(proposals: PlannedRename[]): PlannedRename[] {
  return proposals.map((proposal) => ({ ...proposal }));
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

interface RenameEntry {
  from: string;
  to: string;
}

function isStructuredConfigFile(relativeSourcePath: string): boolean {
  return STRUCTURED_CONFIG_FILES.has(path.posix.basename(relativeSourcePath));
}

function isScriptConfigFile(relativeSourcePath: string): boolean {
  return SCRIPT_CONFIG_FILE_PATTERN.test(relativeSourcePath);
}

function shouldRewriteStructuredConfigString(keyPath: string[]): boolean {
  const filteredPath = keyPath.filter((segment) => !/^\d+$/.test(segment));
  const joined = filteredPath.join(".");

  return [
    "compilerOptions.baseUrl",
    "compilerOptions.paths",
    "include",
    "exclude",
    "files",
    "references.path",
    "extends",
  ].some((candidate) => joined === candidate || joined.startsWith(`${candidate}.`));
}

function looksLikePathValue(value: string): boolean {
  if (!value || /\s/.test(value) || value.includes("://")) {
    return false;
  }

  if (value.startsWith(".")) {
    return true;
  }

  return /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.@*-]+)+$/.test(value);
}

async function walkFilesRecursive(
  rootPath: string,
  currentPath: string,
  files: string[],
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);

    if (isIgnoredInternalPath(rootPath, absolutePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkFilesRecursive(rootPath, absolutePath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
}
