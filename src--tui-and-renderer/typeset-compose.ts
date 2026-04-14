/**
 * typeset-compose.ts — Higher-level composition utilities
 *
 * Built on top of the core typeset engine (typeset.ts). Provides:
 *   - Smart path truncation (middle-out)
 *   - ANSI-aware end truncation
 *   - Columnar layout (flex-based)
 *   - Justified text
 *   - Box model (padding, borders, alignment)
 *   - Hanging indent
 *   - Responsive breakpoints
 */

import {
  charWidth,
  stringWidth,
  prepare,
  layout,
  materialize,
  materializeToStrings,
  layoutNextLineRange,
  advancePastNewline,
  type LayoutCursor,
  type PreparedText,
} from "./typeset.ts";

// Re-export stringWidth — views frequently need it alongside compose utilities
export { stringWidth } from "./typeset.ts";

// ── Smart Path Truncation ────────────────────────────────────────────────

/**
 * Truncate a filesystem path preserving the most semantic parts.
 * Keeps the first segment and as many trailing segments as fit,
 * collapsing the middle with an ellipsis.
 *
 * ```
 * truncatePath("src/components/ui/buttons/PrimaryButton.tsx", 30)
 * → "src/.../buttons/PrimaryButton.tsx"
 * ```
 */
export function truncatePath(path: string, maxWidth: number, ellipsis = "..."): string {
  const visible = stringWidth(path);
  if (visible <= maxWidth) return path;

  const sep = path.includes("/") ? "/" : path.includes("\\") ? "\\" : "/";
  const parts = path.split(sep);

  if (parts.length <= 1) return truncateEnd(path, maxWidth, ellipsis);

  const first = parts[0];
  let tail = parts[parts.length - 1];
  let candidate = first + sep + ellipsis + sep + tail;

  if (stringWidth(candidate) > maxWidth) {
    candidate = ellipsis + sep + tail;
    if (stringWidth(candidate) > maxWidth) return truncateEnd(path, maxWidth, ellipsis);
    return candidate;
  }

  let bestCandidate = candidate;
  for (let i = parts.length - 2; i >= 1; i--) {
    const newTail = parts[i] + sep + tail;
    const newCandidate = first + sep + ellipsis + sep + newTail;
    if (stringWidth(newCandidate) > maxWidth) break;
    tail = newTail;
    bestCandidate = newCandidate;
  }

  return bestCandidate;
}

/**
 * ANSI-aware end-truncation with ellipsis.
 */
export function truncateEnd(text: string, maxWidth: number, ellipsis = "..."): string {
  if (maxWidth <= 0) return "";
  if (stringWidth(text) <= maxWidth) return text;

  const ellipsisWidth = stringWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;
  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  let width = 0;
  let result = "";
  let inEscape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);

    if (ch === 0x1b) { inEscape = true; result += text[i]; continue; }
    if (inEscape) {
      result += text[i];
      if ((ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a)) inEscape = false;
      continue;
    }

    if (ch >= 0xd800 && ch <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const code = (ch - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        const w = charWidth(code);
        if (width + w > targetWidth) break;
        result += text[i] + text[i + 1];
        width += w;
        i++;
        continue;
      }
    }

    const w = charWidth(ch);
    if (width + w > targetWidth) break;
    result += text[i];
    width += w;
  }

  return result + ellipsis;
}

// ── Columnar Layout ──────────────────────────────────────────────────────

export type ColumnAlign = "left" | "right" | "center";

export interface ColumnDef {
  content: string;
  align?: ColumnAlign;
  minWidth?: number;
  maxWidth?: number;
  flex?: number;
  truncate?: boolean;
}

/**
 * Lay out columns within a total width.
 * Fixed columns (flex=0) get their content width. Flex columns share remaining space.
 */
