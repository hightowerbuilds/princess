/**
 * visualize.ts — Information visualization primitives for terminal UI
 *
 * Pure functions that turn data into visual patterns using Unicode
 * block elements, Braille characters, box-drawing connectors, and
 * ANSI color gradients. Designed to be embedded inline within the
 * typeset layout engine's text flow.
 *
 * Sections:
 *   Sparklines          — inline bar charts using block elements
 *   Braille charts      — 2x4 dot-grid high-resolution charts
 *   Block heatmaps      — single-row value encoding (▁▂▃▄▅▆▇█)
 *   Tree connectors     — box-drawing directory trees
 *   Confidence colors   — 0→1 heat gradient (red→cyan)
 *   Confidence notches  — inline gauge [●●●○○]
 *   File-type bars      — proportional colored distribution
 *   Diff highlighting   — minimal-edit highlight between strings
 *   Search highlighting — inline match emphasis
 *   Breadcrumb shrink   — progressive path collapsing
 *   Side-by-side rename — diff-highlighted column comparison
 *   Directory fingerprint — Braille-encoded composition signature
 */

import { stringWidth } from "./typeset.ts";
import { truncateEnd, columns } from "./typeset-compose.ts";
import { bold, dim, green, red, yellow, cyan, inverse, rgb } from "./colors.ts";

// ── Helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Sparklines ───────────────────────────────────────────────────────────

/** The 8 Unicode block elements for vertical bars (⅛ to full block). */
const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";

/**
 * Render an inline sparkline from numeric values.
 *
 * Each value maps to one of 8 block-element heights. The output is
 * one character per value (or resampled to `width` characters).
 *
 * ```ts
 * sparkline([1, 3, 7, 4, 2])  // "▁▃█▅▂"
 * ```
 */
export function sparkline(values: number[], width?: number): string {
  if (values.length === 0) return "";

  const data = width != null && width !== values.length
    ? resample(values, width)
    : values;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return data
    .map((v) => {
      const i = Math.round(((v - min) / range) * 7);
      return SPARK_BLOCKS[i];
    })
    .join("");
}

/**
 * Sparkline with per-bar coloring via a truecolor gradient.
 *
 * `colorStops` maps normalized values (0–1) to RGB triples. Values
 * between stops are linearly interpolated. Defaults to a red→yellow→green
 * gradient.
 */
export function sparklineColored(
  values: number[],
  width?: number,
  colorStops?: Array<[number, [number, number, number]]>,
): string {
  if (values.length === 0) return "";

  const data = width != null && width !== values.length
    ? resample(values, width)
    : values;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const stops: Array<[number, [number, number, number]]> = colorStops ?? [
    [0.0, [255, 60, 60]],
    [0.5, [255, 220, 40]],
    [1.0, [40, 200, 80]],
  ];

  return data
    .map((v) => {
      const norm = (v - min) / range;
      const i = Math.round(norm * 7);
      const char = SPARK_BLOCKS[i];
      const [r, g, b] = interpolateStops(norm, stops);
      return rgb(r, g, b, char);
    })
    .join("");
}

/** Resample an array to a target length using linear interpolation. */
function resample(values: number[], targetLen: number): number[] {
  if (targetLen <= 0) return [];
  if (targetLen === 1) return [values[Math.floor(values.length / 2)]];

  const result: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    const srcIndex = (i / (targetLen - 1)) * (values.length - 1);
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, values.length - 1);
    const frac = srcIndex - lo;
    result.push(lerp(values[lo], values[hi], frac));
  }
  return result;
}

