import type { TuiState } from "../state.ts";
import { themed, statusStyle } from "../theme.ts";
import { prepare, layout, materializeToStrings, stringWidth } from "../typeset.ts";
import { panel } from "../typeset-compose.ts";
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
  // Filename moved into the panel title; metadata + save indicator
  // remain as body lines.
  const headerLines: string[] = [];

  if (parsed.hasFrontmatter) {
    const meta = parsed.metadata;
    const status = meta.status ? statusStyle(meta.status, `[${meta.status}]`) : "";
    const category = meta.category ? themed.dim(`[${meta.category}]`) : "";
    const updated = meta.updatedAt ? themed.dim(`updated ${meta.updatedAt.slice(0, 10)}`) : "";
    headerLines.push(`${status} ${category} ${updated}`.trim());
  }

  const readOnly = state.state.editor.readOnly;
  const statusIndicator = readOnly
    ? "[read-only]"
    : saveState === "conflict"
      ? themed.accent("[external change]")
      : saveState === "saving"
        ? "[saving]"
        : saveState === "dirty"
          ? "[dirty]"
          : saveState === "error"
            ? themed.ember("[save error]")
            : "[saved]";
  headerLines.push(saveState === "conflict" ? statusIndicator : themed.dim(statusIndicator));

  const headerCard = panel(headerLines, cols - 1, {
    border: "rounded",
    title: `Editor — ${filename}`,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: themed.border,
    borderFocusColor: themed.borderFocus,
    titleStyle: themed.title,
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
      const markedText = before + "\u200B" + at + after;
      const p = prepare(markedText, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
      chunks = materializeToStrings(p, layout(p, maxLen));
    }

    if (chunks.length === 0) chunks = [""];

    // \u2500\u2500 Locate the cursor's true visual chunk \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // The marker is a zero-width space. During wrap it can stick to
    // either side of a line break: it commonly ends up at the *end*
    // of the previous chunk even though the cursor character itself
    // sits at the start of the next chunk. If we trusted the marker's
    // chunk blindly, the row highlight (which follows the marker)
    // would lag one row behind the hardware cursor (which follows the
    // cursor character). Detect that case and attribute the cursor to
    // the next chunk at column 0.
    let cursorChunkIdx = -1;
    let cursorCol = 0;
    if (isCursorLine) {
      for (let ci = 0; ci < chunks.length; ci++) {
        const idx = chunks[ci].indexOf("\u200B");
        if (idx < 0) continue;
        const trailing = idx === chunks[ci].length - 1;
        const hasNext = ci + 1 < chunks.length;
        if (trailing && hasNext) {
          cursorChunkIdx = ci + 1;
          cursorCol = 0;
        } else {
          cursorChunkIdx = ci;
          cursorCol = stringWidth(chunks[ci].slice(0, idx));
        }
        break;
      }
    }

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const cleaned = chunks[chunkIdx].replace("\u200B", "");
      if (chunkIdx === cursorChunkIdx) {
        cursorVisualIdx = visualBuffer.length;
        visualBuffer.push({ text: cleaned, isCursor: true, cursorCol });
      } else {
        visualBuffer.push({ text: cleaned, isCursor: false });
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
    visibleBodyLines.push(
      visibleBodyLines.length === (cursorVisualIdx - startIdx)
        ? themed.selection(visualBuffer[i].text)
        : visualBuffer[i].text,
    );
  }

  while (visibleBodyLines.length < editorHeight) {
    visibleBodyLines.push("");
  }

  const bodyCard = panel(visibleBodyLines, cols - 1, {
    border: "rounded",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: themed.border,
    borderFocusColor: themed.borderFocus,
    focused: true,
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
  if (saveState === "conflict") {
    const conflictHints = ` File changed on disk.  [Ctrl+S] Overwrite  [Esc] Discard your edits  Ln ${cLine + 1}, Col ${cCol + 1} `;
    finalLines.push(themed.accent(conflictHints));
  } else {
    const footerHints = readOnly
      ? ` [Esc] Inbox  [o] Browser  [Ctrl+C] Copy  [Ctrl+/] Help  Ln ${cLine + 1}, Col ${cCol + 1} `
      : ` [Esc] Inbox  [Ctrl+S] Save  [Ctrl+R] Diff  [Ctrl+P] Revisions  [Ctrl+C] Copy  [Ctrl+/] Help  Ln ${cLine + 1}, Col ${cCol + 1} `;
    finalLines.push(themed.dim(footerHints));
  }

  return { lines: finalLines, cursor: hardwareCursor };
}
