import path from "node:path";
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { getPaths } from "./paths.ts";
import { sanitizePromptTitle } from "./prompts.ts";
import { atomicWriteFile } from "./storage.ts";
import { withFileLock, type WithFileLockOptions } from "./file-lock.ts";

export type HtmlPromptResourceType = "source" | "asset" | "table";
export type HtmlPromptTrust = "trusted" | "untrusted";
export type HtmlPromptCompileTarget = "html" | "markdown" | "json";
export type HtmlPromptSectionMode = "text" | "html";

export interface HtmlPromptResource {
  id: string;
  type: HtmlPromptResourceType;
  path: string;
  originalPath?: string;
  mediaType?: string;
  alt?: string;
  trust?: HtmlPromptTrust;
  addedAt: string;
}

export interface HtmlPromptManifest {
  version: 1;
  format: "html";
  title: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  resources: HtmlPromptResource[];
}

export interface HtmlPromptLintIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface HtmlPromptWorkspace {
  path: string;
  manifest: HtmlPromptManifest;
}

export interface CompiledHtmlPromptPackage {
  version: 1;
  format: "princess-html-compiled";
  title: string;
  workspacePath: string;
  prompt: {
    mediaType: "text/html";
    content: string;
  };
  attachments: Array<{
    id: string;
    type: "asset";
    path: string;
    mediaType: string;
    alt: string;
  }>;
  resources: HtmlPromptResource[];
}

const MANIFEST_FILE = "manifest.json";
const PROMPT_FILE = "prompt.html";
const RESOURCE_MARKER = "<!-- princess:resources -->";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRelativeSubpath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (path.isAbsolute(trimmed)) throw new Error(`${label} must be relative to the Princess inbox.`);

  const normalized = path.normalize(trimmed);
  if (normalized === "." || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must stay inside the Princess inbox.`);
  }
  return normalized;
}

function ensureInside(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes Princess inbox: ${candidate}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTrust(value?: string): HtmlPromptTrust {
  if (value === undefined || value === "") return "untrusted";
  if (value === "trusted" || value === "untrusted") return value;
  throw new Error(`Invalid trust level "${value}". Use "trusted" or "untrusted".`);
}

function mediaTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "text/markdown";
  if (ext === ".html" || ext === ".htm") return "text/html";
  if (ext === ".txt") return "text/plain";
  if (ext === ".csv") return "text/csv";
  if (ext === ".tsv") return "text/tab-separated-values";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function resourceIdFromName(name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  return sanitizePromptTitle(base);
}

function slugifySectionRole(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeSectionRole(role: string): string {
  const normalized = slugifySectionRole(role);
  if (!normalized) {
    throw new Error(`Invalid section role "${role}". Use at least one letter or number.`);
  }
  return normalized;
}

function titleForRole(role: string): string {
  return role
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function textToHtmlParagraphs(content: string): string {
  const blocks = content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return "<p></p>";

  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n      ");
}

function sectionForContent(
  role: string,
  content: string,
  options: { heading?: string; mode?: HtmlPromptSectionMode } = {},
): string {
  const safeRole = escapeHtml(role);
  const heading = escapeHtml(options.heading?.trim() || titleForRole(role));
  const body = options.mode === "html" ? content.trim() || "<p></p>" : textToHtmlParagraphs(content);

  return `<section data-princess-role="${safeRole}">
      <h2>${heading}</h2>
      ${body}
    </section>`;
}

function uniqueResourceId(manifest: HtmlPromptManifest, requested: string): string {
  const base = sanitizePromptTitle(requested);
  const existing = new Set(manifest.resources.map((resource) => resource.id));
  if (!existing.has(base)) return base;

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index++;
  }
  return `${base}-${index}`;
}

function relativeForWorkspace(workspaceDir: string, filePath: string): string {
  return path.relative(workspaceDir, filePath).split(path.sep).join("/");
}

function buildDefaultHtmlPrompt(title: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
</head>
<body>
  <main data-princess-prompt>
    <section data-princess-role="instructions">
      <h1>${safeTitle}</h1>
      <p>Write the task, constraints, and expected output here.</p>
    </section>

    <section data-princess-role="resources">
      <h2>Resources</h2>
      ${RESOURCE_MARKER}
    </section>
  </main>
</body>
</html>
`;
}

