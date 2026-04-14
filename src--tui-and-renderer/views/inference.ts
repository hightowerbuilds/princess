import { bold, cyan, dim, gray, green, yellow } from "../colors.ts";
import {
  emptyLine,
  horizontalRule,
  indent,
  progressBar,
  spinnerFrame,
} from "../layout.ts";
import type { TuiState } from "../state.ts";

export function renderInference(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const progress = state.inferenceProgress();
  const engine = state.engine();
  const tick = state.spinnerTick();

  lines.push(emptyLine());
  lines.push(indent(bold(cyan("Princess")) + dim(" — Inference"), 2));
  lines.push(indent(horizontalRule(Math.min(cols - 4, 70)), 2));
  lines.push(emptyLine());

  if (engine === "heuristic" || (engine === "auto" && progress.engineUsed === "heuristic")) {
    lines.push(indent(
      `${green(spinnerFrame(tick))} Computing heuristic proposals...`,
      4,
    ));

    if (progress.engineUsed === "heuristic" && engine === "auto") {
      lines.push(emptyLine());
      lines.push(indent(
        yellow("Auto mode fell back to heuristic inference."),
        4,
      ));
    }
  } else {
    lines.push(indent(
      `${green(spinnerFrame(tick))} Querying model for rename proposals...`,
      4,
    ));
    lines.push(emptyLine());

    if (progress.totalChunks > 0) {
      lines.push(indent(
        `${bold("Engine:")} ${progress.engineUsed || engine}`,
        4,
      ));
      lines.push(indent(
        `${bold("Progress:")} chunk ${progress.completedChunks} / ${progress.totalChunks}`,
        4,
      ));
      lines.push(emptyLine());

      const barWidth = Math.min(cols - 8, 50);
      lines.push(indent(
        progressBar(progress.completedChunks, progress.totalChunks, barWidth),
        4,
      ));
    } else {
      lines.push(indent(dim("Preparing dossier batches..."), 4));
    }
  }

  lines.push(emptyLine());
  lines.push(indent(gray("This may take a moment..."), 4));

  return lines;
}
