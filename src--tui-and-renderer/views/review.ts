import { bold, cyan, dim, gray, green, red, yellow, inverse, fg256 } from "../colors.ts";
import { ARROW_RIGHT, emptyLine, horizontalRule, indent } from "../layout.ts";
import { columns, truncateEnd, breakpoint } from "../typeset-compose.ts";
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

  // Scrollable list with stagger + cursor trail + elastic overscroll
  const listHeight = Math.max(rows - 8, 5);
  const bounceValue = state.reviewBounce.value();
  const bounceShift = Math.round(bounceValue);
  const visibleItems = items.slice(scrollOffset, scrollOffset + listHeight);
  const getStaggerOpacity = state.reviewStagger;
  const getTrailOpacity = state.reviewCursorTrail;

  // Elastic overscroll: insert/remove blank lines to simulate content shift
  if (bounceShift > 0) {
    // Bouncing at bottom — push content up (insert blanks at top)
    for (let i = 0; i < Math.min(bounceShift, listHeight); i++) {
      lines.push(emptyLine());
    }
  }

  const renderCount = bounceShift !== 0
    ? Math.max(0, listHeight - Math.abs(bounceShift))
    : visibleItems.length;

  const startIdx = bounceShift < 0 ? Math.abs(bounceShift) : 0;

  for (let i = startIdx; i < startIdx + renderCount && i < visibleItems.length; i++) {
    const item = visibleItems[i];
    const globalIndex = scrollOffset + i;
    const isCursor = globalIndex === cursor;

    // Staggered reveal: dim items that haven't fully appeared yet
    const staggerOpacity = getStaggerOpacity(globalIndex);

    // Cursor trail: subtle highlight on recently-visited positions
    const trailOpacity = getTrailOpacity(globalIndex);

    let line = formatProposalLine(item, isCursor, cols - 4);

    if (staggerOpacity < 1 && !isCursor) {
      line = dim(line);
    } else if (trailOpacity > 0 && !isCursor) {
      // Apply subtle trail highlight using 256-color dim cyan
      const trailColor = Math.round(236 + trailOpacity * 8); // grayscale 236-244
      line = fg256(trailColor, line);
    }

    lines.push(indent(line, 2));
  }

  // Pad to fill remaining list height
  const linesUsed = lines.length - 4; // subtract header lines
  for (let i = linesUsed; i < listHeight; i++) {
    lines.push(emptyLine());
  }

  // Footer
  lines.push(indent(horizontalRule(ruleWidth), 2));

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
