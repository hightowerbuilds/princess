import { createEffect } from "solid-js";
import type { TuiState } from "./state.ts";
import { write } from "./terminal.ts";
import { renderInbox } from "./views/inbox.ts";
import { renderEditor } from "./views/editor.ts";
import { renderDiff } from "./views/diff.ts";
import { renderRevisions } from "./views/revisions.ts";
import { renderRevisionPreview } from "./views/revision-preview.ts";
import { renderHelp } from "./views/help.ts";

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
    const cols = state.state.terminal.columns;
    const rows = state.state.terminal.rows;

    const { lines, cursor: viewCursor } = buildLines(state, cols, rows);

    const displayLines = [...lines];
    while (displayLines.length < rows) {
      displayLines.push("");
    }
    if (displayLines.length > rows) {
      displayLines.length = rows;
    }

    let frame = `\x1b[H${displayLines.map((line) => line + "\x1b[K").join("\n")}`;
    
    if (viewCursor) {
      // Append move cursor and show cursor to the same frame write
      frame += `\x1b[${viewCursor.row + 1};${viewCursor.col + 1}H\x1b[?25h`;
    } else {
      frame += `\x1b[?25l`; // Hide cursor if not specified
    }

    scheduleWrite(frame);
  });

}

interface RenderResult {
  lines: string[];
  cursor?: { row: number; col: number } | null;
}

function buildLines(state: TuiState, cols: number, rows: number): RenderResult {
  const currentScreen = state.state.screen;

  if (currentScreen === "inbox") {
    return { lines: renderInbox(state, cols, rows) };
  } else if (currentScreen === "editor") {
    return renderEditor(state, cols, rows);
  } else if (currentScreen === "diff") {
    return { lines: renderDiff(state, cols, rows) };
  } else if (currentScreen === "revisions") {
    return { lines: renderRevisions(state, cols, rows) };
  } else if (currentScreen === "revision-preview") {
    return { lines: renderRevisionPreview(state, cols, rows) };
  } else if (currentScreen === "help") {
    return { lines: renderHelp(state, cols, rows) };
  }
  return { lines: ["Unknown screen"] };
}
