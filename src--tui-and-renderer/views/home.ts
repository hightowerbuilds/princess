import { bold, cyan, dim, gray, green, yellow, rgb } from "../colors.ts";
import { centerText, emptyLine, horizontalRule } from "../layout.ts";
import { breakpoint } from "../typeset-compose.ts";
import { mapRange } from "../motion.ts";
import type { TuiState } from "../state.ts";

const LOGO = [
  "  ____       _",
  " |  _ \\ _ __(_)_ __   ___ ___  ___ ___",
  " | |_) | '__| | '_ \\ / __/ _ \\/ __/ __|",
  " |  __/| |  | | | | | (_|  __/\\__ \\__ \\",
  " |_|   |_|  |_|_| |_|\\___\\___||___/___/",
];

export interface MenuItem {
  id: string;
  label: string;
  description: string;
  available: boolean;
}

export const MENU_ITEMS: MenuItem[] = [
  { id: "optimize", label: "Optimize", description: "Rename directories in a repo", available: true },
  { id: "verify", label: "Verify", description: "Check a Princess-transformed repo", available: true },
  { id: "explore", label: "Explore", description: "Browse folder dossiers", available: false },
  { id: "history", label: "History", description: "View past Princess runs", available: false },
];

export function renderHome(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const cursor = state.homeCursor();
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 52, wide: 52 });
  const pulse = state.idlePulse.value();

  // Top padding
  const contentHeight = LOGO.length + MENU_ITEMS.length + 12;
  const topPad = Math.max(2, Math.floor((rows - contentHeight) / 2));
  for (let i = 0; i < topPad; i++) lines.push(emptyLine());

  // Logo — modulated by breathing pulse
  const logoColor = (text: string) => {
    const r = Math.round(mapRange(pulse, 0, 1, 60, 80));
    const g = Math.round(mapRange(pulse, 0, 1, 140, 220));
    const b = Math.round(mapRange(pulse, 0, 1, 180, 255));
    return rgb(r, g, b, text);
  };

  for (const line of LOGO) {
    lines.push(centerText(logoColor(line), cols));
  }

  lines.push(emptyLine());
  lines.push(centerText(dim("repo-to-repo directory transformer"), cols));
  lines.push(emptyLine());
  lines.push(centerText(horizontalRule(ruleWidth), cols));
  lines.push(emptyLine());

  // Menu items — build with fixed alignment then center the block
  const menuLines: string[] = [];

  for (let i = 0; i < MENU_ITEMS.length; i++) {
    const item = MENU_ITEMS[i];
    const isCursor = i === cursor;
    const pointer = isCursor ? green("▸ ") : "  ";

    let label: string;
    let desc: string;

    if (!item.available) {
      label = dim(item.label);
      desc = dim("  " + item.description + " (coming soon)");
    } else if (isCursor) {
      label = bold(green(item.label));
      desc = "  " + item.description;
    } else {
      label = bold(item.label);
      desc = dim("  " + item.description);
    }

    // Pad label to fixed width for alignment
    const paddedLabel = label + " ".repeat(Math.max(0, 12 - item.label.length));
    menuLines.push(pointer + paddedLabel + desc);
  }

  // Center the menu block
  const leftMargin = Math.max(2, Math.floor((cols - 52) / 2));
  for (const line of menuLines) {
    lines.push(" ".repeat(leftMargin) + line);
  }

  lines.push(emptyLine());
  lines.push(centerText(horizontalRule(ruleWidth), cols));
  lines.push(emptyLine());

  const hints = dim("[↑/↓] Navigate  [Enter] Select  [q] Quit");
  lines.push(centerText(hints, cols));

  return lines;
}