function manifestPath(workspaceDir: string): string {
  return path.join(workspaceDir, MANIFEST_FILE);
}

function promptPath(workspaceDir: string): string {
  return path.join(workspaceDir, PROMPT_FILE);
}

export function resolveHtmlPromptWorkspace(workspaceRef: string, paths = getPaths()): string {
  const normalized = normalizeRelativeSubpath(workspaceRef, "workspace");
  const withoutPromptFile = path.basename(normalized) === PROMPT_FILE ? path.dirname(normalized) : normalized;
  const workspaceDir = path.join(paths.inboxDir, withoutPromptFile);
  ensureInside(paths.inboxDir, workspaceDir);
  return workspaceDir;
}

export async function readHtmlPromptManifest(workspaceDir: string): Promise<HtmlPromptManifest> {
  const targetPath = manifestPath(workspaceDir);
  let content: string;
  try {
    content = await readFile(targetPath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      throw new Error(`HTML prompt workspace manifest not found: ${targetPath}`);
    }
    throw error;
  }

  let parsed: HtmlPromptManifest;
  try {
    parsed = JSON.parse(content) as HtmlPromptManifest;
  } catch {
    throw new Error(`Invalid Princess HTML prompt manifest at ${targetPath}`);
  }
  if (parsed.format !== "html" || parsed.version !== 1 || !Array.isArray(parsed.resources)) {
    throw new Error(`Invalid Princess HTML prompt manifest at ${targetPath}`);
  }
  return parsed;
}

