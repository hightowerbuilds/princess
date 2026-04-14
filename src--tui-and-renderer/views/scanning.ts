import { bold, cyan, dim, gray, green } from "../colors.ts";
import { emptyLine, horizontalRule, indent, spinnerFrame } from "../layout.ts";
import { truncatePath, breakpoint } from "../typeset-compose.ts";
import type { TuiState } from "../state.ts";

export function renderScanning(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const progress = state.scanProgress();
  const tick = state.spinnerTick();
  const maxPathWidth = cols - 6;

  lines.push(emptyLine());
  lines.push(indent(bold(cyan("Princess")) + dim(" — Scanning repository"), 2));
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 70, wide: 70 });
  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(emptyLine());

  lines.push(indent(
    `${green(spinnerFrame(tick))} Scanning directories...`,
    4,
  ));
  lines.push(emptyLine());

  lines.push(indent(
    `${bold("Directories found:")} ${progress.directoriesScanned}`,
    4,
  ));
  lines.push(emptyLine());

  if (progress.currentPath) {
    lines.push(indent(
      dim(`Current: ${truncatePath(progress.currentPath, maxPathWidth)}`),
      4,
    ));
  }

  lines.push(emptyLine());
  lines.push(indent(gray("Building folder dossiers..."), 4));

  return lines;
}
