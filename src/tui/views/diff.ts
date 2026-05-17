import type { TuiState } from "../state.ts";
import { themed, diffAdded, diffRemoved } from "../theme.ts";
import { panel, truncateEnd } from "../typeset-compose.ts";
import path from "node:path";

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function renderDiffLines(oldText: string, newText: string, width: number): string[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const lines: string[] = [];
  const visibleWidth = Math.max(12, width - 12);

  const pushContext = (line: string) => {
    lines.push(themed.dim(`   ${truncateEnd(line, visibleWidth)}`));
  };

  for (let i = 0; i < prefix; i++) {
    pushContext(oldLines[i]);
  }

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  const middleLength = Math.max(oldMiddle.length, newMiddle.length);

  for (let i = 0; i < middleLength; i++) {
    const oldLine = oldMiddle[i];
    const newLine = newMiddle[i];

    if (oldLine != null) {
      lines.push(diffRemoved(` - ${truncateEnd(oldLine, visibleWidth)}`));
    }
    if (newLine != null) {
      lines.push(diffAdded(` + ${truncateEnd(newLine, visibleWidth)}`));
    }
  }

  for (let i = 0; i < suffix; i++) {
    pushContext(oldLines[oldLines.length - suffix + i]);
  }

  return lines.length > 0 ? lines : [themed.dim("   (no differences)")];
}

export function renderDiff(state: TuiState, cols: number, rows: number): string[] {
  const oldContent = state.state.diff.oldContent;
  const newContent = state.state.diff.newContent;
  const currentFile = state.state.editor.file;
  const revisionPath = state.state.diff.revisionPath;
  const filename = currentFile ? path.basename(currentFile) : "Untitled";

  const innerHeight = Math.max(rows - 3, 5);
  const body: string[] = [];

  body.push(themed.dim(` ${revisionPath ? `vs ${path.basename(revisionPath)}` : "revision"}`));
  body.push("");
  body.push(...renderDiffLines(oldContent, newContent, cols));

  while (body.length < innerHeight) body.push("");

  return panel(body, cols, {
    border: "rounded",
    title: `Diff — ${filename}`,
    hotkeys: "esc back to editor",
    borderColor: themed.border,
    borderFocusColor: themed.borderFocus,
    focused: true,
    titleStyle: themed.title,
    hotkeyStyle: themed.dim,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  });
}