async function writeHtmlPromptManifest(workspaceDir: string, manifest: HtmlPromptManifest): Promise<void> {
  manifest.updatedAt = nowIso();
  await atomicWriteFile(manifestPath(workspaceDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readWorkspace(workspaceRef: string): Promise<HtmlPromptWorkspace> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  const manifest = await readHtmlPromptManifest(workspaceDir);
  return { path: workspaceDir, manifest };
}

const WORKSPACE_LOCK_FILENAME = ".princess.lock";

function workspaceLockPath(workspaceDir: string): string {
  return path.join(workspaceDir, WORKSPACE_LOCK_FILENAME);
}

function workspaceRefFor(workspaceDir: string): string {
  const relative = path.relative(getPaths().inboxDir, workspaceDir);
  return relative.split(path.sep).join("/");
}

export async function withWorkspaceLock<T>(
  workspaceDir: string,
  work: () => Promise<T>,
  options: Pick<WithFileLockOptions, "timeoutMs" | "staleAfterMs"> = {},
): Promise<T> {
  try {
    return await withFileLock(workspaceLockPath(workspaceDir), work, options);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") {
      throw new Error(`HTML prompt workspace not found: ${workspaceDir}`);
    }
    if (err instanceof Error && err.message.startsWith("Timed out after ")) {
      throw new Error(
        `Another writer is updating workspace "${workspaceRefFor(workspaceDir)}". Try again in a moment.`,
      );
    }
    throw err;
  }
}

async function appendResourceReference(workspaceDir: string, snippet: string): Promise<void> {
  const filePath = promptPath(workspaceDir);
  const existing = await readFile(filePath, "utf8");
  const insertion = `${snippet}\n      ${RESOURCE_MARKER}`;
  const next = existing.includes(RESOURCE_MARKER)
    ? existing.replace(RESOURCE_MARKER, insertion)
    : `${existing.trimEnd()}\n\n${snippet}\n`;
  await atomicWriteFile(filePath, next);
}

async function removeResourceReference(
  workspaceDir: string,
  resource: HtmlPromptResource,
): Promise<void> {
  const filePath = promptPath(workspaceDir);
  const existing = await readFile(filePath, "utf8");
  const id = escapeRegExp(resource.id);
  const type = escapeRegExp(resource.type);
  const re = new RegExp(
    `\\n?\\s*<(section|figure)\\b(?=[^>]*data-princess-resource=["']${type}["'])(?=[^>]*data-princess-id=["']${id}["'])[^>]*>[\\s\\S]*?</\\1>\\s*`,
    "g",
  );
  const next = existing.replace(re, "\n");
  if (next !== existing) {
    await atomicWriteFile(filePath, next);
  }
}

function sourceSnippet(resource: HtmlPromptResource): string {
  const title = escapeHtml(path.basename(resource.path));
  return `<section data-princess-resource="source" data-princess-id="${escapeHtml(resource.id)}">
        <h3>Source: ${title}</h3>
        <p data-princess-trust="${resource.trust ?? "untrusted"}">${resource.trust ?? "untrusted"} local source</p>
        <pre data-princess-include="${escapeHtml(resource.id)}"></pre>
      </section>`;
}

function assetSnippet(resource: HtmlPromptResource): string {
  const alt = escapeHtml(resource.alt ?? path.basename(resource.path));
  return `<figure data-princess-resource="asset" data-princess-id="${escapeHtml(resource.id)}">
        <img src="${escapeHtml(resource.path)}" alt="${alt}">
        <figcaption>${alt}</figcaption>
      </figure>`;
}

function tableSnippet(resource: HtmlPromptResource): string {
  const title = escapeHtml(path.basename(resource.path));
  return ` <section data-princess-resource="table" data-princess-id="${escapeHtml(resource.id)}">
        <h3>Table: ${title}</h3>
        <div data-princess-include-html="${escapeHtml(resource.id)}"></div>
      </section>`;
}

async function copyIntoWorkspace(
  workspaceDir: string,
  sourcePath: string,
  subdir: string,
  id: string,
): Promise<string> {
  const absoluteSource = path.resolve(sourcePath);
  const sourceStat = await stat(absoluteSource).catch((error) => {
    if ((error as { code?: string }).code === "ENOENT") {
      throw new Error(`Source file not found: ${absoluteSource}`);
    }
    throw error;
  });
  if (!sourceStat.isFile()) throw new Error(`Source is not a file: ${sourcePath}`);

  const ext = path.extname(absoluteSource);
  const targetDir = path.join(workspaceDir, subdir);
  await mkdir(targetDir, { recursive: true });

  const destination = path.join(targetDir, `${id}${ext}`);
  await copyFile(absoluteSource, destination);
  return relativeForWorkspace(workspaceDir, destination);
}

export async function createHtmlPromptWorkspace(
  title: string,
  options: { category?: string } = {},
): Promise<HtmlPromptWorkspace> {
  const paths = getPaths();
  const baseSlug = sanitizePromptTitle(title);
  const category = options.category?.trim() ? normalizeRelativeSubpath(options.category, "category") : "";
  const parentDir = path.join(paths.inboxDir, category);

  let slug = baseSlug;
  let workspaceDir = path.join(parentDir, slug);
  let suffix = 2;
  while (await stat(workspaceDir).then(() => true).catch(() => false)) {
    slug = `${baseSlug}-${suffix}`;
    workspaceDir = path.join(parentDir, slug);
    suffix++;
  }
  ensureInside(paths.inboxDir, workspaceDir);

  await mkdir(path.join(workspaceDir, "assets"), { recursive: true });
  await mkdir(path.join(workspaceDir, "sources"), { recursive: true });
  await mkdir(path.join(workspaceDir, "partials"), { recursive: true });
  await mkdir(path.join(workspaceDir, "dist"), { recursive: true });

  const createdAt = nowIso();
  const manifest: HtmlPromptManifest = {
    version: 1,
    format: "html",
    title,
    slug,
    createdAt,
    updatedAt: createdAt,
    resources: [],
  };

  await writeFile(promptPath(workspaceDir), buildDefaultHtmlPrompt(title), { flag: "wx" });
  await writeFile(manifestPath(workspaceDir), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { path: workspaceDir, manifest };
}

export async function addHtmlPromptSource(
  workspaceRef: string,
  sourcePath: string,
  options: { name?: string; trust?: string } = {},
): Promise<HtmlPromptResource> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const workspace = await readWorkspace(workspaceRef);
    const requestedId = options.name?.trim() || resourceIdFromName(sourcePath);
    const id = uniqueResourceId(workspace.manifest, requestedId);
    const resourcePath = await copyIntoWorkspace(workspace.path, sourcePath, "sources", id);
    const resource: HtmlPromptResource = {
      id,
      type: "source",
      path: resourcePath,
      originalPath: path.resolve(sourcePath),
      mediaType: mediaTypeFor(sourcePath),
      trust: normalizeTrust(options.trust),
      addedAt: nowIso(),
    };

    workspace.manifest.resources.push(resource);
    await writeHtmlPromptManifest(workspace.path, workspace.manifest);
    await appendResourceReference(workspace.path, sourceSnippet(resource));
    return resource;
  });
}

