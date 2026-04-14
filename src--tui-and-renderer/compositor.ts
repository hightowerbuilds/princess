/**
 * compositor.ts — Multi-region compositing for terminal UI
 *
 * Enables layered, multi-region rendering: floating panels, modals,
 * split panes, picture-in-picture, tabs, and toast notifications.
 * All functions are pure — they take string[] frames and return
 * composited string[] frames.
 *
 * Core operations:
 *   padToWidth()      — normalize a line to exact column width
 *   skipColumns()     — drop first N visible columns from a line
 *   overlayRegion()   — layer content at an x,y position
 *   splitPane()       — divide terminal into two independent columns
 *   modalOverlay()    — centered box over dimmed backdrop
 *
 * Panel rendering:
 *   floatingPanel()   — bordered panel with optional title
 *   tabBar()          — horizontal tab strip
 *   tabbedPanel()     — tab bar + switchable content area
 *   toastBox()        — compact notification box
 *   pipPanel()        — picture-in-picture corner inset
 */

import { charWidth, stringWidth } from "./typeset.ts";
import { truncateEnd } from "./typeset-compose.ts";
import { bold, dim, cyan, inverse } from "./colors.ts";

// ── Utilities ────────────────────────────────────────────────────────────

/**
 * Pad or truncate a line to an exact visible column width.
 */
export function padToWidth(line: string, width: number): string {
  const vis = stringWidth(line);
  if (vis > width) return truncateEnd(line, width);
  if (vis < width) return line + " ".repeat(width - vis);
  return line;
}

/**
 * Drop the first `cols` visible columns from a line.
 *
 * ANSI codes within the skipped region are discarded. A reset is
 * prepended to prevent style bleeding from the skipped content.
 */
export function skipColumns(line: string, cols: number): string {
  let col = 0;
  let i = 0;

  while (i < line.length && col < cols) {
    if (line[i] === "\x1b") {
      // Skip ANSI escape sequence
      let j = i + 1;
      while (j < line.length && line[j] !== "m") j++;
      i = j + 1;
    } else {
      col += charWidth(line.charCodeAt(i));
      i++;
    }
  }

  const remainder = line.slice(i);
  return remainder.length > 0 ? "\x1b[0m" + remainder : "";
}

// ── Core Compositing ─────────────────────────────────────────────────────

/**
 * Overlay a region of content onto a base frame at position (x, y).
 *
 * The overlay replaces `overlayWidth` columns starting at column `x`
 * for each overlay line starting at row `y`. Base content outside
 * the overlay region is preserved.
 *
 * ```ts
 * const base = ["Hello World!", "Line two!!!!"];
 * const panel = ["[HI]"];
 * overlayRegion(base, panel, 5, 0, 4)
 * // ["Hello[HI]d!", "Line two!!!!"]
 * ```
 */
export function overlayRegion(
  base: string[],
  overlay: string[],
  x: number,
  y: number,
  overlayWidth: number,
): string[] {
  const result = [...base];

  for (let r = 0; r < overlay.length; r++) {
    const row = y + r;
    if (row < 0 || row >= result.length) continue;

    const baseLine = result[row];
    const overlayLine = padToWidth(overlay[r], overlayWidth);

    // Before: original content up to column x
    const before = padToWidth(truncateEnd(baseLine, x), x);

    // After: original content starting at column x + overlayWidth
    const after = skipColumns(baseLine, x + overlayWidth);

    result[row] = before + "\x1b[0m" + overlayLine + after;
  }

  return result;
}

/**
 * Render two panes side-by-side with a vertical divider.
 *
 * Each pane gets independent width. The divider is a single
 * box-drawing column (`│`).
 *
 * ```ts
 * const left = renderList(state, leftWidth, height);
 * const right = renderDetail(state, rightWidth, height);
 * const frame = splitPane(left, right, 80, 40);
 * ```
 */