/** Interpolate between color stops. */
function interpolateStops(
  t: number,
  stops: Array<[number, [number, number, number]]>,
): [number, number, number] {
  const clamped = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped <= stops[i + 1][0]) {
      const segT = (clamped - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return [
        Math.round(lerp(stops[i][1][0], stops[i + 1][1][0], segT)),
        Math.round(lerp(stops[i][1][1], stops[i + 1][1][1], segT)),
        Math.round(lerp(stops[i][1][2], stops[i + 1][1][2], segT)),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// ── Braille Charts ───────────────────────────────────────────────────────

/**
 * Braille dot layout (2 columns x 4 rows per character):
 *
 *   dot1(0x01)  dot4(0x08)
 *   dot2(0x02)  dot5(0x10)
 *   dot3(0x04)  dot6(0x20)
 *   dot7(0x40)  dot8(0x80)
 */
const BRAILLE_BASE = 0x2800;

/** Bits for filling the left column bottom-to-top (0–4 dots). */
const LEFT_FILL = [0x00, 0x40, 0x44, 0x46, 0x47];
/** Bits for filling the right column bottom-to-top (0–4 dots). */
const RIGHT_FILL = [0x00, 0x80, 0xa0, 0xb0, 0xb8];

/**
 * Compact sparkline using Braille characters for 2x horizontal density.
 *
 * Each character encodes two adjacent values (left + right column),
 * each with 4 vertical levels. One terminal column represents two
 * data points at 4x the vertical resolution of block elements.
 *
 * ```ts
 * brailleSparkline([0, 2, 4, 3, 1, 4, 2, 0])  // 4 chars wide
 * ```
 */
export function brailleSparkline(values: number[]): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const chars: string[] = [];
  for (let i = 0; i < values.length; i += 2) {
    const leftNorm = (values[i] - min) / range;
    const rightNorm =
      i + 1 < values.length ? (values[i + 1] - min) / range : 0;

    const leftLevel = Math.round(leftNorm * 4);
    const rightLevel = Math.round(rightNorm * 4);

    chars.push(
      String.fromCharCode(
        BRAILLE_BASE + LEFT_FILL[leftLevel] + RIGHT_FILL[rightLevel],
      ),
    );
  }
  return chars.join("");
}

/**
 * Multi-row Braille bar chart with configurable height.
 *
 * Returns an array of strings (one per terminal row, top to bottom).
 * Each character column encodes two adjacent data points. Total
 * vertical resolution is `height * 4` dots.
 *
 * ```ts
 * const rows = brailleBarChart([10, 25, 40, 30, 15, 45, 20, 5], 3);
 * // rows.length === 3, each row encodes 4 character columns
 * ```
 */
export function brailleBarChart(
  values: number[],
  height: number = 4,
): string[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const totalDots = height * 4;

  // How many dot-rows each value fills from the bottom
  const dotHeights = values.map((v) =>
    Math.round(((v - min) / range) * totalDots),
  );

  // Dot-row bits indexed by position within a character (0=top, 3=bottom)
  const LEFT_DOT = [0x01, 0x02, 0x04, 0x40];
  const RIGHT_DOT = [0x08, 0x10, 0x20, 0x80];

  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    let line = "";
    for (let i = 0; i < values.length; i += 2) {
      let bits = 0;
      for (let d = 0; d < 4; d++) {
        const dotRow = row * 4 + d;
        const dotFromBottom = totalDots - 1 - dotRow;

        if (dotFromBottom < dotHeights[i]) {
          bits |= LEFT_DOT[d];
        }
        if (i + 1 < values.length && dotFromBottom < dotHeights[i + 1]) {
          bits |= RIGHT_DOT[d];
        }
      }
      line += String.fromCharCode(BRAILLE_BASE + bits);
    }
    lines.push(line);
  }
  return lines;
}

// ── Block Heatmaps ───────────────────────────────────────────────────────

/** 9 levels: space (0) through full block (8). */
const BLOCK_ELEMENTS = " ▁▂▃▄▅▆▇█";

/**
 * Encode values as a single row of block elements (▁▂▃▄▅▆▇█).
 *
 * Each value maps to one of 9 levels. Useful for compact heatmaps
 * of directory activity, file sizes, or nesting depth.
 *
 * ```ts
 * blockHeatmap([0, 3, 7, 10, 5, 1])  // " ▂▅█▄▁"
 * ```
 */
export function blockHeatmap(values: number[], maxVal?: number): string {
  if (values.length === 0) return "";
  const max = maxVal ?? Math.max(...values);
  if (max === 0) return " ".repeat(values.length);

  return values
    .map((v) => {
      const i = Math.round(clamp(v / max, 0, 1) * 8);
      return BLOCK_ELEMENTS[i];
    })
    .join("");
}

/**
 * Block heatmap with truecolor gradient applied per character.
 */
export function blockHeatmapColored(
  values: number[],
  maxVal?: number,
  colorStops?: Array<[number, [number, number, number]]>,
): string {
  if (values.length === 0) return "";
  const max = maxVal ?? Math.max(...values);
  if (max === 0) return " ".repeat(values.length);

  const stops: Array<[number, [number, number, number]]> = colorStops ?? [
    [0.0, [60, 60, 80]],
    [0.5, [200, 160, 40]],
    [1.0, [255, 80, 60]],
  ];

  return values
    .map((v) => {
      const norm = clamp(v / max, 0, 1);
      const i = Math.round(norm * 8);
      const char = BLOCK_ELEMENTS[i];
      if (i === 0) return char; // space — no color
      const [r, g, b] = interpolateStops(norm, stops);
      return rgb(r, g, b, char);
    })
    .join("");
}

// ── Tree Connectors ──────────────────────────────────────────────────────

export interface TreeNode {
  label: string;
  children?: TreeNode[];
}

/**
 * Render a tree structure with box-drawing connectors.
 *
 * Produces proper `├──`, `└──`, and `│` continuation lines with
 * correct last-child detection at every depth level.
 *
 * ```ts
 * renderTree([{
 *   label: "src",
 *   children: [
 *     { label: "components" },
 *     { label: "utils", children: [{ label: "helpers.ts" }] },
 *   ],
 * }]);
 * // [
 * //   "src",
 * //   "├── components",
 * //   "└── utils",
 * //   "    └── helpers.ts",
 * // ]
 * ```
 */
export function renderTree(roots: TreeNode[]): string[] {
  const lines: string[] = [];

  function walk(node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean): void {
    const connector = isRoot ? "" : isLast ? "└── " : "├── ";
    lines.push(prefix + connector + node.label);

    if (node.children && node.children.length > 0) {
      const childPrefix = isRoot ? prefix : prefix + (isLast ? "    " : "│   ");
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], childPrefix, i === node.children.length - 1, false);
      }
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], "", i === roots.length - 1, true);
  }

  return lines;
}

