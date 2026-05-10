import type { TuiState } from "../state.ts";
import { dim, bgGray, white, black, cyan, green, yellow } from "../colors.ts";
import { prepare, layout, materializeToStrings } from "../typeset.ts";
import { box } from "../typeset-compose.ts";
import { dropShadow } from "../aesthetics.ts";
import path from "node:path";
import { parsePromptDocument } from "../../prompts.ts";

export function renderEditor(state: TuiState, cols: number, rows: number): string[] {
  const currentFile = state.currentFile();
  const content = state.fileContent();
  const cLine = state.editorCursorLine();
  const cCol = state.editorCursorCol();
  const saveState = state.editorSaveState();

  const filename = currentFile ? path.basename(currentFile) : "Untitled";
  const parsed = parsePromptDocument(content);

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
  
  const saveIndicator = saveState !== "clean" 
    ? (saveState === "saving" ? "[saving]" : saveState === "dirty" ? "[dirty]" : "[save error]")
    : "[saved]";
  headerLines.push(dim(saveIndicator));

  const headerCard = box(headerLines, cols - 1, {
    border: "single",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: white,
    contentStyle: (s) => bgGray(white(s))
  });

  // ── Body Card ──────────────────────────────────────────────────────────
  const contentLines = content.split('\n');
  // Box has 2 borders + 2 padding = 4 columns overhead
  // Prefix has 4 (line num) + 3 (pipe) = 7 columns overhead
  // Shadow has 1 column overhead
  const maxLen = Math.max(10, cols - 4 - 7 - 4 - 1); 
  
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
        visualBuffer.push({ text: `${dim((i + 1).toString().padStart(4))} │ ${bgGray(white(" "))}`, isCursor: true });
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

      if (at >= "\uD800" && at <= "\uDBFF" && after.length > 0) {
        at += after[0];
        after = after.slice(1);
      } else if (at >= "\uDC00" && at <= "\uDFFF" && before.length > 0) {
        at = before[before.length - 1] + at;
        before = before.slice(0, -1);
      }

      const markedText = before + bgGray(white(at)) + "\u200B" + after;
      const p = prepare(markedText, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
      chunks = materializeToStrings(p, layout(p, maxLen));
    }

    if (chunks.length === 0) chunks = [""];

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const prefix = chunkIdx === 0 ? `${dim((i + 1).toString().padStart(4))} │ ` : `${dim("   ... │ ")}`;
      
      if (isCursorLine && chunk.includes("\u200B")) {
        cursorVisualIdx = visualBuffer.length;
        visualBuffer.push({ text: `${prefix}${chunk.replace("\u200B", "")}`, isCursor: true });
      } else {
        visualBuffer.push({ text: `${prefix}${chunk}`, isCursor: false });
      }
    }
  }

  // Calculate view port
  const footerHeight = 2;
  const headerHeight = headerCard.length + 1; // +1 for header shadow
  const editorHeight = rows - headerHeight - footerHeight - 3; // -2 for borders, -1 for shadow
  
  let startIdx = Math.max(0, cursorVisualIdx - Math.floor(editorHeight / 2));
  let endIdx = Math.min(visualBuffer.length, startIdx + editorHeight);

  if (endIdx - startIdx < editorHeight) {
      startIdx = Math.max(0, endIdx - editorHeight);
  }

  const visibleBodyLines: string[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    visibleBodyLines.push(visualBuffer[i].text);
  }

  // Pad remaining height
  while (visibleBodyLines.length < editorHeight) {
    visibleBodyLines.push(`${dim("   ~ │")}`);
  }

  const bodyCard = box(visibleBodyLines, cols - 1, {
    border: "single",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: white,
    contentStyle: (s) => bgGray(white(s))
  });

  const finalLines: string[] = [];
  finalLines.push(...dropShadow(headerCard, cols - 1));
  finalLines.push(...dropShadow(bodyCard, cols - 1));
  finalLines.push("");
  finalLines.push(dim(` [Esc] Inbox  [Ctrl+S] Save  [Ctrl+R] Diff  [Ctrl+P] Revisions  [Ctrl+C] Copy  [Ctrl+/] Help  Ln ${cLine + 1}, Col ${cCol + 1} `));

  return finalLines;
}