export async function addHtmlPromptAsset(
  workspaceRef: string,
  assetPath: string,
  options: { name?: string; alt?: string } = {},
): Promise<HtmlPromptResource> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const workspace = await readWorkspace(workspaceRef);
    const requestedId = options.name?.trim() || resourceIdFromName(assetPath);
    const id = uniqueResourceId(workspace.manifest, requestedId);
    const resourcePath = await copyIntoWorkspace(workspace.path, assetPath, "assets", id);
    const resource: HtmlPromptResource = {
      id,
      type: "asset",
      path: resourcePath,
      originalPath: path.resolve(assetPath),
      mediaType: mediaTypeFor(assetPath),
      alt: options.alt?.trim() || path.basename(assetPath),
      addedAt: nowIso(),
    };

    workspace.manifest.resources.push(resource);
    await writeHtmlPromptManifest(workspace.path, workspace.manifest);
    await appendResourceReference(workspace.path, assetSnippet(resource));
    return resource;
  });
}

function parseDelimitedRows(content: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        throw new Error("Malformed table source: unexpected quote inside an unquoted field.");
      }
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("Malformed table source: unterminated quoted field.");
  }

  row.push(field);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function rowsToHtmlTable(rows: string[][]): string {
  if (rows.length === 0) throw new Error("Table source is empty.");
  const [headers, ...body] = rows;
  if (headers.length === 0) throw new Error("Table source must include at least one column.");
  body.forEach((row, index) => {
    if (row.length !== headers.length) {
      throw new Error(
        `Malformed table source: row ${index + 2} has ${row.length} cells; expected ${headers.length}.`,
      );
    }
  });
  const headerHtml = headers.map((cell) => `<th>${escapeHtml(cell.trim())}</th>`).join("");
  const bodyHtml = body
    .map((row) => `    <tr>${row.map((cell) => `<td>${escapeHtml(cell.trim())}</td>`).join("")}</tr>`)
    .join("\n");

  return `<table>
  <thead>
    <tr>${headerHtml}</tr>
  </thead>
  <tbody>
${bodyHtml}
  </tbody>
</table>
`;
}