/**
 * Render a flat list of labeled items as a tree with depth info.
 *
 * Each item specifies its depth. Connectors are inferred from
 * whether the next item at the same or shallower depth exists.
 */
export function renderFlatTree(
  items: Array<{ label: string; depth: number }>,
): string[] {
  const lines: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const { label, depth } = items[i];

    // Determine if this is the last sibling at its depth
    let isLast = true;
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].depth < depth) break;
      if (items[j].depth === depth) {
        isLast = false;
        break;
      }
    }

    // Build prefix: for each ancestor depth, determine if a vertical
    // line should continue (ancestor has more siblings below)
    let prefix = "";
    for (let d = 0; d < depth; d++) {
      let ancestorContinues = false;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].depth <= d) {
          ancestorContinues = items[j].depth === d;
          break;
        }
        if (items[j].depth === d + 1) {
          // There's a sibling at this ancestor level further down
        }
      }

      // Simpler: check if any item after i has depth <= d
      // If the first such item has depth === d, ancestor continues
      let continues = false;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].depth <= d) {
          continues = items[j].depth <= d;
          break;
        }
      }
      prefix += continues ? "│   " : "    ";
    }

    if (depth === 0) {
      lines.push(label);
    } else {
      lines.push(prefix.slice(0, -4) + (isLast ? "└── " : "├── ") + label);
    }
  }

  return lines;
}

// ── Confidence Colors ────────────────────────────────────────────────────

/** Default 5-stop heat gradient: red → orange → yellow → green → cyan. */
const CONFIDENCE_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [255, 60, 60]],
  [0.25, [255, 165, 0]],
  [0.5, [255, 255, 0]],
  [0.75, [0, 200, 80]],
  [1.0, [0, 200, 200]],
];

/**
 * Map a confidence value (0–1) to an RGB triple.
 *
 * Low confidence = warm (red/orange), high confidence = cool (green/cyan).
 */
export function confidenceRgb(confidence: number): [number, number, number] {
  return interpolateStops(confidence, CONFIDENCE_STOPS);
}

/**
 * Apply the confidence heat gradient to text.
 *
 * ```ts
 * confidenceText(0.85, "high")  // green-cyan colored "high"
 * confidenceText(0.2, "low")    // red-orange colored "low"
 * ```
 */
