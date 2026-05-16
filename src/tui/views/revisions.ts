import type { TuiState } from "../state.ts";
import { dim, bgGray, white, black, cyan } from "../colors.ts";
import { truncateEnd } from "../typeset-compose.ts";
import { parsePromptDocument } from "../../prompts.ts";
import path from "node:path";

export function renderRevisions(state: TuiState, cols: number, rows: number): string[] {
  const revisions = state.state.revisions.files;
  const cursor = state.state.revisions.cursor;
  const offset = state.state.revisions.scrollOffset;
  const filename = state.state.editor.file ? path.basename(state.state.editor.file) : "Untitled";
  const listHeight = Math.max(rows - 10, 5);

  const lines: string[] = [];
  lines.push(bgGray(white(` Revisions: ${filename.padEnd(Math.max(0, cols - 12))} `)));
  lines.push(dim(" [Enter] Preview   [v] Save as Variant   [c] Copy   [Esc] Back   [Ctrl+/] Help "));
  lines.push("");

  if (revisions.length === 0) {
    lines.push(dim(" No saved revisions yet."));
  } else {
    for (let i = offset; i < Math.min(revisions.length, offset + listHeight); i++) {
      const revision = revisions[i];
      const parsed = parsePromptDocument(revision.content);
      const preview = parsed.preview || parsed.metadata.title || "";
      const timestamp = revision.createdAt.slice(0, 10);
      const deltas = revision.added != null || revision.removed != null 
        ? ` (${revision.added ? `+${revision.added}` : ""} ${revision.removed ? `-${revision.removed}` : ""})`.trim()
        : "";
      const row = `${timestamp}${deltas} ${preview ? `- ${preview}` : ""}`.trim();

      if (i === cursor) {
        lines.push(bgGray(white(` > ${truncateEnd(row, Math.max(0, cols - 3)).padEnd(Math.max(0, cols - 2))}`)));
      } else {
        lines.push(`   ${truncateEnd(row, Math.max(0, cols - 3))}`);
      }
    }
  }

  while (lines.length < rows - 2) {
    lines.push("");
  }

  lines.push("");
  lines.push(dim(" [Enter] Preview   [r] Restore from preview   [v] Variant   [c] Copy   [Esc] Back "));

  return lines;
}
