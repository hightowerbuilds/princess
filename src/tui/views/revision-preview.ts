import path from "node:path";
import type { TuiState } from "../state.ts";
import { themed, statusStyle } from "../theme.ts";
import { panel } from "../typeset-compose.ts";
import { prepare, layout, materializeToStrings } from "../typeset.ts";
import { parsePromptDocument } from "../../prompts.ts";

export function renderRevisionPreview(state: TuiState, cols: number, rows: number): string[] {
  const previewPath = state.state.revisions.previewPath;
  const content = state.state.revisions.previewContent;
  const filename = previewPath ? path.basename(previewPath) : "Revision";
  const parsed = parsePromptDocument(content);

  const innerHeight = Math.max(rows - 3, 5);
  const body: string[] = [];

  const metaBits: string[] = [];
  if (parsed.hasFrontmatter) {
    const meta = parsed.metadata;
    if (meta.status) {
      metaBits.push(statusStyle(meta.status, `[${meta.status}]`));
    }
    if (meta.category) metaBits.push(themed.dim(`[${meta.category}]`));
    if (meta.updatedAt) metaBits.push(themed.dim(`updated ${meta.updatedAt.slice(0, 10)}`));
  }
  if (previewPath) {
    metaBits.push(themed.dim(path.dirname(previewPath)));
  }
  if (metaBits.length > 0) {
    body.push(themed.dim(" ") + metaBits.join(" "));
    body.push("");
  }

  const contentLines = content.split("\n");
  const maxLen = Math.max(10, cols - 12);

  for (let i = 0; i < contentLines.length; i++) {
    const lineStr = contentLines[i] || "";
    const prepared = prepare(lineStr, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
    const chunks = materializeToStrings(prepared, layout(prepared, maxLen));
    const renderedChunks = chunks.length > 0 ? chunks : [""];

    for (let chunkIdx = 0; chunkIdx < renderedChunks.length; chunkIdx++) {
      const chunk = renderedChunks[chunkIdx];
      const prefix = chunkIdx === 0
        ? `${themed.dim((i + 1).toString().padStart(4))} │ `
        : `${themed.dim("   ... │ ")}`;
      body.push(`${prefix}${chunk}`);
    }
  }

  while (body.length < innerHeight) body.push("");

  return panel(body, cols, {
    border: "rounded",
    title: `Preview — ${filename}`,
    hotkeys: "r restore · v variant · c copy · esc back",
    borderColor: themed.border,
    borderFocusColor: themed.borderFocus,
    focused: true,
    titleStyle: themed.title,
    hotkeyStyle: themed.dim,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  });
}
