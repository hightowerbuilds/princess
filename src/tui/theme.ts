/**
 * theme.ts — Princess black & orange palette
 *
 * Single source of truth for color. Every view should style text by
 * calling these helpers instead of reaching for raw `colors.ts`
 * primitives, so a future palette swap only touches this file.
 *
 * Capability tiers are handled internally:
 *   truecolor  → 24-bit RGB
 *   256-color  → xterm-256 indexed approximation
 *   16-color   → nearest ANSI named color
 *   no-color   → unstyled pass-through
 *
 * Modeled on btop's `orange.theme` (aristocratos/btop).
 */

import { getCapabilities } from "./terminal.ts";
import { rgb, fg256, bold, dim } from "./colors.ts";

// ── Palette ──────────────────────────────────────────────────────────────

export type RGB = [number, number, number];

export interface ThemeColor {
  /** 24-bit truecolor. */
  rgb: RGB;
  /** xterm-256 index for 256-color terminals. */
  x256: number;
  /** ANSI SGR foreground code (30–37, 90–97) for 16-color fallback. */
  ansi16Fg: number;
  /** ANSI SGR background code (40–47, 100–107) for 16-color fallback. */
  ansi16Bg: number;
}

function color(rgb: RGB, x256: number, ansi16Fg: number, ansi16Bg: number): ThemeColor {
  return { rgb, x256, ansi16Fg, ansi16Bg };
}

/**
 * The Princess palette.
 *
 * Names describe semantic roles, not raw hues — `accentEmber` instead
 * of `darkOrange`, so swapping palettes later is a mechanical rename.
 */
export const THEME = {
  bg:            color([0,   0,   0],   16,  30, 40),  // pure black
  fg:            color([255, 165, 0],   208, 33, 43),  // core orange (primary readable)
  fgDim:         color([179, 116, 0],   172, 33, 43),  // body dim
  fgInactive:    color([77,  50,  0],   94,  33, 43),  // disabled / unfocused
  border:        color([255, 165, 0],   208, 33, 43),  // baseline panel border
  borderFocus:   color([255, 204, 102], 214, 93, 103), // focused panel + title
  title:         color([255, 204, 102], 214, 93, 103),
  accentBright:  color([255, 224, 130], 222, 93, 103), // pale gold — highlights
  accentEmber:   color([180, 60,  0],   166, 31, 41),  // deep ember — rejected / removed
  selectionBg:   color([255, 165, 0],   208, 33, 43),
  selectionFg:   color([0,   0,   0],   16,  30, 40),
  divLine:       color([51,  33,  0],   58,  90, 100), // faint inner dividers
  statusReady:   color([255, 204, 102], 214, 93, 103), // gold (was green)
  statusDraft:   color([255, 165, 0],   208, 33, 43),  // core orange (was yellow)
  statusUsed:    color([150, 100, 40],  136, 33, 43),  // ash-amber (was cyan)
  statusStale:   color([100, 70,  30],  94,  90, 100),
  statusRejected:color([180, 60,  0],   166, 31, 41),  // ember — only red-leaning role
  diffAdded:     color([255, 204, 102], 214, 93, 103),
  diffRemoved:   color([180, 60,  0],   166, 31, 41),
} as const;

export type ThemeColorName = keyof typeof THEME;

// ── Foreground styling ───────────────────────────────────────────────────

/**
 * Apply a theme color as the foreground of `text`, picking the best
 * representation the current terminal supports.
 */
export function fg(name: ThemeColorName, text: string): string {
  const caps = getCapabilities();
  if (!caps.supportsColor) return text;

  const c = THEME[name];
  if (caps.supportsTrueColor) {
    return rgb(c.rgb[0], c.rgb[1], c.rgb[2], text);
  }
  if (caps.supports256Color) {
    return fg256(c.x256, text);
  }
  return `\x1b[${c.ansi16Fg}m${text}\x1b[39m`;
}

/**
 * Apply a theme color as the background of `text`.
 */
