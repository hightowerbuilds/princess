/**
 * aesthetics.ts — High-end visual polish for terminal UI
 *
 * Pure functions that apply depth, color, and texture effects
 * to terminal output. Designed to layer on top of the typeset
 * layout engine and visualization primitives.
 *
 * Sections:
 *   Gradient text      — per-character RGB color interpolation
 *   Drop shadow        — panel shadow simulation
 *   Skeleton loading   — placeholder blocks during async work
 *   Noise texture      — subtle deterministic background pattern
 *   Focus dimming      — distance-based brightness falloff
 *   Depth-of-field     — z-index based blur simulation
 *   Color theming      — stage-specific color palettes
 *   Status bar         — persistent bottom-of-screen metrics
 */

import { stringWidth } from "./typeset.ts";
import { rgb, fg256, dim, bold, gray } from "./colors.ts";

// ── Helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate between color stops (same as visualize.ts — inlined to avoid cross-dep). */
function interpolateStops(
  t: number,
  stops: Array<[number, [number, number, number]]>,
): [number, number, number] {
  const c = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    if (c <= stops[i + 1][0]) {
      const segT = (c - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return [
        Math.round(lerp(stops[i][1][0], stops[i + 1][1][0], segT)),
        Math.round(lerp(stops[i][1][1], stops[i + 1][1][1], segT)),
        Math.round(lerp(stops[i][1][2], stops[i + 1][1][2], segT)),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// ── Gradient Text ────────────────────────────────────────────────────────

/**
 * Apply a smooth two-color RGB gradient across visible characters.
 *
 * ANSI escape codes are skipped so the gradient applies only to
 * printable characters. Degrades gracefully when truecolor is
 * unavailable (`rgb()` returns plain text).
 *
 * ```ts
 * gradientText("Princess", [255, 100, 200], [100, 200, 255])
 * ```
 */
export function gradientText(
  text: string,
  from: [number, number, number],
  to: [number, number, number],
): string {
  return gradientTextMulti(text, [
    [0, from],
    [1, to],
  ]);
}

/**
 * Multi-stop per-character gradient.
 *
 * ```ts
 * gradientTextMulti("Rainbow!", [
 *   [0.0, [255, 0, 0]],
 *   [0.5, [0, 255, 0]],
 *   [1.0, [0, 0, 255]],
 * ])
 * ```
 */
export function gradientTextMulti(
  text: string,
  stops: Array<[number, [number, number, number]]>,
): string {
  // Parse characters, tracking ANSI sequences
  const tokens: Array<{ char: string; isAnsi: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\x1b" && i + 1 < text.length && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length && text[j] !== "m") j++;
      tokens.push({ char: text.slice(i, j + 1), isAnsi: true });
      i = j + 1;
    } else {
      tokens.push({ char: text[i], isAnsi: false });
      i++;
    }
  }

  const visibleCount = tokens.filter((t) => !t.isAnsi).length;
  if (visibleCount === 0) return text;

  let visibleIndex = 0;
  let result = "";

  for (const token of tokens) {
    if (token.isAnsi) {
      result += token.char;
    } else {
      const t = visibleCount === 1 ? 0 : visibleIndex / (visibleCount - 1);
      const [r, g, b] = interpolateStops(t, stops);
      result += rgb(r, g, b, token.char);
      visibleIndex++;
    }
  }

  return result;
}

// ── Drop Shadow ──────────────────────────────────────────────────────────

/**
 * Add a 1-character drop shadow to the right and bottom of a panel.
 *
 * The shadow adds 1 column to the right and 1 row to the bottom.
 * Uses dim block characters for a floating-panel illusion.
 *
 * ```ts
 * const panel = ["┌────┐", "│ Hi │", "└────┘"];
 * const shadowed = dropShadow(panel, 6);
 * // ["┌────┐ ", "│ Hi │░", "└────┘░", " ░░░░░░"]
 * ```
 */
export function dropShadow(
  lines: string[],
  width: number,
  options?: {
    char?: string;
    offset?: number;
  },
): string[] {
  const shadowChar = options?.char ?? "░";
  const offset = options?.offset ?? 1;
  const shadowStr = dim(shadowChar);

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i < offset) {
      // Top rows: no shadow on the right (shadow starts below)
      result.push(lines[i] + " ".repeat(offset));
    } else {
      // Shadow on the right
      result.push(lines[i] + shadowStr.repeat(offset));
    }
  }

  // Shadow row at bottom
  const bottomShadow = " ".repeat(offset) + dim(shadowChar.repeat(width));
  for (let i = 0; i < offset; i++) {
    result.push(bottomShadow);
  }

  return result;
}

// ── Skeleton Loading ─────────────────────────────────────────────────────

/**
 * Generate skeleton placeholder lines for loading states.
 *
 * Produces varied-width `░` blocks that mimic the layout of real
 * content, preventing layout jank during async operations.
 *
 * ```ts
 * const placeholder = skeleton(40, 5);
 * // ["░░░░░░░░░░   ░░░░░░", "░░░░   ░░░░░░░░░░░░", ...]
 * ```
 */
export function skeleton(width: number, height: number, seed: number = 42): string[] {
  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    lines.push(skeletonLine(width, seed + row * 7));
  }
  return lines;
}