export async function importHtmlPromptTable(
  workspaceRef: string,
  tablePath: string,
  options: { name?: string; trust?: string } = {},
): Promise<HtmlPromptResource> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const workspace = await readWorkspace(workspaceRef);
    const requestedId = options.name?.trim() || resourceIdFromName(tablePath);
    const id = uniqueResourceId(workspace.manifest, requestedId);
    const absoluteTablePath = path.resolve(tablePath);
    const content = await readFile(absoluteTablePath, "utf8").catch((error) => {
      if ((error as { code?: string }).code === "ENOENT") {
        throw new Error(`Table source file not found: ${absoluteTablePath}`);
      }
      throw error;
    });
    const delimiter = path.extname(tablePath).toLowerCase() === ".tsv" ? "\t" : ",";
    let tableHtml: string;
    try {
      tableHtml = rowsToHtmlTable(parseDelimitedRows(content, delimiter));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to import table "${absoluteTablePath}": ${message}`);
    }

    const targetDir = path.join(workspace.path, "partials");
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, `${id}.table.html`);
    await atomicWriteFile(targetPath, tableHtml);

    const resource: HtmlPromptResource = {
      id,
      type: "table",
      path: relativeForWorkspace(workspace.path, targetPath),
      originalPath: path.resolve(tablePath),
      mediaType: "text/html",
      trust: normalizeTrust(options.trust),
      addedAt: nowIso(),
    };

    workspace.manifest.resources.push(resource);
    await writeHtmlPromptManifest(workspace.path, workspace.manifest);
    await appendResourceReference(workspace.path, tableSnippet(resource));
    return resource;
  });
}

export async function upsertHtmlPromptSection(
  workspaceRef: string,
  role: string,
  content: string,
  options: { heading?: string; mode?: HtmlPromptSectionMode } = {},
): Promise<void> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const workspace = await readWorkspace(workspaceRef);
    const normalizedRole = normalizeSectionRole(role);
    const mode = options.mode ?? "text";
    if (mode !== "text" && mode !== "html") {
      throw new Error(`Invalid section mode "${mode}". Use "text" or "html".`);
    }

    const filePath = promptPath(workspace.path);
    const existing = await readFile(filePath, "utf8");
    const nextSection = sectionForContent(normalizedRole, content, {
      heading: options.heading,
      mode,
    });

    const sectionRe = new RegExp(
      `\\s*<section\\b(?=[^>]*data-princess-role=["']${escapeRegExp(normalizedRole)}["'])[^>]*>[\\s\\S]*?</section>\\s*`,
      "g",
    );

    if (sectionRe.test(existing)) {
      await atomicWriteFile(filePath, `${existing.replace(sectionRe, `\n    ${nextSection}\n`)}`);
      return;
    }

    const resourcesRe = /\n\s*<section\b(?=[^>]*data-princess-role=["']resources["'])/;
    if (resourcesRe.test(existing)) {
      await atomicWriteFile(filePath, existing.replace(resourcesRe, `\n\n    ${nextSection}$&`));
      return;
    }

    if (existing.includes("</main>")) {
      await atomicWriteFile(filePath, existing.replace("</main>", `    ${nextSection}\n  </main>`));
      return;
    }

    await atomicWriteFile(filePath, `${existing.trimEnd()}\n\n${nextSection}\n`);
  });
}

export async function readHtmlPromptSource(workspaceRef: string): Promise<string> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return readFile(promptPath(workspaceDir), "utf8");
}

export async function listHtmlPromptResources(workspaceRef: string): Promise<HtmlPromptResource[]> {
  const workspace = await readWorkspace(workspaceRef);
  return [...workspace.manifest.resources];
}

export interface HtmlPromptSection {
  role: string;
  heading: string | null;
  html: string;
}

const RESERVED_SECTION_ROLES = new Set(["resources"]);

function findRoleSections(html: string): Array<{
  role: string;
  startIdx: number;
  endIdx: number;
}> {
  const openRe = /<section\b[^>]*data-princess-role=["']([^"']+)["'][^>]*>/g;
  const results: Array<{ role: string; startIdx: number; endIdx: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = openRe.exec(html)) !== null) {
    const role = match[1];
    const startIdx = match.index;
    const afterOpen = openRe.lastIndex;

    const tagRe = /<\/?section\b[^>]*>/g;
    tagRe.lastIndex = afterOpen;
    let depth = 1;
    let inner: RegExpExecArray | null;
    let endIdx = -1;

    while ((inner = tagRe.exec(html)) !== null) {
      if (inner[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          endIdx = tagRe.lastIndex;
          break;
        }
      } else {
        depth++;
      }
    }

    if (endIdx === -1) break;
    results.push({ role, startIdx, endIdx });
    openRe.lastIndex = endIdx;
  }

  return results;
}