export function columns(defs: ColumnDef[], totalWidth: number, gap = 0): string {
  const n = defs.length;
  if (n === 0) return "";

  const contentWidths = defs.map((d) => stringWidth(d.content));
  const widths: number[] = new Array(n);
  let totalFlex = 0;
  let usedWidth = gap * Math.max(0, n - 1);

  for (let i = 0; i < n; i++) {
    const flex = defs[i].flex ?? 0;
    if (flex > 0) {
      totalFlex += flex;
      widths[i] = -1;
    } else {
      let w = contentWidths[i];
      if (defs[i].minWidth != null) w = Math.max(w, defs[i].minWidth!);
      if (defs[i].maxWidth != null) w = Math.min(w, defs[i].maxWidth!);
      widths[i] = w;
      usedWidth += w;
    }
  }

  const remaining = Math.max(0, totalWidth - usedWidth);
  if (totalFlex > 0) {
    for (let i = 0; i < n; i++) {
      if (widths[i] !== -1) continue;
      const flex = defs[i].flex ?? 1;
      let w = Math.floor((remaining * flex) / totalFlex);
      if (defs[i].minWidth != null) w = Math.max(w, defs[i].minWidth!);
      if (defs[i].maxWidth != null) w = Math.min(w, defs[i].maxWidth!);
      widths[i] = w;
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (widths[i] === -1) widths[i] = contentWidths[i];
    }
  }

  const gapStr = gap > 0 ? " ".repeat(gap) : "";
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const w = widths[i];
    let content = defs[i].content;
    if (contentWidths[i] > w && defs[i].truncate !== false) {
      content = truncateEnd(content, w);
    }
    parts.push(alignText(content, w, defs[i].align ?? "left"));
  }

  return parts.join(gapStr);
}

/** Align text within a fixed width. */
export function alignText(text: string, width: number, align: ColumnAlign): string {
  const visible = stringWidth(text);
  if (visible >= width) return text;
  const pad = width - visible;

  switch (align) {
    case "right": return " ".repeat(pad) + text;
    case "center": {
      const left = Math.floor(pad / 2);
      return " ".repeat(left) + text + " ".repeat(pad - left);
    }
    default: return text + " ".repeat(pad);
  }
}

// ── Justified Text ───────────────────────────────────────────────────────

/**
 * Justify a single line by distributing extra space between words.
 * Only justifies if the line is at least `minFill` fraction of `targetWidth`.
 */
export function justifyLine(text: string, targetWidth: number, minFill = 0.6): string {
  const visible = stringWidth(text);
  if (visible >= targetWidth || visible < targetWidth * minFill) return text;

  const words: string[] = [];
  let current = "";
  let inEscape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 0x1b) { inEscape = true; current += text[i]; continue; }
    if (inEscape) {
      current += text[i];
      if ((ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a)) inEscape = false;
      continue;
    }
    if (ch === 0x20) { if (current) { words.push(current); current = ""; } continue; }
    current += text[i];
  }
  if (current) words.push(current);
  if (words.length <= 1) return text;

  const totalWordWidth = words.reduce((sum, w) => sum + stringWidth(w), 0);
  const totalGap = targetWidth - totalWordWidth;
  const gapCount = words.length - 1;
  const baseGap = Math.floor(totalGap / gapCount);
  let extraGaps = totalGap - baseGap * gapCount;

  const parts: string[] = [];
  for (let i = 0; i < words.length; i++) {
    parts.push(words[i]);
    if (i < gapCount) {
      parts.push(" ".repeat(baseGap + (extraGaps > 0 ? 1 : 0)));
      if (extraGaps > 0) extraGaps--;
    }
  }

  return parts.join("");
}

/** Lay out a text block with full justification. Last line left-aligned. */
export function justifiedLayout(prepared: PreparedText, maxWidth: number): string[] {
  const result = layout(prepared, maxWidth);
  const lines = materializeToStrings(prepared, result);
  return lines.map((line, i) => (i === lines.length - 1 || line === "") ? line : justifyLine(line, maxWidth));
}

// ── Box Model ────────────────────────────────────────────────────────────

export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type BorderStyle = "none" | "single" | "double" | "rounded" | "heavy";

export interface BoxOptions {
  padding?: number | Partial<Spacing>;
  margin?: number | Partial<Spacing>;
  border?: BorderStyle;
  maxWidth?: number;
  align?: ColumnAlign;
}

const BORDER_CHARS: Record<
  Exclude<BorderStyle, "none">,
  { tl: string; tr: string; bl: string; br: string; h: string; v: string }
