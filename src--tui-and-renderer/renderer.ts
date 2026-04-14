import { createEffect, createMemo } from "solid-js";
import type { TuiState } from "./state.ts";
import { write } from "./terminal.ts";
import { dim } from "./colors.ts";
import { createCrossfade } from "./motion.ts";
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
  let lastRenderedLines: string[] = [];
  let capturedFrame: string[] | null = null;

  // Track screen/stage changes for crossfade transitions
  const sceneKey = createMemo(() => `${state.screen()}:${state.stage()}`);
  const crossfade = createCrossfade(sceneKey, { duration: 250 });

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
    const cols = state.columns();
    const rows = state.rows();
    const isTransitioning = crossfade.isTransitioning();
    const progress = crossfade.progress();

    // Capture the previous frame when a transition starts
    if (isTransitioning && capturedFrame === null && lastRenderedLines.length > 0) {
      capturedFrame = [...lastRenderedLines];
    }

    // Build current screen lines
    let lines = buildLines(state, cols, rows);

    // Composite crossfade if transitioning
    if (isTransitioning && capturedFrame) {
      lines = compositeFrames(capturedFrame, lines, progress);
    }

    // Clear capture when transition ends
    if (!isTransitioning) {
      capturedFrame = null;
    }

    // Pad to fill screen
    while (lines.length < rows) {
      lines.push("");
    }
    if (lines.length > rows) {
      lines.length = rows;
    }

    lastRenderedLines = lines;

    // Build frame: move to top-left, write each line with clear-to-EOL
    const frame = `\x1b[H${lines.map((line) => line + "\x1b[K").join("\n")}`;
    scheduleWrite(frame);
  });

  // Safety: if the effect didn't fire synchronously (SolidJS 1.7+ defers
  // createEffect), force-write the initial frame so the user sees something.
  if (firstFrame) {
    const cols = state.columns();
    const rows = state.rows();
    let lines = buildLines(state, cols, rows);
    while (lines.length < rows) lines.push("");
    if (lines.length > rows) lines.length = rows;
    lastRenderedLines = lines;
    firstFrame = false;
    write(`\x1b[H${lines.map((line) => line + "\x1b[K").join("\n")}`);
  }
}

function buildLines(state: TuiState, cols: number, rows: number): string[] {
  const currentScreen = state.screen();

  // Screen-level routing
  if (currentScreen === "home") {
    return renderHome(state, cols, rows);
  } else if (currentScreen === "repo-picker") {
    return renderRepoPicker(state, cols, rows);
  }

  // Optimize/verify screens: route by stage
  const currentStage = state.stage();

  switch (currentStage) {
    case "welcome":
      return renderWelcome(state, cols, rows);
    case "scanning":
      return renderScanning(state, cols, rows);
    case "inference":
      return renderInference(state, cols, rows);
    case "review":
      return renderReview(state, cols, rows);
    case "applying":
      return renderApplying(state, cols, rows);
    case "complete":
      return renderComplete(state, cols, rows);
    default:
      return ["Unknown stage"];
  }
}

/**
 * Composite two frames for a crossfade transition.
 *
 * Phase 1 (0→40%): Show outgoing frame with dim
 * Phase 2 (40→70%): Show incoming frame with dim
 * Phase 3 (70→100%): Show incoming frame at full brightness
 */
function compositeFrames(
  outgoing: string[],
  incoming: string[],
  progress: number,
): string[] {
  if (progress < 0.4) {
    return outgoing.map((line) => dim(line));
  }
  if (progress < 0.7) {
    return incoming.map((line) => dim(line));
  }
  return incoming;
}
