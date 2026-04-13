import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FolderDossier, RepoSummary } from "./contracts";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
  ".vercel",
  ".idea",
  ".DS_Store",
]);

const INSTRUCTION_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "copilot-instructions.md",
  ".cursorrules",
  ".windsurfrules",
]);

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".vue",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
]);

export interface AnalyzeRepositoryOptions {
  includeHidden?: boolean;
  maxDepth?: number;
}

export interface AnalyzeRepositoryResult {
  repoSummary: RepoSummary;
  dossiers: FolderDossier[];
}

interface DirectoryNode {
  absPath: string;
  relativePath: string;
  currentName: string;
  parentPath: string;
  childDirectories: string[];
  representativeFiles: string[];
  extensionCounts: Record<string, number>;
  frameworkHints: string[];
  testHints: string[];
  instructionFiles: string[];
  staticSummary: string;
  childNodes: DirectoryNode[];
}

interface FileInspection {
  frameworkHints: string[];
  testHints: string[];
}

export async function analyzeRepository(
  sourceRepoPath: string,
  options: AnalyzeRepositoryOptions = {},
): Promise<AnalyzeRepositoryResult> {
  const rootStats = await stat(sourceRepoPath);

  if (!rootStats.isDirectory()) {
    throw new Error(`Source path is not a directory: ${sourceRepoPath}`);
  }

  const rootNode = await scanDirectory(sourceRepoPath, sourceRepoPath, 0, {
    includeHidden: options.includeHidden ?? false,
    maxDepth: options.maxDepth ?? Number.POSITIVE_INFINITY,
  });

  const dossiers = flattenDirectoryTree(rootNode).filter(
    (entry) => entry.relativePath !== ".",
  );

  return {
    repoSummary: buildRepoSummary(rootNode, dossiers),
    dossiers,
  };
}

async function scanDirectory(
  absPath: string,
  rootPath: string,
  depth: number,
  options: Required<AnalyzeRepositoryOptions>,
): Promise<DirectoryNode> {
  const relativePath = normalizeRelativePath(path.relative(rootPath, absPath));
  const currentName = relativePath === "." ? path.basename(absPath) : path.basename(relativePath);
  const parentPath =
    relativePath === "." ? "." : normalizeRelativePath(path.dirname(relativePath));

  const entries = (await readdir(absPath, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const childNodes: DirectoryNode[] = [];
  const localFiles: string[] = [];
  const localInstructionFiles: string[] = [];
  const localFrameworkHints = new Set<string>();
  const localTestHints = new Set<string>();
  const extensionCounts: Record<string, number> = {};

  let inspectedTextFiles = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name, options.includeHidden)) {
        continue;
      }

      if (depth + 1 > options.maxDepth) {
        continue;
      }

      const childPath = path.join(absPath, entry.name);
      const childNode = await scanDirectory(childPath, rootPath, depth + 1, options);
      childNodes.push(childNode);
      mergeCounts(extensionCounts, childNode.extensionCounts);

      for (const hint of childNode.frameworkHints) {
        localFrameworkHints.add(hint);
      }

      for (const hint of childNode.testHints) {
        localTestHints.add(hint);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    localFiles.push(entry.name);

    if (INSTRUCTION_FILES.has(entry.name)) {
      localInstructionFiles.push(entry.name);
    }

    const extension = path.extname(entry.name).toLowerCase() || "[no-ext]";
    extensionCounts[extension] = (extensionCounts[extension] ?? 0) + 1;

    if (isTestFileName(entry.name)) {
      localTestHints.add("contains-test-files");
    }

    if (isRouteFileName(entry.name)) {
      localFrameworkHints.add("route-files");
    }

    if (inspectedTextFiles >= 8 || !TEXT_EXTENSIONS.has(extension)) {
      continue;
    }

    inspectedTextFiles += 1;

    const inspection = await inspectFile(path.join(absPath, entry.name));

    for (const hint of inspection.frameworkHints) {
      localFrameworkHints.add(hint);
    }

    for (const hint of inspection.testHints) {
      localTestHints.add(hint);
    }
  }

  const childDirectories = childNodes.map((node) => node.currentName);
  const representativeFiles = pickRepresentativeFiles(localFiles, childNodes);
  const frameworkHints = Array.from(localFrameworkHints).sort();
  const testHints = Array.from(localTestHints).sort();

  if (
    !frameworkHints.includes("react") &&
    (extensionCounts[".ts"] || extensionCounts[".tsx"] || extensionCounts[".js"] || extensionCounts[".jsx"])
  ) {
    frameworkHints.push("no-react-imports");
  }

  return {
    absPath,
    relativePath,
    currentName,
    parentPath,
    childDirectories,
    representativeFiles,
    extensionCounts,
    frameworkHints: frameworkHints.sort(),
    testHints,
    instructionFiles: localInstructionFiles.sort(),
    staticSummary: buildStaticSummary(
      childDirectories,
      representativeFiles,
      extensionCounts,
      frameworkHints,
      testHints,
    ),
    childNodes,
  };
}