> = {
  single:  { tl: "\u250c", tr: "\u2510", bl: "\u2514", br: "\u2518", h: "\u2500", v: "\u2502" },
  double:  { tl: "\u2554", tr: "\u2557", bl: "\u255a", br: "\u255d", h: "\u2550", v: "\u2551" },
  rounded: { tl: "\u256d", tr: "\u256e", bl: "\u2570", br: "\u256f", h: "\u2500", v: "\u2502" },
  heavy:   { tl: "\u250f", tr: "\u2513", bl: "\u2517", br: "\u251b", h: "\u2501", v: "\u2503" },
};

/** Wrap content lines in a box with padding, optional border, and alignment. */
export function box(content: string[], totalWidth: number, options?: BoxOptions): string[] {
  const pad = normalizeSpacing(options?.padding);
  const margin = normalizeSpacing(options?.margin);
  const borderStyle = options?.border ?? "none";
  const align = options?.align ?? "left";
  const hasBorder = borderStyle !== "none";
  const borderWidth = hasBorder ? 2 : 0;

  const chrome = margin.left + margin.right + borderWidth + pad.left + pad.right;
  let contentWidth = totalWidth - chrome;
  if (options?.maxWidth != null) contentWidth = Math.min(contentWidth, options.maxWidth);
  contentWidth = Math.max(contentWidth, 1);

  const paddedContent = content.map((line) => {
    const vis = stringWidth(line);
    return vis > contentWidth ? truncateEnd(line, contentWidth) : line + " ".repeat(contentWidth - vis);
  });

  const innerWidth = contentWidth + pad.left + pad.right;
  const lines: string[] = [];

  for (let i = 0; i < margin.top; i++) lines.push("");

  const marginL = " ".repeat(margin.left);
  const padL = " ".repeat(pad.left);
  const padR = " ".repeat(pad.right);

  if (hasBorder) {
    const b = BORDER_CHARS[borderStyle as Exclude<BorderStyle, "none">];
    lines.push(marginL + b.tl + b.h.repeat(innerWidth) + b.tr);
    for (let i = 0; i < pad.top; i++) lines.push(marginL + b.v + " ".repeat(innerWidth) + b.v);
    for (const line of paddedContent) lines.push(marginL + b.v + padL + line + padR + b.v);
    for (let i = 0; i < pad.bottom; i++) lines.push(marginL + b.v + " ".repeat(innerWidth) + b.v);
    lines.push(marginL + b.bl + b.h.repeat(innerWidth) + b.br);
  } else {
    const emptyPadLine = marginL + " ".repeat(innerWidth);
    for (let i = 0; i < pad.top; i++) lines.push(emptyPadLine);
    for (const line of paddedContent) lines.push(marginL + padL + line + padR);
    for (let i = 0; i < pad.bottom; i++) lines.push(emptyPadLine);
  }

  for (let i = 0; i < margin.bottom; i++) lines.push("");

  if (align !== "left") {
    return lines.map((line) => line === "" ? line : alignText(line, totalWidth, align));
  }

  return lines;
}

