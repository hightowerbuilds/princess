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

export async function executeRenamePlan(
  plan: RenamePlan,
  options: ApplyOptions = {},
): Promise<RunManifest> {
  await prepareOutputRepo(plan, options);

  const proposals = clonePlannedRenames(plan.proposals);
  await applyDirectoryRenames(plan.outputRepoPath, proposals);

  const rewrites = await rewriteRelativeImports({
    sourceRepoPath: plan.sourceRepoPath,
    outputRepoPath: plan.outputRepoPath,
    proposals,
  });

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
): Promise<void> {
  const appliedRenames = proposals
    .filter((proposal) => proposal.applied)
    .sort((left, right) => depthOf(right.relativePath) - depthOf(left.relativePath));

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
  }
}

async function rewriteRelativeImports(input: {
  sourceRepoPath: string;
  outputRepoPath: string;
  proposals: PlannedRename[];
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
