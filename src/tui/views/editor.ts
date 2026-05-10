import type { TuiState } from "../state.ts";
import { dim, bold, cyan, bgDodgerBlue, black } from "../colors.ts";
import { prepare, layout, materializeToStrings } from "../typeset.ts";
import path from "node:path";

export function renderEditor(state: TuiState, cols: number, rows: number): string[] {
  const currentFile = state.currentFile();
  const content = state.fileContent();
  const cLine = state.editorCursorLine();
  const cCol = state.editorCursorCol();

  const lines: string[] = [];
  const filename = currentFile ? path.basename(currentFile) : "Untitled";

  lines.push(bgDodgerBlue(black(` Editor: ${filename.padEnd(cols - 10)} `)));
  lines.push("");

  const contentLines = content.split('\n');
  const maxLen = Math.max(10, cols - 8);
  
  // Flatten file lines into visual chunks based on width
  interface VisualLine {
    text: string;
    isCursor: boolean;
  }
  
  const visualBuffer: VisualLine[] = [];
  let cursorVisualIdx = 0;

  for (let i = 0; i < contentLines.length; i++) {
    const lineStr = contentLines[i] || "";
    const isCursorLine = i === cLine;
    
    if (lineStr.length === 0) {
      if (isCursorLine) {
        cursorVisualIdx = visualBuffer.length;
        visualBuffer.push({ text: `${dim((i + 1).toString().padStart(4))} │ ${bgDodgerBlue(black(" "))}`, isCursor: true });
      } else {
        visualBuffer.push({ text: `${dim((i + 1).toString().padStart(4))} │ `, isCursor: false });
      }
      continue;
    }

    let chunks: string[];

    if (!isCursorLine) {
      const p = prepare(lineStr, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
      chunks = materializeToStrings(p, layout(p, maxLen));
    } else {
      let before = lineStr.slice(0, cCol);
      let at = lineStr[cCol] || " ";
      let after = lineStr.slice(cCol + 1);

      // Safely extract surrogate pairs to avoid splitting emojis
      if (at >= "\uD800" && at <= "\uDBFF" && after.length > 0) {
        at += after[0];
        after = after.slice(1);
      } else if (at >= "\uDC00" && at <= "\uDFFF" && before.length > 0) {
        at = before[before.length - 1] + at;
        before = before.slice(0, -1);
      }

      const markedText = before + bgDodgerBlue(black(at)) + "\u200B" + after;
      const p = prepare(markedText, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
      chunks = materializeToStrings(p, layout(p, maxLen));
    }

    if (chunks.length === 0) chunks = [""];

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const prefix = chunkIdx === 0 ? `${dim((i + 1).toString().padStart(4))} │ ` : `${dim("   ... │ ")}`;
      
      if (isCursorLine && chunk.includes("\u200B")) {
        cursorVisualIdx = visualBuffer.length;
        // Clean up the zero-width space used to anchor the ANSI sequence
        visualBuffer.push({ text: `${prefix}${chunk.replace("\u200B", "")}`, isCursor: true });
      } else {
        visualBuffer.push({ text: `${prefix}${chunk}`, isCursor: false });
      }
    }
  }

  // Calculate view port based on visual buffer
  const editorHeight = rows - 4; // Header, footer
  let startIdx = Math.max(0, cursorVisualIdx - Math.floor(editorHeight / 2));
  let endIdx = Math.min(visualBuffer.length, startIdx + editorHeight);

  if (endIdx - startIdx < editorHeight) {
      startIdx = Math.max(0, endIdx - editorHeight);
  }

  for (let i = startIdx; i < endIdx; i++) {
    lines.push(visualBuffer[i].text);
  }

  // Pad remaining height
  while (lines.length < rows - 2) {
      lines.push(`${dim("   ~ │")}`);
  }

  lines.push("");
  lines.push(dim(` [Esc] Inbox  [PgUp/PgDn] Scroll  [Ctrl+C] Copy  Ln ${cLine + 1}, Col ${cCol + 1} `));

  return lines;
}
