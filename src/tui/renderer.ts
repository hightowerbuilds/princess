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
    const cols = state.columns();
    const rows = state.rows();

    let lines = buildLines(state, cols, rows);

    while (lines.length < rows) {
      lines.push("");
    }
    if (lines.length > rows) {
      lines.length = rows;
    }

    const frame = `\x1b[H${lines.map((line) => line + "\x1b[K").join("\n")}`;
    scheduleWrite(frame);
  });

  if (firstFrame) {
    const cols = state.columns();
    const rows = state.rows();
    let lines = buildLines(state, cols, rows);
    while (lines.length < rows) lines.push("");
    if (lines.length > rows) lines.length = rows;
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
  } else if (currentScreen === "diff") {
    return renderDiff(state, cols, rows);
  } else if (currentScreen === "revisions") {
    return renderRevisions(state, cols, rows);
  } else if (currentScreen === "revision-preview") {
    return renderRevisionPreview(state, cols, rows);
  } else if (currentScreen === "help") {
    return renderHelp(state, cols, rows);
  }
  return ["Unknown screen"];
}