/**
 * Generate a single skeleton line with varied block segments.
 */
export function skeletonLine(width: number, seed: number = 0): string {
  if (width <= 0) return "";

  let result = "";
  let pos = 0;
  let rng = seed;

  while (pos < width) {
    // Pseudo-random block width (3–12)
    rng = ((rng * 1103515245 + 12345) & 0x7fffffff) >>> 0;
    const blockWidth = 3 + (rng % 10);

    // Pseudo-random gap width (1–3)
    rng = ((rng * 1103515245 + 12345) & 0x7fffffff) >>> 0;
    const gapWidth = 1 + (rng % 3);

    const actualBlock = Math.min(blockWidth, width - pos);
    result += dim("░".repeat(actualBlock));
    pos += actualBlock;

    if (pos < width) {
      const actualGap = Math.min(gapWidth, width - pos);
      result += " ".repeat(actualGap);
      pos += actualGap;
    }
  }

  return result;
}

// ── Noise Texture ────────────────────────────────────────────────────────

/**
 * Generate a subtle deterministic noise pattern for empty backgrounds.
 *
 * Uses a seeded hash so the pattern is stable across rerenders
 * (no flicker). Characters are dim dots (`·`) and spaces.
 *
 * ```ts
 * const bg = noiseTexture(40, 5);
 * // Each line is a mix of dim `·` and spaces
 * ```
 */
export function noiseTexture(
  width: number,
  height: number,
  seed: number = 0,
): string[] {
  const lines: string[] = [];
  for (let y = 0; y < height; y++) {
    lines.push(noiseLine(width, y, seed));
  }
  return lines;
}

/**
 * Generate a single noise line at the given row.
 */
export function noiseLine(width: number, row: number, seed: number = 0): string {
  let result = "";
  for (let x = 0; x < width; x++) {
    const h = hashPosition(x, row, seed);
    // ~15% density — subtle but visible
    if (h % 7 === 0) {
      result += dim("·");
    } else {
      result += " ";
    }
  }
  return result;
}