function normalizeSpacing(value?: number | Partial<Spacing>): Spacing {
  if (value == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  return { top: value.top ?? 0, right: value.right ?? 0, bottom: value.bottom ?? 0, left: value.left ?? 0 };
}

// ── Hanging Indent ───────────────────────────────────────────────────────

/**
 * Wrap text with a hanging indent. First line full-width,
 * continuation lines indented.
 */
export function hangingIndent(text: string, maxWidth: number, indent: number): string[] {
  const p = prepare(text);
  const lines: string[] = [];
  let pos: LayoutCursor = { segmentIndex: 0, charOffset: 0 };
  let lineIndex = 0;

  while (pos.segmentIndex < p.segments.length) {
    const width = lineIndex === 0 ? maxWidth : maxWidth - indent;
    const range = layoutNextLineRange(p, pos, width);
    if (!range) break;
    const line = materialize(p, range);
    lines.push(lineIndex === 0 ? line.text : " ".repeat(indent) + line.text);
    pos = advancePastNewline(p, range.end);
    lineIndex++;
  }

  if (lines.length === 0) lines.push("");
  return lines;
}

// ── Responsive Breakpoints ───────────────────────────────────────────────

export type BreakpointName = "compact" | "standard" | "wide";

export interface Breakpoints<T> {
  compact: T;
  standard: T;
  wide: T;
}

/** Select a value based on terminal width breakpoints. */
export function breakpoint<T>(cols: number, values: Breakpoints<T>): T {
  if (cols < 60) return values.compact;
  if (cols < 120) return values.standard;
  return values.wide;
}

/** Get the current breakpoint name for a terminal width. */
export function breakpointName(cols: number): BreakpointName {
  if (cols < 60) return "compact";
  if (cols < 120) return "standard";
  return "wide";
}

// ── Soft Hyphenation ────────────────────────────────────────────────────

const VOWELS = new Set("aeiouyAEIOUY".split(""));

/**
 * Find valid hyphenation points in a word.
 *
 * Uses simple English syllable rules:
 *   - Break between consonant clusters (VC-CV pattern)
 *   - Never break words shorter than 5 characters
 *   - Never leave fewer than 2 characters on either side
 *
 * Returns character indices where a hyphen can be inserted *after*.
 *
 * ```ts
 * findHyphenationPoints("components")  // [3, 6] → "com-po-nents"
 * findHyphenationPoints("hi")          // [] — too short
 * ```
 */
export function findHyphenationPoints(word: string): number[] {
  if (word.length < 5) return [];

  const points: number[] = [];
  const lower = word.toLowerCase();

  for (let i = 2; i < word.length - 2; i++) {
    const prev = lower[i - 1];
    const curr = lower[i];

    // VC-CV: vowel followed by consonant, then consonant followed by vowel
    if (
      VOWELS.has(prev) &&
      !VOWELS.has(curr) &&
      i + 1 < word.length &&
      !VOWELS.has(lower[i]) &&
      (i + 1 >= word.length || VOWELS.has(lower[i + 1]))
    ) {
      points.push(i);
    }

    // V-CV: break before a consonant-vowel pair after a vowel
    if (
      VOWELS.has(prev) &&
      !VOWELS.has(curr) &&
      i + 1 < word.length &&
      VOWELS.has(lower[i + 1]) &&
      !points.includes(i)
    ) {
      points.push(i);
    }
  }

  // Deduplicate and sort
  return [...new Set(points)].sort((a, b) => a - b);
}

/**
 * Hyphenate a word at a specific maximum width.
 *
 * If the word fits within `maxWidth`, returns it unchanged.
 * Otherwise, breaks at the best hyphenation point that fits,
 * appending a visible hyphen to the first part.
 *
 * Returns `[firstPart + "-", remainder]` or `[word]` if no break needed.
 *
 * ```ts
 * hyphenateWord("components", 6)  // ["com-", "ponents"]
 * hyphenateWord("hi", 10)         // ["hi"]
 * ```
 */
export function hyphenateWord(
  word: string,
  maxWidth: number,
): string[] {
  if (stringWidth(word) <= maxWidth) return [word];

  const points = findHyphenationPoints(word);
  if (points.length === 0) return [word]; // Can't hyphenate

  // Find the best break point that fits (with hyphen)
  for (let i = points.length - 1; i >= 0; i--) {
    const breakAt = points[i];
    const firstPart = word.slice(0, breakAt);
    if (stringWidth(firstPart) + 1 <= maxWidth) { // +1 for hyphen
      return [firstPart + "-", word.slice(breakAt)];
    }
  }

  return [word]; // No break point fits
}

// ── Ragged-Right Optimization (Knuth-Plass) ─────────────────────────────

/**
 * Find optimal line breaks that minimize total raggedness.
 *
 * Implements a simplified Knuth-Plass algorithm using dynamic
 * programming. Each line's "badness" is the cube of its shortfall
 * from the target width. The algorithm finds the set of breakpoints
 * that minimizes total badness across all lines.
 *
 * Returns segment indices where lines should break.
 *
 * ```ts
 * const prepared = prepare("The quick brown fox jumps over the lazy dog");
 * const breaks = optimalBreaks(prepared, 20);
 * // Breaks chosen to minimize ragged-right variance
 * ```
 */
export function optimalBreaks(prepared: PreparedText, maxWidth: number): number[] {
  const { segments } = prepared;

  // Collect word-break candidates (indices after spaces)
  const candidates: number[] = [0]; // Start of text
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].kind === "space") {
      candidates.push(i + 1);
    } else if (segments[i].kind === "newline") {
      candidates.push(i + 1);
    }
  }
  candidates.push(segments.length); // End of text

  const n = candidates.length;
  if (n <= 2) return []; // Nothing to optimize

  // DP arrays
  const cost = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  cost[0] = 0;

  for (let i = 0; i < n - 1; i++) {
    if (cost[i] === Infinity) continue;

    let lineWidth = 0;
    for (let j = i + 1; j < n; j++) {
      // Measure width of segments from candidates[i] to candidates[j]
      const segStart = candidates[i];
      const segEnd = candidates[j];

      lineWidth = measureSegmentSpan(segments, segStart, segEnd);

      if (lineWidth > maxWidth && j > i + 1) break; // Exceeded width

      // Compute badness: how far short of maxWidth
      const shortfall = maxWidth - lineWidth;
      const isLastLine = j === n - 1;

      // Last line penalty is much lower (left-aligned is fine)
      const badness = isLastLine
        ? Math.min(shortfall * shortfall, 100)
        : shortfall * shortfall * shortfall;

      const totalCost = cost[i] + badness;
      if (totalCost < cost[j]) {
        cost[j] = totalCost;
        parent[j] = i;
      }
    }
  }

  // Trace back to find optimal breakpoints
  const breaks: number[] = [];
  let idx = n - 1;
  while (idx > 0) {
    const prev = parent[idx];
    if (prev > 0) {
      breaks.push(candidates[prev]);
    }
    idx = prev;
  }

  return breaks.reverse();
}