export function splitPane(
  leftLines: string[],
  rightLines: string[],
  totalWidth: number,
  leftWidth: number,
  divider: string = "│",
): string[] {
  const dividerWidth = 1;
  const rightWidth = totalWidth - leftWidth - dividerWidth;
  const height = Math.max(leftLines.length, rightLines.length);
  const styledDivider = dim(divider);

  const result: string[] = [];
  for (let i = 0; i < height; i++) {
    const left = padToWidth(leftLines[i] ?? "", leftWidth);
    const right = padToWidth(rightLines[i] ?? "", rightWidth);
    result.push(left + styledDivider + right);
  }

  return result;
}

/**
 * Center a modal box over a dimmed backdrop.
 *
 * The backdrop lines are wrapped in `dim()`. The modal is centered
 * both horizontally and vertically, rendered with a rounded border.
 */
export function modalOverlay(
  backdrop: string[],
  content: string[],
  contentWidth: number,
  totalWidth: number,
  totalHeight: number,
): string[] {
  // Build the modal box
  const modal = floatingPanel(content, contentWidth);

  // Dim the entire backdrop
  const dimmed = backdrop.map((line) => dim(line));

  // Pad/truncate backdrop to fill screen
  while (dimmed.length < totalHeight) dimmed.push("");
  if (dimmed.length > totalHeight) dimmed.length = totalHeight;

  // Center the modal
  const modalWidth = contentWidth + 4; // border(1) + padding(1) on each side
  const x = Math.max(0, Math.floor((totalWidth - modalWidth) / 2));
  const y = Math.max(0, Math.floor((totalHeight - modal.length) / 2));

  return overlayRegion(dimmed, modal, x, y, modalWidth);
}

// ── Panel Rendering ──────────────────────────────────────────────────────

/**
 * Render a bordered floating panel with optional title.
 *
 * Uses rounded box-drawing characters. Title is embedded in the
 * top border: `╭─ Title ──────╮`.
 *
 * ```ts
 * floatingPanel(["Line 1", "Line 2"], 30, "Details")
 * // ["╭─ Details ──────────────────╮",
 * //  "│ Line 1                     │",
 * //  "│ Line 2                     │",
 * //  "╰────────────────────────────╯"]
 * ```
 */
export function floatingPanel(
  content: string[],
  width: number,
  title?: string,
): string[] {
  const innerWidth = Math.max(width - 2, 1); // subtract left + right border
  const contentWidth = innerWidth - 2; // subtract left + right padding
  const lines: string[] = [];

  // Top border with optional title
  if (title) {
    const titleStr = ` ${title} `;
    const titleWidth = stringWidth(titleStr);
    const remainingRule = Math.max(0, innerWidth - 1 - titleWidth);
    lines.push("╭─" + bold(titleStr) + "─".repeat(remainingRule) + "╮");
  } else {
    lines.push("╭" + "─".repeat(innerWidth) + "╮");
  }

  // Content lines with padding
  for (const line of content) {
    const padded = padToWidth(line, contentWidth);
    lines.push("│ " + padded + " │");
  }

  // Bottom border
  lines.push("╰" + "─".repeat(innerWidth) + "╯");

  return lines;
}

/**
 * Render a horizontal tab bar.
 *
 * Active tab is highlighted with inverse. Tabs are separated by
 * dim dividers.
 *
 * ```ts
 * tabBar([
 *   { label: "Dossier", active: true },
 *   { label: "Files", active: false },
 *   { label: "Reasoning", active: false },
 * ], 50)
 * ```
 */
export function tabBar(
  tabs: Array<{ label: string; active: boolean }>,
  width: number,
): string {
  const parts: string[] = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const label = ` ${tab.label} `;

    if (tab.active) {
      parts.push(inverse(bold(label)));
    } else {
      parts.push(dim(label));
    }

    if (i < tabs.length - 1) {
      parts.push(dim("│"));
    }
  }

  const content = parts.join("");
  return padToWidth(content, width);
}

/**
 * Render a tabbed panel: tab bar on top, content below, bordered.
 *
 * ```ts
 * tabbedPanel(
 *   [{ label: "Info", active: true }, { label: "Files", active: false }],
 *   ["Content line 1", "Content line 2"],
 *   40,
 * )
 * ```
 */