async function inspectFile(filePath: string): Promise<FileInspection> {
  const contents = await readFile(filePath, "utf8").catch(() => "");
  const sample = contents.slice(0, 4000);
  const frameworkHints = new Set<string>();
  const testHints = new Set<string>();
  const extension = path.extname(filePath).toLowerCase();

  if (
    /from\s+["']react["']/.test(sample) ||
    /from\s+["']react\/jsx-runtime["']/.test(sample) ||
    /\buseState\b|\buseEffect\b|\buseMemo\b/.test(sample) ||
    ((extension === ".tsx" || extension === ".jsx") &&
      (/<[A-Za-z][^>]*>/.test(sample) || /return\s*\(/.test(sample)))
  ) {
    frameworkHints.add("react");
  }

  if (/<template|defineComponent|script setup/.test(sample)) {
    frameworkHints.add("vue");
  }

  if (/@generated|generated file|codegen/i.test(sample)) {
    frameworkHints.add("generated-content");
  }

  if (/describe\s*\(|it\s*\(|test\s*\(/.test(sample)) {
    testHints.add("contains-test-calls");
  }

  return {
    frameworkHints: Array.from(frameworkHints),
    testHints: Array.from(testHints),
  };
}

function flattenDirectoryTree(node: DirectoryNode): FolderDossier[] {
  const here: FolderDossier = {
    relativePath: node.relativePath,
    currentName: node.currentName,
    parentPath: node.parentPath,
    childDirectories: node.childDirectories,
    representativeFiles: node.representativeFiles,
    extensionCounts: node.extensionCounts,
    frameworkHints: node.frameworkHints,
    testHints: node.testHints,
    instructionFiles: node.instructionFiles,
    staticSummary: node.staticSummary,
  };

  return [here, ...node.childNodes.flatMap(flattenDirectoryTree)];
}

function buildRepoSummary(
  rootNode: DirectoryNode,
  dossiers: FolderDossier[],
): RepoSummary {
  const detectedStack = new Set<string>();
  const rootFiles = new Set(rootNode.representativeFiles);
  const allHints = new Set(dossiers.flatMap((entry) => entry.frameworkHints));
  const allExtensions = mergeExtensionCounts(dossiers);

  if (rootFiles.has("package.json")) {
    detectedStack.add("javascript");
  }

  if (rootFiles.has("tsconfig.json") || allExtensions[".ts"] || allExtensions[".tsx"]) {
    detectedStack.add("typescript");
  }

  if (rootFiles.has("bun.lock") || rootFiles.has("bun.lockb") || rootFiles.has("bunfig.toml")) {
    detectedStack.add("bun");
  }

  if (rootFiles.has("vite.config.ts") || rootFiles.has("vite.config.js")) {
    detectedStack.add("vite");
  }

  if (rootFiles.has("next.config.ts") || rootFiles.has("next.config.js")) {
    detectedStack.add("nextjs");
  }

  if (rootFiles.has("vitest.config.ts") || rootFiles.has("vitest.config.js")) {
    detectedStack.add("vitest");
  }

  if (rootFiles.has("jest.config.ts") || rootFiles.has("jest.config.js")) {
    detectedStack.add("jest");
  }

  if (allHints.has("react") || allExtensions[".tsx"] || allExtensions[".jsx"]) {
    detectedStack.add("react");
  }

  if (allHints.has("vue") || allExtensions[".vue"]) {
    detectedStack.add("vue");
  }

  return {
    rootName: rootNode.currentName,
    detectedStack: Array.from(detectedStack),
    namingStyle: detectNamingStyle(dossiers),
    notes: [
      "Dry-run mode does not copy or rename anything.",
      "Rename proposals are currently generated by the heuristic engine unless model inference is wired.",
    ],
  };
}

function detectNamingStyle(dossiers: FolderDossier[]): string {
  const counts = {
    kebab: 0,
    snake: 0,
    camel: 0,
    pascal: 0,
    plain: 0,
  };

  for (const dossier of dossiers) {
    const name = dossier.currentName;

    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name)) {
      counts.kebab += 1;
      continue;
    }

    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name)) {
      counts.snake += 1;
      continue;
    }

    if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(name)) {
      counts.camel += 1;
      continue;
    }

    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      counts.pascal += 1;
      continue;
    }

    counts.plain += 1;
  }

  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  if (!winner || winner[1] === 0) {
    return "mixed";
  }

  const total = dossiers.length || 1;

  return winner[1] / total >= 0.6 ? winner[0] : "mixed";
}

