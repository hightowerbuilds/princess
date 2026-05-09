/**
 * accessibility.ts — Accessibility and resilience for terminal UI
 *
 * Ensures the TUI is usable in every terminal environment and
 * for every user. Provides capability detection, fallback chains,
 * screen reader output, high-contrast mode, reduced motion, piped
 * output handling, terminal size floor, and color scheme adaptation.
 *
 * Sections:
 *   Terminal profile     — extended capability detection
 *   Fallback characters  — Unicode → ASCII degradation chains
 *   Screen reader        — semantic plain-text announcements
 *   High contrast        — bold+underline instead of color
 *   Reduced motion       — flag to disable all animations
 *   Piped output         — ANSI stripping and JSON formatting
 *   Size floor           — minimum terminal size check + resize prompt
 *   Color scheme         — light/dark detection and palette adaptation
 */

import { stringWidth } from "./typeset.ts";
import { bold, underline, dim, inverse } from "./colors.ts";

// ── Terminal Profile ─────────────────────────────────────────────────────

export type ColorTier = "truecolor" | "256" | "16" | "none";
export type UnicodeTier = "full" | "basic" | "ascii";
export type ColorScheme = "dark" | "light" | "unknown";

export interface TerminalProfile {
  /** Color capability tier. */
  color: ColorTier;
  /** Unicode support level. */
  unicode: UnicodeTier;
  /** Whether alternate screen is available. */
  alternateScreen: boolean;
  /** Whether stdout is a TTY. */
  isTTY: boolean;
  /** Detected background color scheme. */
  background: ColorScheme;
  /** Whether animations should be disabled. */
  reducedMotion: boolean;
  /** Whether high-contrast mode is active. */
  highContrast: boolean;
  /** Whether screen-reader mode is active. */
  accessible: boolean;
}

/**
 * Detect an extended terminal profile from environment.
 *
 * Reads env vars and TTY state to determine capabilities.
 * Pass `overrides` to force specific values (e.g., from CLI flags).
 *
 * ```ts
 * const profile = detectProfile();
 * // or with CLI flags:
 * const profile = detectProfile({ highContrast: true, reducedMotion: true });
 * ```
 */
export function detectProfile(overrides?: Partial<TerminalProfile>): TerminalProfile {
  const env = process.env;
  const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const term = env.TERM ?? "";
  const termProgram = env.TERM_PROGRAM ?? "";
  const colorTerm = env.COLORTERM ?? "";
  const noColor = "NO_COLOR" in env;
  const forceColor = "FORCE_COLOR" in env;
  const lang = env.LANG ?? env.LC_ALL ?? "";

  // Color tier
  let color: ColorTier = "none";
  if (forceColor || (!noColor && isTTY && term !== "dumb")) {
    if (
      colorTerm === "truecolor" ||
      colorTerm === "24bit" ||
      ["iTerm.app", "iTerm2", "WezTerm", "ghostty", "Ghostty", "Alacritty", "kitty", "vscode"].includes(termProgram)
    ) {
      color = "truecolor";
    } else if (term.includes("256color") || colorTerm.length > 0) {
      color = "256";
    } else {
      color = "16";
    }
  }

  // Unicode tier
  let unicode: UnicodeTier = "ascii";
  if (/utf-?8/i.test(lang) || ["iTerm.app", "iTerm2", "WezTerm", "ghostty", "Ghostty", "kitty", "vscode"].includes(termProgram)) {
    unicode = "full";
  } else if (isTTY && term !== "dumb") {
    unicode = "basic";
  }

  // Background detection via COLORFGBG
  let background: ColorScheme = "unknown";
  const colorfgbg = env.COLORFGBG ?? "";
  if (colorfgbg) {
    const parts = colorfgbg.split(";");
    const bg = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(bg)) {
      background = bg < 8 ? "dark" : "light";
    }
  }

  return {
    color,
    unicode,
    alternateScreen: isTTY && term !== "dumb",
    isTTY,
    background,
    reducedMotion: env.REDUCE_MOTION === "1" || env.NO_ANIMATION === "1",
    highContrast: env.HIGH_CONTRAST === "1",
    accessible: env.ACCESSIBLE === "1" || !isTTY,
    ...overrides,
  };
}

// ── Fallback Characters ──────────────────────────────────────────────────

export interface FallbackChars {
  // Box drawing
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  teeRight: string;
  teeLeft: string;

  // Tree connectors
  treeBranch: string;
  treeCorner: string;
  treeLine: string;

  // Block elements
  blockFull: string;
  blockLight: string;

  // Indicators
  bullet: string;
  check: string;
  cross: string;
  arrow: string;
  ellipsis: string;

