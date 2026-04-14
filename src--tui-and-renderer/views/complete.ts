import { bold, cyan, dim, gray, green, red, yellow } from "../colors.ts";
import { CHECK_MARK, CROSS_MARK, emptyLine, horizontalRule, indent } from "../layout.ts";
import { columns, breakpoint } from "../typeset-compose.ts";
import type { TuiState } from "../state.ts";

export function renderComplete(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const manifest = state.manifest();
  const error = state.error();

  lines.push(emptyLine());
  lines.push(indent(bold(cyan("Princess")) + dim(" — Complete"), 2));
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 70, wide: 70 });
  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(emptyLine());

  if (error) {
    lines.push(indent(red(`${CROSS_MARK} Error: ${error}`), 4));
    lines.push(emptyLine());
    lines.push(indent(gray("Press q to exit or r to try again"), 4));
    return lines;
  }

  if (!manifest) {
    lines.push(indent(dim("No results available."), 4));
    lines.push(emptyLine());
    lines.push(indent(gray("Press q to exit"), 4));
    return lines;
  }

  const applied = manifest.proposals.filter((p) => p.applied);
  const rewriteCount = manifest.rewrites.filter((r) => r.status === "updated").length;
  const verificationStatus = manifest.verification.status;

  // Summary
  lines.push(indent(green(`${CHECK_MARK} Transformation complete`), 4));
  lines.push(emptyLine());

  const labelWidth = 22;
  const statLine = (label: string, value: string) =>
    columns([{ content: bold(label), minWidth: labelWidth }, { content: value }], ruleWidth - 4);

  lines.push(indent(statLine("Directories renamed:", `${applied.length}`), 4));
  lines.push(indent(statLine("Files rewritten:", `${rewriteCount}`), 4));

  const statusColor = verificationStatus === "passed" ? green : verificationStatus === "failed" ? red : yellow;
  lines.push(indent(statLine("Verification:", statusColor(verificationStatus)), 4));
  lines.push(emptyLine());

  lines.push(indent(statLine("Output:", manifest.outputRepoPath), 4));
  lines.push(emptyLine());

  // Verification checks
  if (manifest.verification.checks.length > 0) {
    lines.push(indent(bold("Checks:"), 4));
    for (const check of manifest.verification.checks) {
      const icon = check.status === "passed" ? green(CHECK_MARK) : check.status === "failed" ? red(CROSS_MARK) : dim("-");
      lines.push(indent(`${icon} ${check.name}${check.details ? dim(` (${check.details})`) : ""}`, 6));
    }
    lines.push(emptyLine());
  }

  // Applied renames
  if (applied.length > 0) {
    lines.push(indent(bold("Applied renames:"), 4));
    for (const proposal of applied.slice(0, 10)) {
      lines.push(indent(dim(`  ${proposal.relativePath} -> ${proposal.proposedName}`), 4));
    }
    if (applied.length > 10) {
      lines.push(indent(dim(`  ... and ${applied.length - 10} more`), 4));
    }
    lines.push(emptyLine());
  }

  // Artifacts
  lines.push(indent(bold("Artifacts:"), 4));
  lines.push(indent(dim(`  .princess/rename-plan.json`), 4));
  lines.push(indent(dim(`  .princess/run-manifest.json`), 4));
  lines.push(emptyLine());

  lines.push(indent(horizontalRule(ruleWidth), 2));
  lines.push(indent(`${bold("[r]")} run again  ${bold("[h]")} home  ${bold("[q]")} quit`, 2));

  return lines;
}