/** Measure the visible width of segments in range [start, end), trimming trailing spaces. */
function measureSegmentSpan(segments: readonly Segment[], start: number, end: number): number {
  let width = 0;
  let lastNonSpaceWidth = 0;

  for (let i = start; i < end; i++) {
    const seg = segments[i];
    if (seg.kind === "ansi" || seg.kind === "newline") continue;
    width += seg.width;
    if (seg.kind !== "space") {
      lastNonSpaceWidth = width;
    }
  }

  return lastNonSpaceWidth;
}

/**
 * Layout text using Knuth-Plass optimal line breaking.
 *
 * Produces more visually balanced line lengths than the greedy
 * algorithm used by `layout()`. Especially noticeable in narrow
 * columns where greedy breaking creates one very short last line.
 *
 * ```ts
 * const p = prepare("The quick brown fox jumps over the lazy dog");
 * const lines = layoutOptimal(p, 15);
 * // Lines have more balanced widths than greedy layout
 * ```
 */
export function layoutOptimal(prepared: PreparedText, maxWidth: number): string[] {
  const breaks = optimalBreaks(prepared, maxWidth);

  if (breaks.length === 0) {
    return materializeToStrings(prepared, layout(prepared, maxWidth));
  }

  const { segments } = prepared;
  const lines: string[] = [];
  let start = 0;

  for (const breakIdx of breaks) {
    lines.push(materializeSpan(segments, start, breakIdx));
    start = breakIdx;
  }

  // Last line
  if (start < segments.length) {
    lines.push(materializeSpan(segments, start, segments.length));
  }

  return lines;
}

/** Build a string from a span of segments, trimming leading/trailing spaces. */
function materializeSpan(segments: readonly Segment[], start: number, end: number): string {
  let result = "";
  let first = start;
  let last = end;

  // Skip leading spaces
  while (first < last && segments[first].kind === "space") first++;
  // Skip trailing spaces
  while (last > first && segments[last - 1].kind === "space") last--;

  for (let i = first; i < last; i++) {
    result += segments[i].text;
  }

  return result;
}

// Re-export Segment type for measureSegmentSpan
import type { Segment } from "./typeset.ts";
