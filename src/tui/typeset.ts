/**
 * typeset.ts — Terminal-native text layout engine (core)
 *
 * Two-phase architecture inspired by Pretext.js, adapted for monospace
 * terminals with ANSI escape codes:
 *
 *   prepare()      — parse text into segments, cache widths (once)
 *   layout()       — compute line breaks via arithmetic (on resize)
 *   materialize()  — build output strings (on render)
 *
 * The prepare phase is the most expensive (string scanning + segmentation).
 * The layout phase is pure arithmetic over cached segment widths — fast
 * enough to run on every terminal resize without jank. The materialize
 * phase builds output strings only for visible lines (windowed rendering).
 *
 * Higher-level composition utilities (truncation, columns, boxes, etc.)
 * are in typeset-compose.ts.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type WhiteSpace = "normal" | "pre-wrap" | "pre";
export type WordBreak = "normal" | "break-all";

export interface PrepareOptions {
  whiteSpace?: WhiteSpace;
  wordBreak?: WordBreak;
}

export type SegmentKind = "word" | "space" | "newline" | "ansi";

/** Atomic unit of layout — a word, whitespace run, newline, or ANSI escape. */
export interface Segment {
  kind: SegmentKind;
  text: string;
  /** Visible column width. 0 for ANSI and newline segments. */
  width: number;
}

/** Cached result of the prepare phase. Reuse across layout calls. */
export interface PreparedText {
  segments: Segment[];
  /** Width of the widest forced line (hard breaks only, no wrapping). */
  naturalWidth: number;
  options: Readonly<Required<PrepareOptions>>;
}

/** Position in the segment stream. */
export interface LayoutCursor {
  segmentIndex: number;
  /** Character offset within a segment (for future break-all support). */
  charOffset: number;
}

/** Describes a laid-out line without string allocation. */
export interface LayoutLineRange {
  start: LayoutCursor;
  /** Exclusive end — segments in [start, end) belong to this line. */
  end: LayoutCursor;
  /** Visual width, excluding trailing whitespace. */
  width: number;
}

/** A materialized line — the actual string content ready to render. */
export interface LayoutLine {
  text: string;
  width: number;
}

/** Complete layout result for a text block. */
export interface LayoutResult {
  lineCount: number;
  lines: LayoutLineRange[];
  maxLineWidth: number;
}

/** Lightweight measurement without line storage. */
export interface LineStats {
  lineCount: number;
  maxLineWidth: number;
}

/** A styled text fragment for rich inline composition. */
export interface RichInlineItem {
  text: string;
  /** ANSI code to open this item's style (e.g. "\x1b[1m" for bold). */
  ansiOpen?: string;
  /** ANSI code to close this item's style (e.g. "\x1b[22m"). */
  ansiClose?: string;
}

// ── Character Width ──────────────────────────────────────────────────────

/**
 * Returns the terminal column width of a Unicode code point.
 * 0 for control/zero-width, 2 for CJK/fullwidth/emoji, 1 otherwise.
 */
export function charWidth(code: number): number {
  if (code < 0x20 || code === 0x7f) return 0;
  if (code >= 0x200b && code <= 0x200f) return 0;
  if (code >= 0x2028 && code <= 0x2029) return 0;
  if (code === 0xfeff) return 0;
  if (code >= 0xfe00 && code <= 0xfe0f) return 0;
  if (code >= 0xe0100 && code <= 0xe01ef) return 0;
  if (code >= 0x0300 && code <= 0x036f) return 0;
  if (code >= 0x1ab0 && code <= 0x1aff) return 0;
  if (code >= 0x1dc0 && code <= 0x1dff) return 0;
  if (code >= 0x20d0 && code <= 0x20ff) return 0;
  if (code >= 0xfe20 && code <= 0xfe2f) return 0;

  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33bf) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1fbff) ||
    (code >= 0x20000 && code <= 0x3ffff)
  ) {
    return 2;
  }

  return 1;
}

/**
 * Returns the visible column width of a string, accounting for
 * double-width characters and skipping ANSI escape codes.
 */
