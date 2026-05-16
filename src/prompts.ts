export type PromptStatus = "draft" | "ready" | "used" | "stale" | "rejected";

export interface PromptMetadata {
  title: string;
  category?: string;
  status: PromptStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedPromptDocument {
  hasFrontmatter: boolean;
  metadata: Partial<PromptMetadata> & Record<string, string>;
  body: string;
  preview: string;
}

export interface PromptSearchEntry {
  name: string;
  path: string;
  relativePath: string;
  document: ParsedPromptDocument;
  isDirectory?: boolean;
  isHtmlWorkspace?: boolean;
}

function slugifyTitle(title: string): string {
  const sanitized = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return sanitized || "untitled-prompt";
}

function formatFrontmatterValue(value: string): string {
  if (/[\r\n]/.test(value) || value.trim() !== value) {
    return JSON.stringify(value);
  }
  return value;
}

function parseFrontmatterValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {}
  }
  return trimmed;
}

function formatFrontmatterLine(key: string, value: string): string {
  return `${key}: ${formatFrontmatterValue(value)}`;
}

function extractPreview(body: string): string {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("---")) {
      return trimmed;
    }
  }
  return "";
}

export function sanitizePromptTitle(title: string): string {
  return slugifyTitle(title);
}

export function buildPromptDocument(
  title: string,
  options: { category?: string; status?: PromptStatus; createdAt?: string; updatedAt?: string } = {},
): string {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const status = options.status ?? "draft";
  const category = options.category?.trim();
  const headingTitle = title.replace(/\r?\n/g, " ").trim() || title;

  const frontmatter = [
    "---",
    formatFrontmatterLine("title", title),
    category ? formatFrontmatterLine("category", category) : null,
    formatFrontmatterLine("status", status),
    formatFrontmatterLine("createdAt", createdAt),
    formatFrontmatterLine("updatedAt", updatedAt),
    "---",
    "",
    `# ${headingTitle}`,
    "",
  ].filter((line) => line !== null) as string[];

  return frontmatter.join("\n");
}

export function parsePromptDocument(content: string): ParsedPromptDocument {
  const normalized = content.replace(/\r\n/g, "\n");
  const hasFrontmatter = normalized.startsWith("---\n");
  if (!hasFrontmatter) {
    return {
      hasFrontmatter: false,
      metadata: {},
      body: content,
      preview: extractPreview(content),
    };
  }

  const endIdx = normalized.indexOf("\n---\n", 4);
  if (endIdx < 0) {
    return {
      hasFrontmatter: false,
      metadata: {},
      body: content,
      preview: extractPreview(content),
    };
  }

  const frontmatterBlock = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 5);
  const metadata: Partial<PromptMetadata> & Record<string, string> = {};

  for (const rawLine of frontmatterBlock.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = parseFrontmatterValue(line.slice(colonIdx + 1));
    if (!key) continue;
    metadata[key] = value;
  }

  const title = metadata.title ?? "";
  return {
    hasFrontmatter: true,
    metadata,
    body,
    preview: extractPreview(body) || title,
  };
}

function normalizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function scorePromptSearch(entry: PromptSearchEntry, query: string): number {
  const terms = normalizeQuery(query);
  if (terms.length === 0) return 0;

  const metadata = entry.document.metadata;
  const title = (metadata.title ?? "").toLowerCase();
  const category = (metadata.category ?? "").toLowerCase();
  const status = (metadata.status ?? "").toLowerCase();
  const preview = (entry.document.preview ?? "").toLowerCase();
  const body = (entry.document.body ?? "").toLowerCase();
  const relativePath = entry.relativePath.toLowerCase();
  const name = entry.name.toLowerCase();
  const haystack = [title, category, status, preview, body, relativePath, name].join(" ");

  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) return -1;

    if (title.includes(term)) score += 12;
    if (category.includes(term)) score += 10;
    if (status.includes(term)) score += 8;
    if (relativePath.includes(term)) score += 6;
    if (name.includes(term)) score += 4;
    if (preview.includes(term)) score += 3;
    if (body.includes(term)) score += 2;
  }

  return score;
}

export function filterPromptSearchEntries(query: string, entries: PromptSearchEntry[]): PromptSearchEntry[] {
  const scored = entries
    .map((entry) => ({ entry, score: scorePromptSearch(entry, query) }))
    .filter((result) => result.score >= 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.relativePath.localeCompare(b.entry.relativePath);
  });

  return scored.map((result) => result.entry);
}