/** Simple deterministic hash for position-based noise. */
function hashPosition(x: number, y: number, seed: number): number {
  let h = (seed + x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ── Focus Dimming ────────────────────────────────────────────────────────

/**
 * Compute a brightness level (0.0–1.0) based on distance from focus.
 *
 * Items at the focused index are 1.0 (full brightness). Items further
 * away dim linearly down to `minBrightness` at `maxDistance`.
 *
 * ```ts
 * focusDimLevel(5, 3, 4)  // 0.5 — two steps from focus, half-bright
 * focusDimLevel(3, 3, 4)  // 1.0 — at focus, full bright
 * ```
 */
export function focusDimLevel(
  index: number,
  focusIndex: number,
  maxDistance: number = 5,
  minBrightness: number = 0.2,
): number {
  const distance = Math.abs(index - focusIndex);
  if (distance >= maxDistance) return minBrightness;
  const t = distance / maxDistance;
  return lerp(1.0, minBrightness, t);
}

/**
 * Apply distance-based dimming to a line.
 *
 * Uses 256-color grayscale (232–255) to simulate progressive dimming.
 * Falls back to binary dim/bright when 256-color is unavailable.
 */
export function focusDimLine(
  line: string,
  index: number,
  focusIndex: number,
  maxDistance: number = 5,
): string {
  const brightness = focusDimLevel(index, focusIndex, maxDistance);
  if (brightness >= 0.95) return line; // Full brightness
  if (brightness <= 0.3) return dim(line); // Fully dim

  // Map brightness to grayscale 232–255 (24 shades)
  const shade = Math.round(232 + brightness * 23);
  return fg256(shade, line);
}

// ── Depth-of-Field ───────────────────────────────────────────────────────

/**
 * Apply depth-of-field blur: dim + desaturate based on z-depth.
 *
 * `depth` 0 = sharp foreground, 1+ = progressively blurred.
 * At depth 1+, text becomes dim. At depth 2+, colors are replaced
 * with grayscale.
 *
 * ```ts
 * depthBlur("Hello", 0)  // "Hello" — sharp, unmodified
 * depthBlur("Hello", 1)  // dim("Hello") — soft
 * depthBlur("Hello", 2)  // dim + gray — fully blurred
 * ```
 */
export function depthBlur(text: string, depth: number): string {
  if (depth <= 0) return text;
  if (depth >= 2) return dim(gray(text));
  return dim(text);
}

// ── Color Theming ────────────────────────────────────────────────────────

export interface StagePalette {
  /** Primary accent color for this stage. */
  primary: [number, number, number];
  /** Secondary color for supporting elements. */
  secondary: [number, number, number];
  /** Highlight/accent for interactive elements. */
  accent: [number, number, number];
  /** Dimmed/muted color for de-emphasized content. */
  muted: [number, number, number];
}

/**
 * Color palettes for each pipeline stage.
 *
 * - scanning: blue/cyan (discovery, exploration)
 * - inference: purple/magenta (AI, computation)
 * - review: yellow/amber (decision, attention)
 * - applying: green (action, progress)
 * - complete: cyan/white (success, clarity)
 * - error: red/orange (warning, danger)
 */
export const STAGE_PALETTES: Record<string, StagePalette> = {
  welcome: {
    primary: [80, 180, 255],
    secondary: [60, 140, 200],
    accent: [120, 220, 255],
    muted: [40, 80, 120],
  },
  scanning: {
    primary: [0, 180, 220],
    secondary: [0, 130, 180],
    accent: [80, 220, 255],
    muted: [0, 60, 90],
  },
  inference: {
    primary: [180, 80, 220],
    secondary: [140, 60, 180],
    accent: [220, 120, 255],
    muted: [80, 30, 100],
  },
  review: {
    primary: [240, 200, 40],
    secondary: [200, 160, 20],
    accent: [255, 230, 80],
    muted: [120, 100, 20],
  },
  applying: {
    primary: [40, 200, 80],
    secondary: [20, 160, 60],
    accent: [80, 240, 120],
    muted: [20, 80, 40],
  },
  complete: {
    primary: [0, 200, 200],
    secondary: [0, 160, 160],
    accent: [120, 255, 255],
    muted: [0, 80, 80],
  },
  error: {
    primary: [255, 80, 60],
    secondary: [200, 60, 40],
    accent: [255, 140, 100],
    muted: [120, 40, 30],
  },
};

/**
 * Get the palette for a given pipeline stage.
 * Returns the welcome palette as default for unknown stages.
 */
export function stagePalette(stage: string): StagePalette {
  return STAGE_PALETTES[stage] ?? STAGE_PALETTES.welcome;
}

/**
 * Apply a stage's primary color to text.
 */
export function stageText(stage: string, text: string): string {
  const [r, g, b] = stagePalette(stage).primary;
  return rgb(r, g, b, text);
}

/**
 * Apply a stage's accent color to text.
 */
export function stageAccent(stage: string, text: string): string {
  const [r, g, b] = stagePalette(stage).accent;
  return rgb(r, g, b, text);
}

// ── Status Bar ───────────────────────────────────────────────────────────

export interface StatusBarData {
  /** Current operation label (e.g., "Scanning", "Inferring"). */
  operation: string;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
  /** Optional progress (0.0–1.0). */
  progress?: number;
  /** Optional item count (e.g., "12/48 dirs"). */
  itemLabel?: string;
}

/**
 * Render a compact status bar line for the bottom of the screen.
 *
 * Format: ` operation  ▸ elapsed  ▸ progress  ▸ items `
 *
 * ```ts
 * statusBar({ operation: "Scanning", elapsedMs: 4200, itemLabel: "12 dirs" }, 60)
 * // " Scanning  ▸ 4.2s  ▸ 12 dirs"
 * ```
 */
export function statusBar(data: StatusBarData, width: number): string {
  const parts: string[] = [];

  // Operation
  parts.push(bold(data.operation));

  // Elapsed time
  const seconds = (data.elapsedMs / 1000).toFixed(1);
  parts.push(dim(`${seconds}s`));

  // Progress bar (if present)
  if (data.progress != null) {
    const barWidth = Math.min(12, Math.max(4, Math.floor(width / 6)));
    const filled = Math.round(data.progress * barWidth);
    const empty = barWidth - filled;
    parts.push(`${"█".repeat(filled)}${dim("░".repeat(empty))} ${dim(`${Math.round(data.progress * 100)}%`)}`);
  }

  // Item label
  if (data.itemLabel) {
    parts.push(dim(data.itemLabel));
  }

  const separator = dim(" ▸ ");
  let content = " " + parts.join(separator) + " ";

  // Pad or truncate to width
  const visWidth = stringWidth(content);
  if (visWidth < width) {
    content += " ".repeat(width - visWidth);
  }

  return content;
}

/**
 * Format a duration in ms to a human-readable short string.
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}