export function confidenceText(confidence: number, text: string): string {
  const [r, g, b] = confidenceRgb(confidence);
  return rgb(r, g, b, text);
}

/**
 * Render a colored confidence bar.
 *
 * ```ts
 * confidenceBar(0.7, 10)  // "███████░░░" with gradient coloring
 * ```
 */
export function confidenceBar(confidence: number, width: number): string {
  const filled = Math.round(clamp(confidence, 0, 1) * width);
  const empty = width - filled;
  const [r, g, b] = confidenceRgb(confidence);
  return rgb(r, g, b, "█".repeat(filled)) + dim("░".repeat(empty));
}

// ── Confidence Notches ───────────────────────────────────────────────────

/**
 * Render an inline confidence gauge with filled/empty notches.
 *
 * ```ts
 * confidenceNotches(0.8)     // "[●●●●○]"
 * confidenceNotches(0.6, 5)  // "[●●●○○]"
 * ```
 */
export function confidenceNotches(confidence: number, total: number = 5): string {
  const filled = Math.round(clamp(confidence, 0, 1) * total);
  const [r, g, b] = confidenceRgb(confidence);
  const filledStr = rgb(r, g, b, "●".repeat(filled));
  const emptyStr = dim("○".repeat(total - filled));
  return `[${filledStr}${emptyStr}]`;
}

// ── File-Type Distribution Bars ──────────────────────────────────────────

/** Default colors for common file extensions. */
const FILE_TYPE_COLORS: Record<string, [number, number, number]> = {
  ts: [0, 122, 204],
  tsx: [0, 122, 204],
  js: [247, 223, 30],
  jsx: [247, 223, 30],
  mjs: [247, 223, 30],
  cjs: [247, 223, 30],
  json: [128, 128, 128],
  css: [214, 60, 120],
  scss: [214, 60, 120],
  less: [214, 60, 120],
  html: [228, 77, 38],
  htm: [228, 77, 38],
  xml: [228, 77, 38],
  md: [100, 140, 180],
  txt: [100, 140, 180],
  yaml: [160, 100, 60],
  yml: [160, 100, 60],
  toml: [160, 100, 60],
  py: [55, 118, 171],
  go: [0, 173, 216],
  rs: [222, 165, 132],
  java: [176, 114, 25],
  rb: [204, 52, 45],
  svg: [255, 180, 0],
  png: [140, 200, 60],
  jpg: [140, 200, 60],
  gif: [140, 200, 60],
};

export interface FileTypeEntry {
  ext: string;
  count: number;
  color?: [number, number, number];
}

/**
 * Render a proportional colored bar showing file-type distribution.
 *
 * Each extension gets a proportional slice of the total width.
 * Colors are looked up from a built-in palette or supplied per entry.
 *
 * ```ts
 * fileTypeBar([
 *   { ext: "ts", count: 42 },
 *   { ext: "json", count: 8 },
 *   { ext: "css", count: 3 },
 * ], 30)
 * ```
 */
export function fileTypeBar(types: FileTypeEntry[], width: number): string {
  const total = types.reduce((sum, t) => sum + t.count, 0);
  if (total === 0 || width <= 0) return "";

  // Sort by count descending for visual stability
  const sorted = [...types].sort((a, b) => b.count - a.count);

  let result = "";
  let usedWidth = 0;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const proportion = entry.count / total;

    // Ensure at least 1 char for any present type
    const idealWidth = proportion * width;
    const barWidth = Math.max(1, Math.round(idealWidth));
    const actualWidth = Math.min(barWidth, width - usedWidth);
    if (actualWidth <= 0) break;

    const color = entry.color ?? FILE_TYPE_COLORS[entry.ext] ?? [180, 180, 180];
    result += rgb(color[0], color[1], color[2], "█".repeat(actualWidth));
    usedWidth += actualWidth;
  }

  // Fill any rounding gaps
  if (usedWidth < width) {
    result += dim("░".repeat(width - usedWidth));
  }

  return result;
}

/**
 * Render a legend for a file-type bar (inline, compact).
 *
 * ```ts
 * fileTypeLegend([{ ext: "ts", count: 42 }, { ext: "json", count: 8 }])
 * // "■ ts 84%  ■ json 16%"
 * ```
 */
