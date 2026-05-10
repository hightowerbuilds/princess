import type { TuiState } from "../state.ts";
import { bold, dim, green, red, cyan } from "../colors.ts";
import { truncateEnd } from "../typeset-compose.ts";
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
  const visibleWidth = Math.max(12, width - 8);

  const pushContext = (line: string) => {
    lines.push(dim(`   ${truncateEnd(line, visibleWidth)}`));
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
      lines.push(red(` - ${truncateEnd(oldLine, visibleWidth)}`));
    }
    if (newLine != null) {
      lines.push(green(` + ${truncateEnd(newLine, visibleWidth)}`));
    }
  }

  for (let i = 0; i < suffix; i++) {
    pushContext(oldLines[oldLines.length - suffix + i]);
  }

  return lines.length > 0 ? lines : [dim("   (no differences)")];
}

export function renderDiff(state: TuiState, cols: number, rows: number): string[] {
  const oldContent = state.diffOldContent();
  const newContent = state.diffNewContent();
  const currentFile = state.currentFile();
  const revisionPath = state.diffRevisionPath();
  const filename = currentFile ? path.basename(currentFile) : "Untitled";

  const lines: string[] = [];
  lines.push(cyan(bold(` Diff: ${filename.padEnd(Math.max(0, cols - 7))} `)));
  lines.push(dim(` ${revisionPath ? `vs ${path.basename(revisionPath)}` : "revision"}`));
  lines.push("");
  lines.push(...renderDiffLines(oldContent, newContent, cols));

  while (lines.length < rows - 2) {
    lines.push("");
  }

  lines.push("");
  lines.push(dim(" [Esc] Back to editor   [Ctrl+/] Help "));

  return lines;
}