export function tabbedPanel(
  tabs: Array<{ label: string; active: boolean }>,
  content: string[],
  width: number,
): string[] {
  const innerWidth = Math.max(width - 2, 1);
  const contentWidth = innerWidth - 2;
  const lines: string[] = [];

  // Top border
  lines.push("╭" + "─".repeat(innerWidth) + "╮");

  // Tab bar
  const bar = tabBar(tabs, contentWidth);
  lines.push("│ " + bar + " │");

  // Separator
  lines.push("├" + "─".repeat(innerWidth) + "┤");

  // Content
  for (const line of content) {
    lines.push("│ " + padToWidth(line, contentWidth) + " │");
  }

  // Bottom border
  lines.push("╰" + "─".repeat(innerWidth) + "╯");

  return lines;
}

/**
 * Render a compact toast notification box.
 *
 * Returns a small bordered box (rounded corners) sized to fit
 * the message. Max width prevents excessively wide toasts.
 *
 * ```ts
 * toastBox("Scan complete — 12 directories", 40)
 * // ["╭────────────────────────────────╮",
 * //  "│ Scan complete — 12 directories │",
 * //  "╰────────────────────────────────╯"]
 * ```
 */
export function toastBox(message: string, maxWidth: number = 50): string {
  const msgWidth = stringWidth(message);
  const innerWidth = Math.min(msgWidth + 2, maxWidth);
  const contentWidth = innerWidth - 2;

  const paddedMsg = padToWidth(
    truncateEnd(message, contentWidth),
    contentWidth,
  );

  const top = "╭" + "─".repeat(innerWidth) + "╮";
  const mid = "│ " + paddedMsg + " │";
  const bot = "╰" + "─".repeat(innerWidth) + "╯";

  return [top, mid, bot].join("\n");
}

/**
 * Render a toast as string[] for compositing.
 */
export function toastLines(message: string, maxWidth: number = 50): string[] {
  const msgWidth = stringWidth(message);
  const innerWidth = Math.min(msgWidth + 2, maxWidth);
  const contentWidth = innerWidth - 2;

  const paddedMsg = padToWidth(
    truncateEnd(message, contentWidth),
    contentWidth,
  );

  return [
    "╭" + "─".repeat(innerWidth) + "╮",
    "│ " + paddedMsg + " │",
    "╰" + "─".repeat(innerWidth) + "╯",
  ];
}

/**
 * Overlay a toast notification at the top-right of a frame.
 */
export function toastOverlay(
  base: string[],
  message: string,
  totalWidth: number,
  maxToastWidth: number = 50,
): string[] {
  const toast = toastLines(message, maxToastWidth);
  const toastWidth = stringWidth(toast[0]);
  const x = Math.max(0, totalWidth - toastWidth - 1);
  return overlayRegion(base, toast, x, 1, toastWidth);
}

/**
 * Render a picture-in-picture inset panel at a corner position.
 *
 * ```ts
 * const pip = pipPanel(
 *   ["Progress: 50%", "12/24 files"],
 *   25,
 *   "bottom-right",
 *   totalWidth,
 *   totalHeight,
 * );
 * ```
 */
export type PipPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function pipOverlay(
  base: string[],
  content: string[],
  pipWidth: number,
  position: PipPosition,
  totalWidth: number,
  totalHeight: number,
  title?: string,
): string[] {
  const panel = floatingPanel(content, pipWidth, title);
  const panelWidth = pipWidth;
  const panelHeight = panel.length;
  const margin = 1;

  let x: number;
  let y: number;

  switch (position) {
    case "top-left":
      x = margin;
      y = margin;
      break;
    case "top-right":
      x = Math.max(0, totalWidth - panelWidth - margin);
      y = margin;
      break;
    case "bottom-left":
      x = margin;
      y = Math.max(0, totalHeight - panelHeight - margin);
      break;
    case "bottom-right":
      x = Math.max(0, totalWidth - panelWidth - margin);
      y = Math.max(0, totalHeight - panelHeight - margin);
      break;
  }

  return overlayRegion(base, panel, x, y, panelWidth);
}