export function stringWidth(text: string): number {
  let width = 0;
  let inEscape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);

    if (ch === 0x1b) {
      inEscape = true;
      continue;
    }

    if (inEscape) {
      if ((ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a)) {
        inEscape = false;
      }
      continue;
    }

    if (ch >= 0xd800 && ch <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const code = (ch - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        width += charWidth(code);
        i++;
        continue;
      }
    }

    width += charWidth(ch);
  }

  return width;
}

// ── ANSI Detection ───────────────────────────────────────────────────────

const ANSI_CSI_RE = /^\x1b\[[0-9;?]*[a-zA-Z]/;

// ── Segment Preparation ──────────────────────────────────────────────────

/**
 * Parse text into segments and cache width metadata.
 * This is the "prepare" phase — done once per text block.
 */
export function prepare(text: string, options?: PrepareOptions): PreparedText {
  const opts: Required<PrepareOptions> = {
    whiteSpace: options?.whiteSpace ?? "normal",
    wordBreak: options?.wordBreak ?? "normal",
  };

  const segments = segmentize(text, opts);

  let naturalWidth = 0;
  let lineWidth = 0;
  for (const seg of segments) {
    if (seg.kind === "newline") {
      naturalWidth = Math.max(naturalWidth, lineWidth);
      lineWidth = 0;
    } else {
      lineWidth += seg.width;
    }
  }
  naturalWidth = Math.max(naturalWidth, lineWidth);

  return { segments, naturalWidth, options: opts };
}

function segmentize(text: string, options: Required<PrepareOptions>): Segment[] {
  const segments: Segment[] = [];
  const isNormal = options.whiteSpace === "normal";
  let i = 0;

  while (i < text.length) {
    if (text.charCodeAt(i) === 0x1b && i + 1 < text.length && text.charCodeAt(i + 1) === 0x5b) {
      const remaining = text.slice(i);
      const match = remaining.match(ANSI_CSI_RE);
      if (match) {
        segments.push({ kind: "ansi", text: match[0], width: 0 });
        i += match[0].length;
        continue;
      }
    }

    if (text.charCodeAt(i) === 0x0a) {
      segments.push({ kind: "newline", text: "\n", width: 0 });
      i++;
      continue;
    }

    if (text.charCodeAt(i) === 0x0d) {
      i++;
      continue;
    }

    if (text.charCodeAt(i) === 0x20 || text.charCodeAt(i) === 0x09) {
      if (isNormal) {
        while (i < text.length && (text.charCodeAt(i) === 0x20 || text.charCodeAt(i) === 0x09)) {
          i++;
        }
        segments.push({ kind: "space", text: " ", width: 1 });
      } else {
        let ws = "";
        let width = 0;
        while (i < text.length && (text.charCodeAt(i) === 0x20 || text.charCodeAt(i) === 0x09)) {
          if (text.charCodeAt(i) === 0x09) {
            const tabWidth = 8 - (width % 8);
            ws += " ".repeat(tabWidth);
            width += tabWidth;
          } else {
            ws += " ";
            width++;
          }
          i++;
        }
        segments.push({ kind: "space", text: ws, width });
      }
      continue;
    }

    let word = "";
    let wordWidth = 0;
    while (i < text.length) {
      const ch = text.charCodeAt(i);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) break;
      if (ch === 0x1b && i + 1 < text.length && text.charCodeAt(i + 1) === 0x5b) break;

      if (ch >= 0xd800 && ch <= 0xdbff && i + 1 < text.length) {
        const low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          const code = (ch - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
          word += String.fromCodePoint(code);
          wordWidth += charWidth(code);
          i += 2;
          continue;
        }
      }

      word += text[i];
      wordWidth += charWidth(ch);
      i++;
    }

    if (word) {
      segments.push({ kind: "word", text: word, width: wordWidth });
    }
  }

  if (isNormal) {
    if (segments.length > 0 && segments[0].kind === "space") segments.shift();
    if (segments.length > 0 && segments[segments.length - 1].kind === "space") segments.pop();
  }

  return segments;
}

// ── Layout ───────────────────────────────────────────────────────────────

/**
 * Compute line breaks for prepared text at a given width.
 * Returns line ranges that can be materialized into strings on demand.
 */