export function fileTypeLegend(types: FileTypeEntry[], maxItems: number = 5): string {
  const total = types.reduce((sum, t) => sum + t.count, 0);
  if (total === 0) return "";

  const sorted = [...types].sort((a, b) => b.count - a.count);
  const shown = sorted.slice(0, maxItems);

  return shown
    .map((entry) => {
      const color = entry.color ?? FILE_TYPE_COLORS[entry.ext] ?? [180, 180, 180];
      const pct = Math.round((entry.count / total) * 100);
      return `${rgb(color[0], color[1], color[2], "■")} ${entry.ext} ${dim(`${pct}%`)}`;
    })
    .join("  ");
}

// ── Diff Highlighting ────────────────────────────────────────────────────

export interface DiffResult {
  /** Old string with removed segments highlighted. */
  old: string;
  /** New string with added segments highlighted. */
  new: string;
}

/**
 * Highlight the minimal character-level diff between two strings.
 *
 * Finds the common prefix and suffix, then styles the changed
 * middle segment — red/strikethrough on the old name, green/bold
 * on the new name.
 *
 * ```ts
 * const d = diffHighlight("src-components", "src--components");
 * // d.old: "src" + red("-") + "components"
 * // d.new: "src" + green("--") + "components"
 * ```
 */
export function diffHighlight(
  oldStr: string,
  newStr: string,
  addedStyle: (s: string) => string = (s) => bold(green(s)),
  removedStyle: (s: string) => string = (s) => red(s),
): DiffResult {
  // Find common prefix
  let prefixLen = 0;
  while (
    prefixLen < oldStr.length &&
    prefixLen < newStr.length &&
    oldStr[prefixLen] === newStr[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix (not overlapping with prefix)
  let suffixLen = 0;
  while (
    suffixLen < oldStr.length - prefixLen &&
    suffixLen < newStr.length - prefixLen &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = oldStr.slice(0, prefixLen);
  const suffix = suffixLen > 0 ? oldStr.slice(oldStr.length - suffixLen) : "";
  const oldMiddle = oldStr.slice(prefixLen, oldStr.length - suffixLen || undefined);
  const newMiddle = newStr.slice(prefixLen, newStr.length - suffixLen || undefined);

  return {
    old: prefix + (oldMiddle ? removedStyle(oldMiddle) : "") + suffix,
    new: prefix + (newMiddle ? addedStyle(newMiddle) : "") + suffix,
  };
}

// ── Search Highlighting ──────────────────────────────────────────────────

/**
 * Highlight all occurrences of a pattern in text.
 *
 * Works on plain text (ANSI codes in the text will be treated as
 * literal characters for matching, but preserved in output).
 *
 * ```ts
 * highlightMatches("hello world hello", "hello")
 * // inverse+bold "hello" + " world " + inverse+bold "hello"
 * ```
 */
export function highlightMatches(
  text: string,
  pattern: string | RegExp,
  style: (match: string) => string = (s) => inverse(bold(s)),
): string {
  const regex =
    typeof pattern === "string"
      ? new RegExp(escapeRegex(pattern), "gi")
      : new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");

  return text.replace(regex, (match) => style(match));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Breadcrumb Shrinking ─────────────────────────────────────────────────

/**
 * Progressively collapse path segments to fit within `maxWidth`.
 *
 * Collapses middle segments to their first character, deepest first,
 * preserving the first and last segments for maximum context.
 *
 * ```ts
 * shrinkBreadcrumb("src/components/shared/utils/Button.tsx", 25)
 * // "src/c/s/utils/Button.tsx"
 *
 * shrinkBreadcrumb("src/components/shared/utils/Button.tsx", 18)
 * // "src/c/s/u/Button.tsx"
 * ```
 */
export function shrinkBreadcrumb(
  pathStr: string,
  maxWidth: number,
  separator: string = "/",
): string {
  if (stringWidth(pathStr) <= maxWidth) return pathStr;

  const parts = pathStr.split(separator);
  if (parts.length <= 2) {
    // Can't shrink further — just truncate
    return truncateEnd(pathStr, maxWidth);
  }

  // Progressively collapse middle parts (deepest first, right to left)
  const result = [...parts];
  for (let i = parts.length - 2; i >= 1; i--) {
    if (result[i].length > 1) {
      result[i] = result[i][0];
    }
    const joined = result.join(separator);
    if (stringWidth(joined) <= maxWidth) return joined;
  }

  // Still too long — truncate the last segment
  return truncateEnd(result.join(separator), maxWidth);
}

// ── Side-by-Side Rename Preview ──────────────────────────────────────────

/**
 * Render old and new names side-by-side with diff highlighting.
 *
 * The wider name gets up to 60% of the available space. Changed
 * segments are highlighted using the diff highlight colors.
 *
 * ```ts
 * sideBySideRename("src-components", "src--components", 50)
 * // "src-components                 →  src--components"
 * ```
 */
export function sideBySideRename(
  oldPath: string,
  newPath: string,
  totalWidth: number,
): string {
  const diff = diffHighlight(oldPath, newPath);

  return columns(
    [
      { content: diff.old, flex: 1, truncate: true },
      { content: dim(" → ") },
      { content: diff.new, flex: 1, truncate: true },
    ],
    totalWidth,
  );
}

// ── Directory Fingerprints ───────────────────────────────────────────────

/**
 * Generate a compact 2-character Braille "fingerprint" for a directory
 * based on its file composition.
 *
 * Directories with similar structures produce visually similar patterns —
 * a glanceable similarity signal. The first character encodes which
 * file categories are present; the second encodes which dominate (>20%).
 *
 * Categories mapped to Braille dots:
 *   dot1: source (.ts/.js/.py/...)   dot4: config (.json/.yaml/...)
 *   dot2: style (.css/.scss/...)     dot5: docs (.md/.txt/...)
 *   dot3: test files                 dot6: assets (.png/.svg/...)
 *   dot7: markup (.html/.xml/...)    dot8: other
 *
 * ```ts
 * directoryFingerprint({ ts: 10, json: 3, md: 1 })  // "⡡⡀" (source+config+docs present, source dominant)
 * ```
 */
export function directoryFingerprint(
  extensions: Record<string, number>,
): string {
  const total = Object.values(extensions).reduce((a, b) => a + b, 0);
  if (total === 0) return "⠀⠀"; // two blank Braille

  // Categorize extensions
  const catCounts: Record<string, number> = {
    source: 0,
    style: 0,
    config: 0,
    test: 0,
    doc: 0,
    asset: 0,
    markup: 0,
    other: 0,
  };

  for (const [ext, count] of Object.entries(extensions)) {
    catCounts[categorizeExt(ext)] += count;
  }

  // Category → Braille dot bit
  const catBits: Record<string, number> = {
    source: 0x01,
    style: 0x02,
    test: 0x04,
    config: 0x08,
    doc: 0x10,
    asset: 0x20,
    markup: 0x40,
    other: 0x80,
  };

  // First char: presence (any files in category?)
  let presenceBits = 0;
  for (const [cat, count] of Object.entries(catCounts)) {
    if (count > 0) presenceBits |= catBits[cat];
  }

  // Second char: dominance (category > 20% of total?)
  let dominanceBits = 0;
  for (const [cat, count] of Object.entries(catCounts)) {
    if (count / total > 0.2) dominanceBits |= catBits[cat];
  }

  return (
    String.fromCharCode(BRAILLE_BASE + presenceBits) +
    String.fromCharCode(BRAILLE_BASE + dominanceBits)
  );
}

function categorizeExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "rb", "c", "cpp", "h", "swift", "kt"].includes(e)) return "source";
  if (["css", "scss", "less", "sass", "styl"].includes(e)) return "style";
  if (["json", "yaml", "yml", "toml", "ini", "env", "config", "lock"].includes(e)) return "config";
  if (e.includes("test") || e.includes("spec")) return "test";
  if (["md", "txt", "doc", "rst", "adoc", "rtf"].includes(e)) return "doc";
  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "mp4", "mp3", "wav", "ttf", "woff", "woff2"].includes(e)) return "asset";
  if (["html", "htm", "xml", "xhtml", "vue", "svelte"].includes(e)) return "markup";
  return "other";
}

// ── Re-exports for convenience ───────────────────────────────────────────

export { interpolateStops, resample, categorizeExt as _categorizeExt };
