import path from "node:path";
import type { FolderDossier, RenamePlan, RepoSummary, RunManifest } from "./contracts";

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
  const engineRequested = input.plan.inference?.engineRequested ?? input.engine;
  const engineUsed = input.plan.inference?.engineUsed ?? input.engine;
  lines.push(
    engineRequested === engineUsed
      ? `Engine: ${engineUsed}`
      : `Engine: ${engineUsed} (requested ${engineRequested})`,
  );
  lines.push(`Detected stack: ${input.repoSummary.detectedStack.join(", ") || "unknown"}`);
  lines.push(`Naming style: ${input.repoSummary.namingStyle ?? "unknown"}`);
  lines.push(`Directories analyzed: ${input.dossiers.length}`);
  lines.push(`Rename candidates: ${renameCount}`);
  lines.push(`Kept: ${keepCount}`);
  lines.push(`Ignored: ${ignoreCount}`);

  if (input.plan.inference && input.plan.inference.warnings.length > 0) {
    lines.push("");
    lines.push("Inference notes:");

    for (const warning of input.plan.inference.warnings) {
      lines.push(`- ${warning}`);
    }
  }

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

export function formatApplyReport(input: {
  sourceRepoPath: string;
  outputRepoPath: string;
  manifest: RunManifest;
}): string {
  const lines: string[] = [];
  const applied = input.manifest.proposals.filter((proposal) => proposal.applied);

  lines.push("Princess apply");
  lines.push("");
  lines.push(`Source: ${input.sourceRepoPath}`);
  lines.push(`Output: ${input.outputRepoPath}`);
  lines.push(
    `Engine: ${input.manifest.inference?.engineUsed ?? "unknown"}${input.manifest.inference?.engineRequested && input.manifest.inference.engineRequested !== input.manifest.inference.engineUsed ? ` (requested ${input.manifest.inference.engineRequested})` : ""}`,
  );
  lines.push(`Applied renames: ${applied.length}`);
  lines.push(`Updated files: ${input.manifest.rewrites.filter((record) => record.status === "updated").length}`);
  lines.push(`Verification: ${input.manifest.verification.status}`);

  if (applied.length > 0) {
    lines.push("");
    lines.push("Applied:");

    for (const proposal of applied) {
      const targetPath = path.posix.join(parentPathFor(proposal.relativePath), proposal.proposedName);
      lines.push(`- ${proposal.relativePath} -> ${targetPath}`);
    }
  }

  if (input.manifest.rewrites.length > 0) {
    lines.push("");
    lines.push("Rewrites:");

    for (const record of input.manifest.rewrites) {
      lines.push(`- ${record.filePath}: ${record.details ?? record.status}`);
    }
  }

  lines.push("");
  lines.push("Artifacts:");
  lines.push(`- ${path.join(input.outputRepoPath, ".princess", "rename-plan.json")}`);
  lines.push(`- ${path.join(input.outputRepoPath, ".princess", "run-manifest.json")}`);

  return lines.join("\n");
}

function parentPathFor(relativePath: string): string {
  const parent = path.posix.dirname(relativePath);
  return parent === "." ? "" : parent;
}
