import path from "node:path";
import type { FolderDossier, RenamePlan, RepoSummary } from "./contracts";

export interface DryRunReportInput {
  engine: string;
  sourceRepoPath: string;
  outputRepoPath: string;
  repoSummary: RepoSummary;
  dossiers: FolderDossier[];
  plan: RenamePlan;
}

export function formatDryRunReport(input: DryRunReportInput): string {
  const renameCount = input.plan.proposals.filter((proposal) => proposal.applied).length;
  const keepCount = input.plan.proposals.filter(
    (proposal) => proposal.decision === "keep",
  ).length;
  const ignoreCount = input.plan.proposals.filter(
    (proposal) => proposal.decision === "ignore",
  ).length;

  const lines: string[] = [];

  lines.push("Princess dry run");
  lines.push("");
  lines.push(`Source: ${input.sourceRepoPath}`);
  lines.push(`Output: ${input.outputRepoPath}`);
  lines.push(`Engine: ${input.engine}`);
  lines.push(`Detected stack: ${input.repoSummary.detectedStack.join(", ") || "unknown"}`);
  lines.push(`Naming style: ${input.repoSummary.namingStyle ?? "unknown"}`);
  lines.push(`Directories analyzed: ${input.dossiers.length}`);
  lines.push(`Rename candidates: ${renameCount}`);
  lines.push(`Kept: ${keepCount}`);
  lines.push(`Ignored: ${ignoreCount}`);

  const applied = input.plan.proposals.filter((proposal) => proposal.applied);
  const kept = input.plan.proposals.filter((proposal) => proposal.decision === "keep");
  const ignored = input.plan.proposals.filter((proposal) => proposal.decision === "ignore");

  if (applied.length > 0) {
    lines.push("");
    lines.push("Proposed renames:");

    for (const proposal of applied) {
      const targetPath = path.posix.join(parentPathFor(proposal.relativePath), proposal.proposedName);
      lines.push(
        `- ${proposal.relativePath} -> ${targetPath} (${proposal.confidence.toFixed(2)})`,
      );
      lines.push(`  ${proposal.reason}`);
    }
  }

  if (kept.length > 0) {
    lines.push("");
    lines.push("Kept:");

    for (const proposal of kept.slice(0, 8)) {
      lines.push(`- ${proposal.relativePath}: ${proposal.reason}`);
    }
  }

  if (ignored.length > 0) {
    lines.push("");
    lines.push("Ignored:");

    for (const proposal of ignored.slice(0, 8)) {
      lines.push(`- ${proposal.relativePath}: ${proposal.reason}`);
    }
  }

  return lines.join("\n");
}

function parentPathFor(relativePath: string): string {
  const parent = path.posix.dirname(relativePath);
  return parent === "." ? "" : parent;
}