function headingFromSectionHtml(sectionHtml: string): string | null {
  const m = sectionHtml.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim() || null;
}

export async function listHtmlPromptSections(workspaceRef: string): Promise<HtmlPromptSection[]> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  const html = await readFile(promptPath(workspaceDir), "utf8");
  return findRoleSections(html).map(({ role, startIdx, endIdx }) => {
    const sectionHtml = html.slice(startIdx, endIdx);
    return { role, heading: headingFromSectionHtml(sectionHtml), html: sectionHtml };
  });
}

export async function getHtmlPromptSection(
  workspaceRef: string,
  role: string,
): Promise<HtmlPromptSection | null> {
  const normalizedRole = normalizeSectionRole(role);
  const sections = await listHtmlPromptSections(workspaceRef);
  return sections.find((s) => s.role === normalizedRole) ?? null;
}

export async function removeHtmlPromptSection(
  workspaceRef: string,
  role: string,
): Promise<boolean> {
  const normalizedRole = normalizeSectionRole(role);
  if (RESERVED_SECTION_ROLES.has(normalizedRole)) {
    throw new Error(`Section "${normalizedRole}" is auto-managed and cannot be removed.`);
  }
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const filePath = promptPath(workspaceDir);
    const html = await readFile(filePath, "utf8");
    const target = findRoleSections(html).find((s) => s.role === normalizedRole);
    if (!target) return false;

    let lead = target.startIdx;
    while (lead > 0 && (html[lead - 1] === " " || html[lead - 1] === "\t")) lead--;
    if (lead > 0 && html[lead - 1] === "\n") lead--;
    let trail = target.endIdx;
    while (trail < html.length && (html[trail] === " " || html[trail] === "\t")) trail++;
    if (trail < html.length && html[trail] === "\n") trail++;

    const next = html.slice(0, lead) + html.slice(trail);
    await atomicWriteFile(filePath, next);
    return true;
  });
}

export type MoveSectionPosition =
  | { before: string }
  | { after: string }
  | { to: number };

export async function moveHtmlPromptSection(
  workspaceRef: string,
  role: string,
  position: MoveSectionPosition,
): Promise<boolean> {
  const normalizedRole = normalizeSectionRole(role);
  if (RESERVED_SECTION_ROLES.has(normalizedRole)) {
    throw new Error(`Section "${normalizedRole}" is auto-managed and cannot be moved.`);
  }
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const filePath = promptPath(workspaceDir);
    const html = await readFile(filePath, "utf8");
    const sections = findRoleSections(html);
    const sourceIdx = sections.findIndex((s) => s.role === normalizedRole);
    if (sourceIdx === -1) return false;

    let targetIdx: number;
    if ("before" in position) {
      const refRole = normalizeSectionRole(position.before);
      const idx = sections.findIndex((s) => s.role === refRole);
      if (idx === -1) throw new Error(`Reference section "${refRole}" not found.`);
      targetIdx = idx;
    } else if ("after" in position) {
      const refRole = normalizeSectionRole(position.after);
      const idx = sections.findIndex((s) => s.role === refRole);
      if (idx === -1) throw new Error(`Reference section "${refRole}" not found.`);
      targetIdx = idx + 1;
    } else {
      targetIdx = Math.max(0, Math.min(position.to, sections.length));
    }

    if (targetIdx === sourceIdx || targetIdx === sourceIdx + 1) return true;

    const reordered = sections.map((s) => ({
      role: s.role,
      text: html.slice(s.startIdx, s.endIdx),
    }));
    const [moved] = reordered.splice(sourceIdx, 1);
    const adjustedTarget = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
    reordered.splice(adjustedTarget, 0, moved);

    const firstStart = sections[0].startIdx;
    const lastEnd = sections[sections.length - 1].endIdx;

    const before = html.slice(0, firstStart);
    const after = html.slice(lastEnd);
    const indentMatch = before.match(/(^|\n)([ \t]+)$/);
    const indent = indentMatch ? indentMatch[2] : "    ";

    const joined = reordered.map((s) => s.text.trim()).join(`\n\n${indent}`);
    const next = `${before}${joined}${after}`;
    await atomicWriteFile(filePath, next);
    return true;
  });
}