export function bg(name: ThemeColorName, text: string): string {
  const caps = getCapabilities();
  if (!caps.supportsColor) return text;

  const c = THEME[name];
  if (caps.supportsTrueColor) {
    return `\x1b[48;2;${c.rgb[0]};${c.rgb[1]};${c.rgb[2]}m${text}\x1b[49m`;
  }
  if (caps.supports256Color) {
    return `\x1b[48;5;${c.x256}m${text}\x1b[49m`;
  }
  return `\x1b[${c.ansi16Bg}m${text}\x1b[49m`;
}

// ── Semantic style helpers ───────────────────────────────────────────────
// These are the names views should reach for. They wrap `fg`/`bg` with
// the modifiers that go with each role (e.g. titles are always bold).

export const themed = {
  /** Primary readable text. */
  fg:           (text: string) => fg("fg", text),
  /** De-emphasized body text — replacement for `dim()` calls. */
  dim:          (text: string) => fg("fgDim", text),
  /** Disabled or unfocused content. */
  inactive:     (text: string) => fg("fgInactive", text),
  /** Panel border baseline. */
  border:       (text: string) => fg("border", text),
  /** Focused panel border. */
  borderFocus:  (text: string) => fg("borderFocus", text),
  /** Inline panel title — bold gold. */
  title:        (text: string) => bold(fg("title", text)),
  /** Pale-gold highlight (Ctrl+/ hint, key letters in hotkey strip). */
  accent:       (text: string) => fg("accentBright", text),
  /** Deep ember (rejected status, removed-diff lines). */
  ember:        (text: string) => fg("accentEmber", text),
  /** Selected row: black text on orange background. */
  selection:    (text: string) => bg("selectionBg", fg("selectionFg", text)),
  /** Faint divider. */
  divLine:      (text: string) => fg("divLine", text),
} as const;

// ── Status styling ───────────────────────────────────────────────────────

const STATUS_MAP: Record<string, ThemeColorName> = {
  ready:    "statusReady",
  draft:    "statusDraft",
  used:     "statusUsed",
  stale:    "statusStale",
  rejected: "statusRejected",
};

/**
 * Style a prompt-status label. Unknown statuses fall back to `fgDim`.
 */
export function statusStyle(status: string, text: string): string {
  const role = STATUS_MAP[status.toLowerCase()] ?? "fgDim";
  return fg(role, text);
}

// ── Diff styling ─────────────────────────────────────────────────────────

export function diffAdded(text: string): string {
  return fg("diffAdded", text);
}

export function diffRemoved(text: string): string {
  return fg("diffRemoved", text);
}

// ── Logo gradient stops ──────────────────────────────────────────────────

/**
 * Three-stop horizontal gradient for the "princess" wordmark.
 * Consumed by `gradientTextMulti` from `aesthetics.ts`.
 *
 * Stops:
 *   0.0 → deep ember (visible on black, reads as near-black)
 *   0.5 → core orange
 *   1.0 → pale gold (highlight)
 */
export const PRINCESS_LOGO_STOPS: Array<[number, RGB]> = [
  [0.0, [80,  30,  0]],
  [0.5, [255, 140, 0]],
  [1.0, [255, 220, 130]],
];

/**
 * Brightness-pulsed variant of the logo gradient. Caller passes the
 * current pulse phase `t` ∈ [0, 1] (e.g. from `state.logoPulse.value()`)
 * and gets back gradient stops shifted toward bright at `t = 0.5`.
 *
 * Stays inside the orange family — never crosses hue, only modulates
 * brightness — so the brand never goes off-key during the pulse.
 */
export function princessLogoPulseStops(t: number): Array<[number, RGB]> {
  // Triangle wave: 0 → 1 → 0 over the period.
  const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
  const boost = 0.3 + 0.7 * tri; // 0.3 at trough, 1.0 at peak

  const lerp = (a: number, b: number, p: number): number =>
    Math.round(a + (b - a) * p);

  const mix = (base: RGB, bright: RGB, p: number): RGB => [
    lerp(base[0], bright[0], p),
    lerp(base[1], bright[1], p),
    lerp(base[2], bright[2], p),
  ];

  return [
    [0.0, mix([80,  30,  0],   [180, 90,  20],  boost)],
    [0.5, mix([255, 140, 0],   [255, 180, 60],  boost)],
    [1.0, mix([255, 220, 130], [255, 240, 200], boost)],
  ];
}
