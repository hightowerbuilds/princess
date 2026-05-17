import type { TuiState } from "../state.ts";
import { themed } from "../theme.ts";
import { panel, truncateEnd } from "../typeset-compose.ts";
import { parsePromptDocument } from "../../prompts.ts";
import { formatRevisionTimestamp } from "../../revisions.ts";
import path from "node:path";

export function renderRevisions(state: TuiState, cols: number, rows: number): string[] {
  const revisions = state.state.revisions.files;
  const cursor = state.state.revisions.cursor;
  const offset = state.state.revisions.scrollOffset;
  const filename = state.state.editor.file ? path.basename(state.state.editor.file) : "Untitled";

  // Panel takes 2 rows for borders; leave one trailing line for breathing room.
  const innerHeight = Math.max(rows - 3, 5);
  const body: string[] = [];

  if (revisions.length === 0) {
    body.push("");
    body.push(themed.dim(" No saved revisions yet."));
  } else {
    for (let i = offset; i < Math.min(revisions.length, offset + innerHeight); i++) {
      const revision = revisions[i];
      const parsed = parsePromptDocument(revision.content);
      const preview = parsed.preview || parsed.metadata.title || "";
      const timestamp = formatRevisionTimestamp(revision.createdAt);
      const deltas = revision.added != null || revision.removed != null
        ? ` (${revision.added ? `+${revision.added}` : ""} ${revision.removed ? `-${revision.removed}` : ""})`.trim()
        : "";
      const row = `${timestamp}${deltas} ${preview ? `- ${preview}` : ""}`.trim();

      if (i === cursor) {
        body.push(themed.selection(` > ${truncateEnd(row, Math.max(0, cols - 8))}`));
      } else {
        body.push(`   ${truncateEnd(row, Math.max(0, cols - 8))}`);
      }
    }
  }

  while (body.length < innerHeight) body.push("");

  return panel(body, cols, {
    border: "rounded",
    title: `Revisions — ${filename}`,
    hotkeys: "↵ preview · r restore · v variant · c copy · esc back",
    borderColor: themed.border,
    borderFocusColor: themed.borderFocus,
    focused: true,
    titleStyle: themed.title,
    hotkeyStyle: themed.dim,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  });
}