export async function removeHtmlPromptResource(
  workspaceRef: string,
  resourceId: string,
  options: { deleteFile?: boolean } = {},
): Promise<HtmlPromptResource | null> {
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  return withWorkspaceLock(workspaceDir, async () => {
    const workspace = await readWorkspace(workspaceRef);
    const index = workspace.manifest.resources.findIndex((resource) => resource.id === resourceId);
    if (index < 0) return null;

    const [resource] = workspace.manifest.resources.splice(index, 1);
    await writeHtmlPromptManifest(workspace.path, workspace.manifest);
    await removeResourceReference(workspace.path, resource);

    if (options.deleteFile) {
      await unlink(path.join(workspace.path, resource.path)).catch(() => {});
    }

    return resource;
  });
}

function resourceById(manifest: HtmlPromptManifest): Map<string, HtmlPromptResource> {
  return new Map(manifest.resources.map((resource) => [resource.id, resource]));
}

async function expandHtmlIncludes(workspaceDir: string, html: string, manifest: HtmlPromptManifest): Promise<string> {
  const byId = resourceById(manifest);
  let compiled = html;

  for (const resource of byId.values()) {
    if (resource.type === "source") {
      const content = await readFile(path.join(workspaceDir, resource.path), "utf8");
      const re = new RegExp(
        `(<pre\\b[^>]*data-princess-include=["']${escapeRegExp(resource.id)}["'][^>]*>)[\\s\\S]*?(</pre>)`,
        "g",
      );
      compiled = compiled.replace(re, `$1\n${escapeHtml(content)}\n$2`);
    }

    if (resource.type === "table") {
      const content = await readFile(path.join(workspaceDir, resource.path), "utf8");
      const re = new RegExp(
        `<div\\b[^>]*data-princess-include-html=["']${escapeRegExp(resource.id)}["'][^>]*>\\s*</div>`,
        "g",
      );
      compiled = compiled.replace(re, content.trim());
    }
  }

  return `<!-- Compiled by Princess. Attach asset files separately when the target model requires typed file inputs. -->\n${compiled}`;
}

function markdownForCompiledHtml(
  workspaceDir: string,
  manifest: HtmlPromptManifest,
  compiledHtml: string,
): string {
  let fence = "```";
  while (compiledHtml.includes(fence)) {
    fence += "`";
  }

  const assets = manifest.resources.filter((resource) => resource.type === "asset");
  const assetLines = assets.length === 0
    ? "No assets registered."
    : assets
        .map((asset) => `- ${asset.id}: ${path.join(workspaceDir, asset.path)}\n  Alt: ${asset.alt ?? ""}\n  Media type: ${asset.mediaType ?? "unknown"}`)
        .join("\n");

  return `# ${manifest.title}

The following is a Princess HTML prompt. Preserve the document structure when interpreting the task.

${fence}html
${compiledHtml}
${fence}

## Asset Attachments

${assetLines}
  `;
}

function jsonPackageForCompiledHtml(
  workspaceDir: string,
  manifest: HtmlPromptManifest,
  compiledHtml: string,
): CompiledHtmlPromptPackage {
  const attachments = manifest.resources
    .filter((resource): resource is HtmlPromptResource & { type: "asset" } => resource.type === "asset")
    .map((asset) => ({
      id: asset.id,
      type: "asset" as const,
      path: path.join(workspaceDir, asset.path),
      mediaType: asset.mediaType ?? "application/octet-stream",
      alt: asset.alt ?? path.basename(asset.path),
    }));

  return {
    version: 1,
    format: "princess-html-compiled",
    title: manifest.title,
    workspacePath: workspaceDir,
    prompt: {
      mediaType: "text/html",
      content: compiledHtml,
    },
    attachments,
    resources: manifest.resources,
  };
}