  // Sparkline blocks (8 levels)
  sparkBlocks: string;
}

const UNICODE_CHARS: FallbackChars = {
  topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯",
  horizontal: "─", vertical: "│",
  teeRight: "├", teeLeft: "┤",
  treeBranch: "├── ", treeCorner: "└── ", treeLine: "│   ",
  blockFull: "█", blockLight: "░",
  bullet: "•", check: "✓", cross: "✗", arrow: "→", ellipsis: "…",
  sparkBlocks: "▁▂▃▄▅▆▇█",
};

const ASCII_CHARS: FallbackChars = {
  topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+",
  horizontal: "-", vertical: "|",
  teeRight: "+", teeLeft: "+",
  treeBranch: "|-- ", treeCorner: "`-- ", treeLine: "|   ",
  blockFull: "#", blockLight: ".",
  bullet: "*", check: "[x]", cross: "[!]", arrow: "->", ellipsis: "...",
  sparkBlocks: "_.,-~:;=#",
};

/**
 * Get the appropriate character set for the terminal's Unicode support.
 */
export function getFallbackChars(profile: TerminalProfile): FallbackChars {
  return profile.unicode === "ascii" ? ASCII_CHARS : UNICODE_CHARS;
}

// ── Screen Reader Announcements ──────────────────────────────────────────

/**
 * Format a progress announcement for screen readers.
 *
 * Produces plain text without ANSI codes or visual decorations.
 *
 * ```ts
 * announceProgress("Scanning", 4, 12, "src/components")
 * // "Scanning: 4 of 12 — src/components"
 * ```
 */
export function announceProgress(
  phase: string,
  current: number,
  total: number,
  detail: string,
): string {
  return `${phase}: ${current} of ${total} — ${detail}`;
}

/**
 * Format a list item announcement.
 *
 * ```ts
 * announceListItem(3, 15, "src-components", "rename → src--components")
 * // "Item 3 of 15: src-components — rename → src--components"
 * ```
 */
export function announceListItem(
  index: number,
  total: number,
  name: string,
  status: string,
): string {
  return `Item ${index} of ${total}: ${name} — ${status}`;
}

/**
 * Format an action announcement.
 *
 * ```ts
 * announceAction("Approved", "12 proposals marked for rename")
 * // "Approved: 12 proposals marked for rename"
 * ```
 */
export function announceAction(action: string, detail: string): string {
  return `${action}: ${detail}`;
}

/**
 * Format a complete screen description for screen readers.
 * Strips all ANSI codes from lines and joins with newlines.
 */
export function announceScreen(title: string, lines: string[]): string {
  const stripped = lines.map(stripAnsi).filter((l) => l.trim().length > 0);
  return `--- ${title} ---\n${stripped.join("\n")}`;
}

// ── High Contrast ────────────────────────────────────────────────────────

/**
 * Apply high-contrast styling.
 *
 * Replaces color-based emphasis with structural styling:
 *   - primary: bold + underline
 *   - secondary: bold
 *   - accent: inverse
 *   - muted: (unchanged — plain text)
 */
export function highContrastStyle(
  text: string,
  emphasis: "primary" | "secondary" | "accent" | "muted",
): string {
  switch (emphasis) {
    case "primary":
      return bold(underline(text));
    case "secondary":
      return bold(text);
    case "accent":
      return inverse(text);
    case "muted":
      return text;
  }
}

/**
 * Replace dim text with normal text for high-contrast mode.
 * Strips \x1b[2m (dim) codes from the string.
 */
