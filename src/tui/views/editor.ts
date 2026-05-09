import type { TuiState } from "../state.ts";
import { dim, bold, cyan, bgDodgerBlue, black } from "../colors.ts";
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

    const numChunks = Math.ceil(lineStr.length / maxLen);
    
    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      const chunk = lineStr.slice(chunkIdx * maxLen, (chunkIdx + 1) * maxLen);
      const prefix = chunkIdx === 0 ? `${dim((i + 1).toString().padStart(4))} │ ` : `${dim("   ... │ ")}`;
      
      if (isCursorLine) {
        const startCol = chunkIdx * maxLen;
        const endCol = startCol + maxLen;
        // Check if cursor is in this chunk. Special case: cursor at end of line goes to last chunk.
        const isCursorHere = (cCol >= startCol && cCol < endCol) || (cCol === lineStr.length && chunkIdx === numChunks - 1);
        
        if (isCursorHere) {
          cursorVisualIdx = visualBuffer.length;
          const localCol = cCol - startCol;
          const before = chunk.slice(0, localCol);
          const at = chunk[localCol] || " ";
          const after = chunk.slice(localCol + 1);
          visualBuffer.push({ text: `${prefix}${before}${bgDodgerBlue(black(at))}${after}`, isCursor: true });
        } else {
          visualBuffer.push({ text: `${prefix}${chunk}`, isCursor: false });
        }
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
