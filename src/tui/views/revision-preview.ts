import path from "node:path";
import type { TuiState } from "../state.ts";
import { bgGray, white, black, cyan, dim, green, yellow } from "../colors.ts";
import { prepare, layout, materializeToStrings } from "../typeset.ts";
import { parsePromptDocument } from "../../prompts.ts";

export function renderRevisionPreview(state: TuiState, cols: number, rows: number): string[] {
  const previewPath = state.state.revisions.previewPath;
  const content = state.state.revisions.previewContent;
  const filename = previewPath ? path.basename(previewPath) : "Revision";
  const parsed = parsePromptDocument(content);

  const lines: string[] = [];
  lines.push(bgGray(white(` Preview: ${filename.padEnd(Math.max(0, cols - 11))} `)));

  const metaBits: string[] = [];
  if (parsed.hasFrontmatter) {
    const meta = parsed.metadata;
    if (meta.status) {
      metaBits.push(meta.status === "ready" ? green(`[${meta.status}]`) : meta.status === "draft" ? yellow(`[${meta.status}]`) : cyan(`[${meta.status}]`));
    }
    if (meta.category) metaBits.push(dim(`[${meta.category}]`));
    if (meta.updatedAt) metaBits.push(dim(`updated ${meta.updatedAt.slice(0, 10)}`));
  }
  if (previewPath) {
    metaBits.push(dim(path.dirname(previewPath)));
  }
  lines.push(dim(` ${metaBits.join(" ")}`.trim()));
  lines.push("");

  const contentLines = content.split("\n");
  const maxLen = Math.max(10, cols - 8);

  for (let i = 0; i < contentLines.length; i++) {
    const lineStr = contentLines[i] || "";
    const prepared = prepare(lineStr, { whiteSpace: "pre-wrap", wordBreak: "break-all" });
    const chunks = materializeToStrings(prepared, layout(prepared, maxLen));
    const renderedChunks = chunks.length > 0 ? chunks : [""];

    for (let chunkIdx = 0; chunkIdx < renderedChunks.length; chunkIdx++) {
      const chunk = renderedChunks[chunkIdx];
      const prefix = chunkIdx === 0 ? `${dim((i + 1).toString().padStart(4))} │ ` : `${dim("   ... │ ")}`;
      lines.push(`${prefix}${chunk}`);
    }
  }

  while (lines.length < rows - 2) {
    lines.push("");
  }

  lines.push("");
  lines.push(dim(" [r] Restore   [v] Save as Variant   [c] Copy   [Esc] Back "));

  return lines;
}