export function layout(prepared: PreparedText, maxWidth: number): LayoutResult {
  const { segments, options } = prepared;
  const lines: LayoutLineRange[] = [];
  let maxLineWidth = 0;

  if (segments.length === 0) {
    return { lineCount: 1, lines: [emptyRange()], maxLineWidth: 0 };
  }

  let startIndex = 0;
  while (startIndex < segments.length) {
    const result = layoutOneLine(segments, startIndex, maxWidth, options);
    lines.push(result.range);
    maxLineWidth = Math.max(maxLineWidth, result.range.width);
    startIndex = result.nextStart;
  }

  if (segments.length > 0 && segments[segments.length - 1].kind === "newline") {
    lines.push({ start: cursor(segments.length), end: cursor(segments.length), width: 0 });
  }

  if (lines.length === 0) lines.push(emptyRange());

  return { lineCount: lines.length, lines, maxLineWidth };
}

interface LineLayoutResult {
  range: LayoutLineRange;
  nextStart: number;
}

function layoutOneLine(
  segments: Segment[],
  startIndex: number,
  maxWidth: number,
  options: Readonly<Required<PrepareOptions>>,
): LineLayoutResult {
  if (options.whiteSpace === "pre") return layoutPreLine(segments, startIndex);

  let lineWidth = 0;
  let breakAt = -1;
  let widthAtBreak = 0;
  let i = startIndex;

  while (i < segments.length) {
    const seg = segments[i];

    if (seg.kind === "newline") {
      return {
        range: { start: cursor(startIndex), end: cursor(i), width: trimTrailing(segments, startIndex, i, lineWidth) },
        nextStart: i + 1,
      };
    }

    if (seg.kind === "ansi") { i++; continue; }

    if (seg.kind === "space") {
      lineWidth += seg.width;
      breakAt = i + 1;
      widthAtBreak = lineWidth;
      i++;
      continue;
    }

    const newWidth = lineWidth + seg.width;
    if (newWidth > maxWidth && lineWidth > 0) {
      if (breakAt > startIndex) {
        return {
          range: { start: cursor(startIndex), end: cursor(breakAt), width: trimTrailing(segments, startIndex, breakAt, widthAtBreak) },
          nextStart: breakAt,
        };
      }
      lineWidth = newWidth;
      i++;
      continue;
    }

    lineWidth = newWidth;
    i++;
  }

  return {
    range: { start: cursor(startIndex), end: cursor(segments.length), width: trimTrailing(segments, startIndex, segments.length, lineWidth) },
    nextStart: segments.length,
  };
}

function layoutPreLine(segments: Segment[], startIndex: number): LineLayoutResult {
  let width = 0;
  for (let i = startIndex; i < segments.length; i++) {
    if (segments[i].kind === "newline") {
      return { range: { start: cursor(startIndex), end: cursor(i), width }, nextStart: i + 1 };
    }
    width += segments[i].width;
  }
  return { range: { start: cursor(startIndex), end: cursor(segments.length), width }, nextStart: segments.length };
}

// ── Materialization ──────────────────────────────────────────────────────

/** Build the output string for a single line range. */
export function materialize(prepared: PreparedText, range: LayoutLineRange): LayoutLine {
  const { segments } = prepared;
  let text = "";

  for (let i = range.start.segmentIndex; i < range.end.segmentIndex; i++) {
    text += segments[i].text;
  }

  if (text.length > 0) {
    let trimEnd = text.length;
    let j = range.end.segmentIndex - 1;
    while (j >= range.start.segmentIndex) {
      if (segments[j].kind === "space") { trimEnd -= segments[j].text.length; j--; }
      else if (segments[j].kind === "ansi") { trimEnd -= segments[j].text.length; j--; }
      else break;
    }
    if (trimEnd < text.length) {
      let trimmed = text.slice(0, trimEnd);
      for (let k = j + 1; k < range.end.segmentIndex; k++) {
        if (segments[k].kind === "ansi") trimmed += segments[k].text;
      }
      text = trimmed;
    }
  }

  return { text, width: range.width };
}

/** Materialize all lines in a layout result. */
export function materializeAll(prepared: PreparedText, result: LayoutResult): LayoutLine[] {
  return result.lines.map((range) => materialize(prepared, range));
}