function pickRepresentativeFiles(localFiles: string[], childNodes: DirectoryNode[]): string[] {
  const representatives = localFiles.slice(0, 5);

  if (representatives.length >= 5) {
    return representatives;
  }

  const inherited = childNodes.flatMap((node) => node.representativeFiles);

  for (const fileName of inherited) {
    if (representatives.length >= 5) {
      break;
    }

    if (!representatives.includes(fileName)) {
      representatives.push(fileName);
    }
  }

  return representatives;
}

function buildStaticSummary(
  childDirectories: string[],
  representativeFiles: string[],
  extensionCounts: Record<string, number>,
  frameworkHints: string[],
  testHints: string[],
): string {
  const summaryParts: string[] = [];
  const topExtensions = Object.entries(extensionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([extension]) => extension);

  if (childDirectories.length > 0) {
    summaryParts.push(`${childDirectories.length} child directories`);
  }

  if (representativeFiles.length > 0) {
    summaryParts.push(`representative files: ${representativeFiles.slice(0, 3).join(", ")}`);
  }

  if (topExtensions.length > 0) {
    summaryParts.push(`dominant extensions: ${topExtensions.join(", ")}`);
  }

  if (frameworkHints.length > 0) {
    summaryParts.push(`framework hints: ${frameworkHints.slice(0, 3).join(", ")}`);
  }

  if (testHints.length > 0) {
    summaryParts.push(`test hints: ${testHints.slice(0, 2).join(", ")}`);
  }

  return summaryParts.join("; ");
}

function mergeCounts(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function mergeExtensionCounts(dossiers: FolderDossier[]): Record<string, number> {
  const merged: Record<string, number> = {};

  for (const dossier of dossiers) {
    mergeCounts(merged, dossier.extensionCounts);
  }

  return merged;
}

function shouldSkipDirectory(name: string, includeHidden: boolean): boolean {
  if (IGNORED_DIRECTORIES.has(name)) {
    return true;
  }

  if (!includeHidden && name.startsWith(".")) {
    return true;
  }

  return false;
}

function isTestFileName(fileName: string): boolean {
  return /\.test\.[a-z0-9]+$/i.test(fileName) || /\.spec\.[a-z0-9]+$/i.test(fileName);
}

function isRouteFileName(fileName: string): boolean {
  return /^(page|layout|loading|route)\.[a-z0-9]+$/i.test(fileName);
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized.length === 0 ? "." : normalized;
}
