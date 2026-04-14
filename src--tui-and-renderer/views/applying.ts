import { bold, cyan, dim, gray, green } from "../colors.ts";
import { emptyLine, horizontalRule, indent, progressBar, spinnerFrame, CHECK_MARK } from "../layout.ts";
import { truncatePath, breakpoint } from "../typeset-compose.ts";
import type { TuiState } from "../state.ts";

const PHASE_LABELS: Record<string, string> = {
  copy: "Copying repository",
  rename: "Renaming directories",
  "rewrite-imports": "Rewriting imports",
  "rewrite-configs": "Rewriting config paths",
  verify: "Verifying output",
};

export function renderApplying(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const progress = state.applyProgress();
  const tick = state.spinnerTick();
  const maxPathWidth = cols - 10;

  lines.push(emptyLine());
  lines.push(indent(bold(cyan("Princess")) + dim(" — Applying changes"), 2));
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 70, wide: 70 });
  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(emptyLine());

  // Show completed phases
  const phases = ["copy", "rename", "rewrite-imports", "rewrite-configs", "verify"];
  const currentPhaseIndex = phases.indexOf(progress.phase);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const label = PHASE_LABELS[phase] ?? phase;

    if (i < currentPhaseIndex) {
      // Completed phase
      lines.push(indent(`${green(CHECK_MARK)} ${label}`, 4));
    } else if (i === currentPhaseIndex) {
      // Current phase
      lines.push(indent(
        `${green(spinnerFrame(tick))} ${bold(label)}...`,
        4,
      ));

      if (progress.total > 0) {
        const barWidth = Math.min(cols - 12, 40);
        lines.push(indent(
          `  ${progressBar(progress.current, progress.total, barWidth)} ${progress.current}/${progress.total}`,
          4,
        ));
      }

      if (progress.currentItem) {
        lines.push(indent(
          dim(`  ${truncatePath(progress.currentItem, maxPathWidth)}`),
          4,
        ));
      }
    } else {
      // Pending phase
      lines.push(indent(gray(`  ${label}`), 4));
    }
  }

  lines.push(emptyLine());
  lines.push(indent(gray("Do not close the terminal..."), 4));

  return lines;
}