/** Materialize all lines as plain strings. */
export function materializeToStrings(prepared: PreparedText, result: LayoutResult): string[] {
  return result.lines.map((range) => materialize(prepared, range).text);
}

// ── Measurement Utilities ────────────────────────────────────────────────

/** Iterate over line ranges without collecting them. Returns total line count. */
export function walkLineRanges(
  prepared: PreparedText,
  maxWidth: number,
  onLine: (range: LayoutLineRange, index: number) => void,
): number {
  const { segments, options } = prepared;
  let count = 0;
  let startIndex = 0;

  if (segments.length === 0) { onLine(emptyRange(), 0); return 1; }

  while (startIndex < segments.length) {
    const result = layoutOneLine(segments, startIndex, maxWidth, options);
    onLine(result.range, count);
    count++;
    startIndex = result.nextStart;
  }

  if (segments.length > 0 && segments[segments.length - 1].kind === "newline") {
    onLine({ start: cursor(segments.length), end: cursor(segments.length), width: 0 }, count);
    count++;
  }

  return count || 1;
}

/** Line count + max width without storing line ranges. */
export function measureLineStats(prepared: PreparedText, maxWidth: number): LineStats {
  let lineCount = 0;
  let maxLineWidth = 0;
  walkLineRanges(prepared, maxWidth, (range) => { lineCount++; maxLineWidth = Math.max(maxLineWidth, range.width); });
  return { lineCount, maxLineWidth };
}

/** Width of the widest forced line (hard breaks only). */
export function measureNaturalWidth(prepared: PreparedText): number {
  return prepared.naturalWidth;
}

// ── Variable-Width Line Iteration ────────────────────────────────────────

/**
 * Lay out the next single line starting from a cursor, at a given width.
 * Each line can have a different available width (text flowing around panels).
 * Returns null when past the end.
 */
export function layoutNextLineRange(
  prepared: PreparedText,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLineRange | null {
  if (start.segmentIndex >= prepared.segments.length) return null;
  return layoutOneLine(prepared.segments, start.segmentIndex, maxWidth, prepared.options).range;
}

/** Advance a cursor past a newline segment (if present). */
export function advancePastNewline(prepared: PreparedText, end: LayoutCursor): LayoutCursor {
  if (end.segmentIndex < prepared.segments.length && prepared.segments[end.segmentIndex].kind === "newline") {
    return cursor(end.segmentIndex + 1);
  }
  return end;
}

// ── Rich Inline ──────────────────────────────────────────────────────────

/** Prepare mixed-style inline text from structured items. */
export function prepareRichInline(items: RichInlineItem[], options?: PrepareOptions): PreparedText {
  const text = items.map((item) => (item.ansiOpen ?? "") + item.text + (item.ansiClose ?? "")).join("");
  return prepare(text, options);
}

// ── Balanced Text ────────────────────────────────────────────────────────

/** Find the narrowest width that preserves line count. Prevents orphan words. */
export function balancedWidth(prepared: PreparedText, maxWidth: number): number {
  const baseStats = measureLineStats(prepared, maxWidth);
  if (baseStats.lineCount <= 1) return baseStats.maxLineWidth;

  const targetLines = baseStats.lineCount;
  let lo = Math.ceil(prepared.naturalWidth / targetLines);
  let hi = maxWidth;
  let bestWidth = maxWidth;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const stats = measureLineStats(prepared, mid);
    if (stats.lineCount <= targetLines) { bestWidth = mid; hi = mid - 1; }
    else lo = mid + 1;
  }

  return bestWidth;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function cursor(segmentIndex: number): LayoutCursor {
  return { segmentIndex, charOffset: 0 };
}

function emptyRange(): LayoutLineRange {
  return { start: cursor(0), end: cursor(0), width: 0 };
}

function trimTrailing(segments: Segment[], start: number, end: number, totalWidth: number): number {
  let width = totalWidth;
  for (let i = end - 1; i >= start; i--) {
    if (segments[i].kind === "space") width -= segments[i].width;
    else if (segments[i].kind === "ansi") continue;
    else break;
  }
  return width;
}
