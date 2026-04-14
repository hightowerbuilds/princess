import { bold, cyan, dim, gray, green, yellow, inverse } from "../colors.ts";
import { emptyLine, horizontalRule, indent, ARROW_RIGHT } from "../layout.ts";
import { truncatePath, columns, breakpoint } from "../typeset-compose.ts";
import { stringWidth } from "../typeset.ts";
import type { TuiState } from "../state.ts";
import path from "node:path";

export function renderRepoPicker(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const items = state.repoPickerItems();
  const cursor = state.repoPickerCursor();
  const mode = state.repoPickerMode();
  const inputValue = state.repoPickerInput();
  const fn = state.activeFunction();
  const maxPathWidth = cols - 12;

  const fnLabel = fn === "optimize" ? "Optimize" : fn === "verify" ? "Verify" : "Select";

  lines.push(emptyLine());
  lines.push(indent(bold(cyan("Princess")) + dim(` — ${fnLabel} ${ARROW_RIGHT} Select Repository`), 2));
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 70, wide: 70 });
  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(emptyLine());

  if (items.length === 0) {
    lines.push(indent(dim("No repositories detected nearby."), 4));
    lines.push(indent(dim("Type a path below to get started."), 4));
    lines.push(emptyLine());
  } else {
    lines.push(indent(dim("Detected repositories:"), 4));
    lines.push(emptyLine());

    const listHeight = Math.max(rows - 14, 5);
    const scrollOffset = Math.max(0, cursor - listHeight + 1);
    const visible = items.slice(scrollOffset, scrollOffset + listHeight);

    for (let i = 0; i < visible.length; i++) {
      const globalIndex = scrollOffset + i;
      const itemPath = visible[i];
      const isCursor = globalIndex === cursor && mode === "list";
      const pointer = isCursor ? green("▸ ") : "  ";
      const name = bold(path.basename(itemPath));
      const dir = dim(truncatePath(itemPath, maxPathWidth));
      const rowWidth = breakpoint(cols, { compact: cols - 6, standard: 70, wide: 70 });

      const line = `${pointer}${name}  ${dir}`;
      const formatted = isCursor ? inverse(line + " ".repeat(Math.max(0, rowWidth - stringWidth(line)))) : line;
      lines.push(indent(formatted, 4));
    }

    if (items.length > listHeight) {
      lines.push(indent(dim(`  Showing ${scrollOffset + 1}-${Math.min(scrollOffset + listHeight, items.length)} of ${items.length}`), 4));
    }

    lines.push(emptyLine());
  }

  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(emptyLine());

  // Path input
  const inputPrefix = mode === "input" ? green("  Path: > ") : dim("  Path: > ");
  const inputDisplay = inputValue || (mode === "input" ? "" : dim("press / to type a path"));
  const cursor_char = mode === "input" ? "█" : "";
  lines.push(indent(inputPrefix + inputDisplay + cursor_char, 2));

  lines.push(emptyLine());

  // Key hints
  const hintParts: string[] = [];
  if (mode === "list") {
    hintParts.push(`${bold("[↑/↓]")} Navigate`);
    hintParts.push(`${bold("[Enter]")} Select`);
    hintParts.push(`${bold("[/]")} Type path`);
    hintParts.push(`${bold("[Esc]")} Back`);
  } else {
    hintParts.push(`${bold("[Enter]")} Confirm path`);
    hintParts.push(`${bold("[Esc]")} Cancel`);
  }
  lines.push(indent(dim(hintParts.join("  ")), 4));

  return lines;
}