export async function compileHtmlPromptWorkspace(
  workspaceRef: string,
  options: { target?: HtmlPromptCompileTarget } = {},
): Promise<{ path: string; content: string; target: HtmlPromptCompileTarget }> {
  const workspace = await readWorkspace(workspaceRef);
  const target = options.target ?? "html";
  if (target !== "html" && target !== "markdown" && target !== "json") {
    throw new Error(`Invalid compile target "${target}". Use "html", "markdown", or "json".`);
  }

  const html = await readFile(promptPath(workspace.path), "utf8");
  const compiledHtml = await expandHtmlIncludes(workspace.path, html, workspace.manifest);
  const distDir = path.join(workspace.path, "dist");
  await mkdir(distDir, { recursive: true });

  if (target === "markdown") {
    const content = markdownForCompiledHtml(workspace.path, workspace.manifest, compiledHtml);
    const outputPath = path.join(distDir, "compiled.md");
    await atomicWriteFile(outputPath, content);
    return { path: outputPath, content, target };
  }

  if (target === "json") {
    const content = `${JSON.stringify(jsonPackageForCompiledHtml(workspace.path, workspace.manifest, compiledHtml), null, 2)}\n`;
    const outputPath = path.join(distDir, "compiled.json");
    await atomicWriteFile(outputPath, content);
    return { path: outputPath, content, target };
  }

  const outputPath = path.join(distDir, "compiled.html");
  await atomicWriteFile(outputPath, compiledHtml);
  return { path: outputPath, content: compiledHtml, target };
}

function collectIncludeIds(html: string, attr: "data-princess-include" | "data-princess-include-html"): string[] {
  const ids: string[] = [];
  const re = new RegExp(`${attr}=["']([^"']+)["']`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

export async function lintHtmlPromptWorkspace(workspaceRef: string): Promise<HtmlPromptLintIssue[]> {
  const issues: HtmlPromptLintIssue[] = [];
  const workspaceDir = resolveHtmlPromptWorkspace(workspaceRef);
  const manifest = await readHtmlPromptManifest(workspaceDir);
  const html = await readFile(promptPath(workspaceDir), "utf8");

  if (/<\s*(script|iframe|object|embed|link)\b/i.test(html)) {
    issues.push({
      severity: "error",
      code: "forbidden-tag",
      message: "prompt.html contains script-like or remote-loading tags that are not safe for prompt packages.",
    });
  }

  if (/\b(?:src|href)\s*=\s*["']https?:\/\//i.test(html)) {
    issues.push({
      severity: "warning",
      code: "remote-reference",
      message: "prompt.html contains remote references; prefer local workspace resources.",
    });
  }

  const ids = resourceById(manifest);
  for (const resource of manifest.resources) {
    const absolute = path.join(workspaceDir, resource.path);
    const exists = await stat(absolute).catch(() => null);
    if (!exists || !exists.isFile()) {
      issues.push({
        severity: "error",
        code: "missing-resource",
        message: `Missing ${resource.type} resource "${resource.id}" at ${resource.path}.`,
      });
    }

    if (resource.type === "asset" && !resource.alt?.trim()) {
      issues.push({
        severity: "error",
        code: "missing-alt",
        message: `Asset "${resource.id}" is missing alt text.`,
      });
    }

    if ((resource.type === "source" || resource.type === "table") && !resource.trust) {
      issues.push({
        severity: "warning",
        code: "missing-trust",
        message: `Resource "${resource.id}" has no trust level.`,
      });
    }
  }

  for (const id of [...collectIncludeIds(html, "data-princess-include"), ...collectIncludeIds(html, "data-princess-include-html")]) {
    if (!ids.has(id)) {
      issues.push({
        severity: "error",
        code: "unknown-include",
        message: `prompt.html references unknown resource "${id}".`,
      });
    }
  }

  return issues;
}
