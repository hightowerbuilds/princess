import { createEffect } from "solid-js";
import type { TuiState } from "./state.ts";
import { write } from "./terminal.ts";
import { renderHome } from "./views/home.ts";
import { renderRepoPicker } from "./views/repo-picker.ts";
import { renderWelcome } from "./views/welcome.ts";
import { renderScanning } from "./views/scanning.ts";
import { renderInference } from "./views/inference.ts";
import { renderReview } from "./views/review.ts";
import { renderApplying } from "./views/applying.ts";
import { renderComplete } from "./views/complete.ts";

export function createRenderer(state: TuiState): void {
  let pendingFrame: string | null = null;
  let scheduled = false;
  let firstFrame = true;

  function flush(): void {
    scheduled = false;
    if (pendingFrame !== null) {
      write(pendingFrame);
      pendingFrame = null;
    }
  }

  function scheduleWrite(frame: string): void {
    // Write the first frame immediately so the screen is never blank
    if (firstFrame) {
      firstFrame = false;
      write(frame);
      return;
    }

    pendingFrame = frame;
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 16);
    }
  }

  createEffect(() => {
    const frame = buildFrame(state);
    scheduleWrite(frame);
  });

  // Safety: if the effect didn't fire synchronously (SolidJS 1.7+ defers
  // createEffect), force-write the initial frame so the user sees something.
  if (firstFrame) {
    const frame = buildFrame(state);
    firstFrame = false;
    write(frame);
  }
}

function buildFrame(state: TuiState): string {
  const cols = state.columns();
  const rows = state.rows();
  const currentScreen = state.screen();

  let lines: string[];

  // Screen-level routing
  if (currentScreen === "home") {
    lines = renderHome(state, cols, rows);
  } else if (currentScreen === "repo-picker") {
    lines = renderRepoPicker(state, cols, rows);
  } else {
    // Optimize/verify screens: route by stage
    const currentStage = state.stage();

    switch (currentStage) {
      case "welcome":
        lines = renderWelcome(state, cols, rows);
        break;
      case "scanning":
        lines = renderScanning(state, cols, rows);
        break;
      case "inference":
        lines = renderInference(state, cols, rows);
        break;
      case "review":
        lines = renderReview(state, cols, rows);
        break;
      case "applying":
        lines = renderApplying(state, cols, rows);
        break;
      case "complete":
        lines = renderComplete(state, cols, rows);
        break;
      default:
        lines = ["Unknown stage"];
    }
  }

  // Pad to fill screen
  while (lines.length < rows) {
    lines.push("");
  }

  // Truncate if too many lines
  if (lines.length > rows) {
    lines.length = rows;
  }

  // Build frame: move to top-left, write each line with clear-to-EOL
  return `\x1b[H${lines.map((line) => line + "\x1b[K").join("\n")}`;
}
