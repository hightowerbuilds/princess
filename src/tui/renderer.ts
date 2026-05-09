import { createEffect, createMemo } from "solid-js";
import type { TuiState } from "./state.ts";
import { write } from "./terminal.ts";
import { dim } from "./colors.ts";
import { createCrossfade } from "./motion.ts";
import { renderInbox } from "./views/inbox.ts";
import { renderEditor } from "./views/editor.ts";

export function createRenderer(state: TuiState): void {
  let pendingFrame: string | null = null;
  let scheduled = false;
  let firstFrame = true;
  let lastRenderedLines: string[] = [];
  let capturedFrame: string[] | null = null;

  // Track screen changes for crossfade transitions
  const sceneKey = createMemo(() => state.screen());
  const crossfade = createCrossfade(sceneKey, { duration: 250 });

  function flush(): void {
    scheduled = false;
    if (pendingFrame !== null) {
      write(pendingFrame);
      pendingFrame = null;
    }
  }

  function scheduleWrite(frame: string): void {
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

    if (isTransitioning && capturedFrame === null && lastRenderedLines.length > 0) {
      capturedFrame = [...lastRenderedLines];
    }

    let lines = buildLines(state, cols, rows);

    if (isTransitioning && capturedFrame) {
      lines = compositeFrames(capturedFrame, lines, progress);
    }

    if (!isTransitioning) {
      capturedFrame = null;
    }

    while (lines.length < rows) {
      lines.push("");
    }
    if (lines.length > rows) {
      lines.length = rows;
    }

    lastRenderedLines = lines;

    const frame = `\x1b[H${lines.map((line) => line + "\x1b[K").join("\n")}`;
    scheduleWrite(frame);
  });

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

  if (currentScreen === "inbox") {
    return renderInbox(state, cols, rows);
  } else if (currentScreen === "editor") {
    return renderEditor(state, cols, rows);
  }
  return ["Unknown screen"];
}

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