export function removeDim(text: string): string {
  return text.replace(/\x1b\[2m/g, "").replace(/\x1b\[22m/g, "");
}

// ── Reduced Motion ───────────────────────────────────────────────────────

/**
 * Check if reduced motion is requested via environment.
 */
export function isReducedMotion(): boolean {
  return process.env.REDUCE_MOTION === "1" || process.env.NO_ANIMATION === "1";
}

/**
 * Configuration object that disables all motion when reduced motion is active.
 * Pass this to spring/tween/stagger configs to make them instant.
 */
export const REDUCED_MOTION_CONFIG = {
  spring: { stiffness: 10000, damping: 10000, precision: 1 },
  tween: { duration: 0 },
  stagger: { delay: 0, fadeDuration: 0 },
  pulse: { period: Infinity },
  marquee: { speed: 0 },
} as const;

// ── Piped Output ─────────────────────────────────────────────────────────

/** Regex matching all ANSI escape sequences. */
const ANSI_REGEX = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Strip all ANSI escape codes from a string.
 *
 * Used when stdout is piped to produce clean plain text.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

/**
 * Strip ANSI from all lines.
 */
export function stripAnsiLines(lines: string[]): string[] {
  return lines.map(stripAnsi);
}

/**
 * Format data as indented JSON for pipe output.
 */
export function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format a list of proposals as plain text for piped output.
 */
export function formatPlainTextProposals(
  proposals: Array<{
    relativePath: string;
    currentName: string;
    proposedName: string;
    decision: string;
    confidence: number;
  }>,
): string {
  const lines: string[] = [];
  lines.push("PROPOSALS");
  lines.push("─".repeat(60));

  for (const p of proposals) {
    const status =
      p.decision === "rename"
        ? `RENAME → ${p.proposedName}`
        : `KEEP (${p.currentName})`;
    lines.push(`  ${p.relativePath}  ${status}  [${(p.confidence * 100).toFixed(0)}%]`);
  }

  lines.push("─".repeat(60));
  const renames = proposals.filter((p) => p.decision === "rename").length;
  lines.push(`${renames} rename / ${proposals.length - renames} keep`);

  return lines.join("\n");
}

// ── Terminal Size Floor ──────────────────────────────────────────────────

export const MIN_COLS = 40;
export const MIN_ROWS = 12;

/**
 * Check if the terminal meets the minimum size requirements.
 */
export function checkSizeFloor(
  cols: number,
  rows: number,
  minCols: number = MIN_COLS,
  minRows: number = MIN_ROWS,
): { ok: boolean; message: string[] } {
  if (cols >= minCols && rows >= minRows) {
    return { ok: true, message: [] };
  }

  return {
    ok: false,
    message: renderResizeMessage(cols, rows, minCols, minRows),
  };
}

/**
 * Render a centered message asking the user to resize their terminal.
 */
export function renderResizeMessage(
  cols: number,
  rows: number,
  minCols: number,
  minRows: number,
): string[] {
  const lines: string[] = [];

  const msg1 = "Terminal too small";
  const msg2 = `Current: ${cols}x${rows}`;
  const msg3 = `Minimum: ${minCols}x${minRows}`;
  const msg4 = "Please resize your terminal";

  const maxWidth = Math.max(
    stringWidth(msg1),
    stringWidth(msg2),
    stringWidth(msg3),
    stringWidth(msg4),
  );

  const pad = (s: string) => {
    const left = Math.max(0, Math.floor((cols - stringWidth(s)) / 2));
    return " ".repeat(left) + s;
  };

  const topPad = Math.max(0, Math.floor((rows - 6) / 2));
  for (let i = 0; i < topPad; i++) lines.push("");

  lines.push(pad(msg1));
  lines.push("");
  lines.push(pad(msg2));
  lines.push(pad(msg3));
  lines.push("");
  lines.push(pad(msg4));

  return lines;
}

// ── Color Scheme Detection ───────────────────────────────────────────────

/**
 * Detect the terminal's background color scheme.
 *
 * Uses the `COLORFGBG` environment variable (set by many terminals)
 * or explicit `--light`/`--dark` flags.
 */
export function detectColorScheme(override?: "light" | "dark"): ColorScheme {
  if (override) return override;

  const colorfgbg = process.env.COLORFGBG ?? "";
  if (colorfgbg) {
    const parts = colorfgbg.split(";");
    const bg = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(bg)) {
      return bg < 8 ? "dark" : "light";
    }
  }

  // Default to dark (most terminals)
  return "dark";
}

/**
 * Color palettes adapted for light and dark backgrounds.
 *
 * Each palette entry is [r, g, b]. Colors are chosen to maintain
 * WCAG AA contrast on both backgrounds.
 */
export const ADAPTIVE_PALETTES: Record<ColorScheme, Record<string, [number, number, number]>> = {
  dark: {
    primary: [100, 200, 255],
    secondary: [180, 180, 200],
    accent: [120, 255, 180],
    warning: [255, 200, 60],
    error: [255, 100, 80],
    muted: [100, 100, 120],
    success: [80, 220, 120],
  },
  light: {
    primary: [0, 100, 180],
    secondary: [80, 80, 100],
    accent: [0, 140, 80],
    warning: [180, 120, 0],
    error: [200, 40, 20],
    muted: [120, 120, 140],
    success: [0, 150, 60],
  },
  unknown: {
    // Conservative palette that works on both
    primary: [60, 160, 220],
    secondary: [140, 140, 160],
    accent: [60, 200, 140],
    warning: [220, 160, 30],
    error: [220, 70, 50],
    muted: [110, 110, 130],
    success: [40, 180, 90],
  },
};

/**
 * Get the adaptive color palette for the detected (or specified) scheme.
 */
export function getAdaptivePalette(
  scheme: ColorScheme = "unknown",
): Record<string, [number, number, number]> {
  return ADAPTIVE_PALETTES[scheme];
}
