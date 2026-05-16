import type { TuiState } from "../state.ts";
import { dim, bgGray, white, black, cyan, green, yellow } from "../colors.ts";
import { prepare, layout, materializeToStrings, stringWidth } from "../typeset.ts";
import { box } from "../typeset-compose.ts";
import { dropShadow } from "../aesthetics.ts";
import path from "node:path";

export function renderEditor(state: TuiState, cols: number, rows: number): { lines: string[], cursor?: { row: number, col: number } | null } {
  const currentFile = state.state.editor.file;
  const content = state.state.editor.content;
  const cLine = state.state.editor.cursorLine;
  const cCol = state.state.editor.cursorCol;
  const saveState = state.state.editor.saveState;

  const filename = currentFile ? path.basename(currentFile) : "Untitled";
  const parsed = state.editorParsedPrompt();

  // ── Header Card ────────────────────────────────────────────────────────
  const headerLines: string[] = [];
  headerLines.push(`Editor: ${filename}`);
  
  if (parsed.hasFrontmatter) {
    const meta = parsed.metadata;
    const status = meta.status ? (meta.status === "ready" ? green(`[${meta.status}]`) : meta.status === "draft" ? yellow(`[${meta.status}]`) : cyan(`[${meta.status}]`)) : "";
    const category = meta.category ? dim(`[${meta.category}]`) : "";
    const updated = meta.updatedAt ? dim(`updated ${meta.updatedAt.slice(0, 10)}`) : "";
    headerLines.push(`${status} ${category} ${updated}`.trim());
  }
  
  const readOnly = state.state.editor.readOnly;
  const statusIndicator = readOnly
    ? "[read-only]"
    : saveState !== "clean"
      ? (saveState === "saving" ? "[saving]" : saveState === "dirty" ? "[dirty]" : "[save error]")
      : "[saved]";
  headerLines.push(dim(statusIndicator));

  const headerCard = box(headerLines, cols - 1, {
    border: "single",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: white,
    contentStyle: (s) => bgGray(white(s))
  });

  const headerCardWithShadow = dropShadow(headerCard, cols - 1);
  const headerHeight = headerCardWithShadow.length;

  // ── Body Card Content ──────────────────────────────────────────────────
  const contentLines = content.split('\n');
  const maxLen = Math.max(10, cols - 4 - 1); // -2 borders, -2 padding, -1 shadow
  
  interface VisualLine {
    text: string;
    isCursor: boolean;
    cursorCol?: number;
  }
  
  const visualBuffer: VisualLine[] = [];
  let cursorVisualIdx = 0;

  for (let i = 0; i < contentLines.length; i++) {
    const lineStr = contentLines[i] || "";
    const isCursorLine = i === cLine;
    
    if (lineStr.length === 0) {
      if (isCursorLine) {
        cursorVisualIdx = visualBuffer.length;
        visualBuffer.push({ text: " ", isCursor: true, cursorCol: 0 });
      } else {
        visualBuffer.push({ text: "", isCursor: false });
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

      if (at >= "\uD800" && at <= "\uDBFF" && after.length > 0) {
        at += after[0];
        after = after.slice(1);
      } else if (at >= "\uDC00" && at <= "\uDFFF" && before.length > 0) {
        at = before[before.length - 1] + at;
        before = before.slice(0, -1);
      }

      // Marker to find the cursor position in the laid-out chunks
      const markedText = before + "\u200B" + after;
      const p = prepare(markedText, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
      chunks = materializeToStrings(p, layout(p, maxLen));
    }

    if (chunks.length === 0) chunks = [""];

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      
      if (isCursorLine && chunk.includes("\u200B")) {
        cursorVisualIdx = visualBuffer.length;
        const cleaned = chunk.replace("\u200B", "");
        const cursorMarkerIdx = chunk.indexOf("\u200B");
        const textBeforeCursor = chunk.slice(0, cursorMarkerIdx);
        const visualCol = stringWidth(textBeforeCursor);

        visualBuffer.push({ text: cleaned, isCursor: true, cursorCol: visualCol });
      } else {
        visualBuffer.push({ text: chunk, isCursor: false });
      }
    }
  }

  // Viewport calculation
  const footerHeight = 2;
  const editorHeight = rows - headerHeight - footerHeight - 3; // -2 borders, -1 shadow
  
  let startIdx = Math.max(0, cursorVisualIdx - Math.floor(editorHeight / 2));
  let endIdx = Math.min(visualBuffer.length, startIdx + editorHeight);

  if (endIdx - startIdx < editorHeight) {
      startIdx = Math.max(0, endIdx - editorHeight);
  }

  const visibleBodyLines: string[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    visibleBodyLines.push(visibleBodyLines.length === (cursorVisualIdx - startIdx) ? 
        bgGray(white(visualBuffer[i].text)) : visualBuffer[i].text);
  }

  while (visibleBodyLines.length < editorHeight) {
    visibleBodyLines.push("");
  }

  const bodyCard = box(visibleBodyLines, cols - 1, {
    border: "single",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: white,
    contentStyle: (s) => bgGray(white(s))
  });
  const bodyCardWithShadow = dropShadow(bodyCard, cols - 1);

  // Precise hardware cursor calculation based on built array
  let hardwareCursor: { row: number, col: number } | null = null;
  const cursorVisualRow = cursorVisualIdx - startIdx;
  
  if (cursorVisualRow >= 0 && cursorVisualRow < editorHeight) {
    const vLine = visualBuffer[cursorVisualIdx];
    // Index of the line in the final array where content starts
    // Content starts at headerHeight + 1 (top border)
    const row = headerHeight + 1 + cursorVisualRow; 
    // Content starts at visual column 2 (border + padding)
    const col = 2 + (vLine.cursorCol ?? 0); 
    hardwareCursor = { row, col };
  }

  const finalLines: string[] = [];
  finalLines.push(...headerCardWithShadow);
  finalLines.push(...bodyCardWithShadow);
  finalLines.push("");
  const footerHints = readOnly
    ? ` [Esc] Inbox  [Ctrl+C] Copy  [Ctrl+/] Help  Ln ${cLine + 1}, Col ${cCol + 1} `
    : ` [Esc] Inbox  [Ctrl+S] Save  [Ctrl+R] Diff  [Ctrl+P] Revisions  [Ctrl+C] Copy  [Ctrl+/] Help  Ln ${cLine + 1}, Col ${cCol + 1} `;
  finalLines.push(dim(footerHints));

  return { lines: finalLines, cursor: hardwareCursor };
}
