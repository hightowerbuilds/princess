import { bold, cyan, dim, gray, green, red, yellow, inverse } from "../colors.ts";
import { ARROW_RIGHT, emptyLine, horizontalRule, indent, spinnerFrame } from "../layout.ts";
import { columns, truncateEnd, truncatePath, breakpoint } from "../typeset-compose.ts";
import { stringWidth } from "../typeset.ts";
import type { TuiState, ProposalReviewItem } from "../state.ts";

export function renderReview(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const items = state.reviewItems();
  const cursor = state.reviewCursor();
  const scrollOffset = state.reviewScrollOffset();
  const renameCount = state.renameCount();
  const keepCount = state.keepCount();
  const total = state.totalProposals();

  // Header
  lines.push(emptyLine());
  const header = bold(cyan("Princess")) + dim(" — Review Proposals");
  const stats = dim(`${renameCount} rename / ${keepCount} keep`);
  const headerLine = "  " + columns([
    { content: header, flex: 1 },
    { content: stats },
  ], cols - 4);
  lines.push(headerLine);
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 70, wide: 70 });
  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(emptyLine());

  // Scrollable list
  const listHeight = Math.max(rows - 8, 5);
  const visibleItems = items.slice(scrollOffset, scrollOffset + listHeight);

  for (let i = 0; i < visibleItems.length; i++) {
    const item = visibleItems[i];
    const globalIndex = scrollOffset + i;
    const isCursor = globalIndex === cursor;
    const line = formatProposalLine(item, isCursor, cols - 4);
    lines.push(indent(line, 2));
  }

  // Pad if fewer items than list height
  for (let i = visibleItems.length; i < listHeight; i++) {
    lines.push(emptyLine());
  }

  // Footer
  lines.push(indent(horizontalRule(Math.min(cols - 4, 70)), 2));

  const keyHints = [
    `${bold("[Space]")} toggle`,
    `${bold("[a]")} approve all`,
    `${bold("[n]")} reject all`,
    `${bold("[Enter]")} apply`,
    `${bold("[q]")} quit`,
  ].join("  ");

  lines.push(indent(keyHints, 2));

  const scrollInfo = dim(`Showing ${scrollOffset + 1}-${Math.min(scrollOffset + listHeight, total)} of ${total}`);
  lines.push(indent(scrollInfo, 2));

  return lines;
}

function formatProposalLine(item: ProposalReviewItem, isCursor: boolean, maxWidth: number): string {
  const isRename = item.decision === "rename" || (item.proposedName !== item.currentName && item.userApproved);
  const isToggleable = item.decision === "rename" || item.decision === "keep";

  let checkbox: string;
  if (!isToggleable) {
    checkbox = dim("[=]");
  } else if (item.userApproved && item.proposedName !== item.currentName) {
    checkbox = green("[x]");
  } else {
    checkbox = dim("[ ]");
  }

  const cursor = isCursor ? cyan("> ") : "  ";
  const confidence = dim(`${item.confidence.toFixed(2)}`);

  let body: string;
  if (item.userApproved && item.proposedName !== item.currentName) {
    body = `${item.relativePath} ${ARROW_RIGHT} ${green(item.proposedName)}`;
  } else {
    body = `${item.relativePath} ${dim("= " + item.currentName)}`;
  }

  const line = `${cursor}${checkbox} ${body}  ${confidence}`;
  const truncated = truncateEnd(line, maxWidth);

  return isCursor ? inverse(truncated) : truncated;
}
