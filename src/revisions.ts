import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { getPaths } from "./paths.ts";

export interface PromptRevision {
  path: string;
  createdAt: string;
  content: string;
  added?: number;
  removed?: number;
}

function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function getRevisionBaseDir(filePath: string, paths = getPaths()): string {
  const relativePath = path.relative(paths.inboxDir, filePath);
  if (!relativePath || relativePath.startsWith("..")) {
    return path.join(paths.dataDir, "revisions", "external", path.basename(filePath));
  }
  return path.join(paths.dataDir, "revisions", relativePath);
}

export function getPromptRevisionDir(filePath: string, paths = getPaths()): string {
  return getRevisionBaseDir(filePath, paths);
}

export async function recordPromptRevision(
  filePath: string,
  previousContent: string,
  paths = getPaths(),
): Promise<string | null> {
  if (!previousContent.trim()) return null;

  const latest = await readLatestPromptRevision(filePath, paths);
  if (latest && latest.content === previousContent) {
    return null;
  }

  const revisionDir = getRevisionBaseDir(filePath, paths);
  await mkdir(revisionDir, { recursive: true });

  const revisionPath = path.join(revisionDir, `${safeTimestamp()}.md`);
  await writeFile(revisionPath, previousContent, "utf8");
  return revisionPath;
}

function calculateDeltas(oldText: string, newText: string) {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);

  let added = 0;
  let removed = 0;

  // Extremely simple line-based delta for summary
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  return { added, removed };
}

export async function listPromptRevisions(filePath: string, paths = getPaths()): Promise<PromptRevision[]> {
  const revisionDir = getRevisionBaseDir(filePath, paths);
  const entries = await readdir(revisionDir, { withFileTypes: true }).catch(() => []);

  let revisions: PromptRevision[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const revisionPath = path.join(revisionDir, entry.name);
    const content = await readFile(revisionPath, "utf8").catch(() => "");
    revisions.push({
      path: revisionPath,
      createdAt: entry.name.replace(/\.md$/, ""),
      content,
    });
  }

  revisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Calculate deltas from previous
  for (let i = 1; i < revisions.length; i++) {
    const deltas = calculateDeltas(revisions[i - 1].content, revisions[i].content);
    revisions[i].added = deltas.added;
    revisions[i].removed = deltas.removed;
  }

  revisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return revisions;
}

export async function readLatestPromptRevision(filePath: string, paths = getPaths()): Promise<PromptRevision | null> {
  const revisions = await listPromptRevisions(filePath, paths);
  return revisions[0] ?? null;
}
