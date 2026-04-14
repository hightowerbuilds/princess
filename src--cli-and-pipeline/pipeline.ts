import type {
  FolderDossier,
  ModelThresholds,
  OpenAIModelOptions,
  ProgressCallback,
  RenamePlan,
  RenameProposal,
  RepoSummary,
  RunManifest,
} from "./contracts";
import { inferHeuristicRenameProposals } from "./infer";
import { inferModelRenameProposals } from "./model";

export const DEFAULT_THRESHOLDS: ModelThresholds = {
  minConfidence: 0.5,
  maxNameLength: 72,
  maxSegments: 6,
};

export const PIPELINE_STAGES = [
  "snapshot",
  "discover",
  "dossier",
  "infer",
  "plan",
  "copy",
  "rename",
  "rewrite",
  "verify",
  "report",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type InferenceEngine = "auto" | "heuristic" | "model";

export interface AnalysisInput {
  sourceRepoPath: string;
  outputRepoPath: string;
  repoSummary: RepoSummary;
  dossiers: FolderDossier[];
  thresholds?: Partial<ModelThresholds>;
  engine?: InferenceEngine;
  modelOptions?: OpenAIModelOptions;
}

export interface InferenceResult {
  proposals: RenameProposal[];
  engineUsed: "heuristic" | "model";
  warnings: string[];
  rawModelResponse?: string;
}

export interface PipelineContext extends AnalysisInput {
  thresholds: ModelThresholds;
}

export function resolveThresholds(
  thresholds?: Partial<ModelThresholds>,
): ModelThresholds {
  return {
    minConfidence: thresholds?.minConfidence ?? DEFAULT_THRESHOLDS.minConfidence,
    maxNameLength: thresholds?.maxNameLength ?? DEFAULT_THRESHOLDS.maxNameLength,
    maxSegments: thresholds?.maxSegments ?? DEFAULT_THRESHOLDS.maxSegments,
  };
}

export async function inferRenameProposals(
  context: PipelineContext,
  onProgress?: ProgressCallback,
): Promise<InferenceResult> {
  const engine = context.engine ?? "heuristic";

  if (engine === "model") {
    const result = await inferModelRenameProposals({
      repoSummary: context.repoSummary,
      dossiers: context.dossiers,
      thresholds: context.thresholds,
      modelOptions: context.modelOptions,
    }, onProgress);

    return {
      ...result,
      engineUsed: "model",
      warnings: [],
    };
  }

  if (engine === "auto") {
    try {
      const result = await inferModelRenameProposals({
        repoSummary: context.repoSummary,
        dossiers: context.dossiers,
        thresholds: context.thresholds,
        modelOptions: context.modelOptions,
      }, onProgress);

      return {
        ...result,
        engineUsed: "model",
        warnings: [],
      };
    } catch {
      if (onProgress) {
        onProgress({ type: "inference", totalChunks: 1, completedChunks: 1, currentChunkSize: 0, engineUsed: "heuristic" });
      }
      return {
        proposals: inferHeuristicRenameProposals(context.dossiers, context.thresholds),
        engineUsed: "heuristic",
        warnings: [
          "Auto mode fell back to heuristic inference because the model path was unavailable or invalid.",
        ],
      };
    }
  }

  if (onProgress) {
    onProgress({ type: "inference", totalChunks: 1, completedChunks: 1, currentChunkSize: context.dossiers.length, engineUsed: "heuristic" });
  }
  return {
    proposals: inferHeuristicRenameProposals(context.dossiers, context.thresholds),
    engineUsed: "heuristic",
    warnings: [],
  };
}

export async function buildRenamePlan(
  context: PipelineContext,
  onProgress?: ProgressCallback,
): Promise<RenamePlan> {
  const thresholds = resolveThresholds(context.thresholds);
  const inference = await inferRenameProposals({
    ...context,
    thresholds,
  }, onProgress);

  const preliminaryPlan = inference.proposals.map((proposal) => ({
    relativePath: proposal.relativePath,
    currentName: proposal.currentName,
    proposedName: proposal.proposedName,
    decision: proposal.decision,
    confidence: proposal.confidence,
    applied:
      proposal.decision === "rename" &&
      proposal.confidence >= thresholds.minConfidence &&
      proposal.proposedName !== proposal.currentName,
    reason: proposal.reasoning,
  }));

  resolveSiblingCollisions(preliminaryPlan);

  return {
    runId: `princess-${Date.now()}`,
    sourceRepoPath: context.sourceRepoPath,
    outputRepoPath: context.outputRepoPath,
    createdAt: new Date().toISOString(),
    thresholds,
    proposals: preliminaryPlan,
    inference: {
      engineRequested: context.engine ?? "heuristic",
      engineUsed: inference.engineUsed,
      warnings: inference.warnings,
    },
  };
}

export async function buildRunManifest(
  plan: RenamePlan,
): Promise<RunManifest> {
  return {
    ...plan,
    rewrites: [],
    verification: {
      status: "skipped",
      checks: [],
    },
  };
}

function resolveSiblingCollisions(plan: RenamePlan["proposals"]): void {
  const siblingGroups = new Map<string, RenamePlan["proposals"]>();

  for (const proposal of plan) {
    const parentPath = parentPathFor(proposal.relativePath);
    const group = siblingGroups.get(parentPath) ?? [];
    group.push(proposal);
    siblingGroups.set(parentPath, group);
  }

  for (const group of siblingGroups.values()) {
    const finalNames = new Map<string, typeof group>();

    for (const proposal of group) {
      const finalName = proposal.applied ? proposal.proposedName : proposal.currentName;
      const existing = finalNames.get(finalName) ?? [];
      existing.push(proposal);
      finalNames.set(finalName, existing);
    }

    for (const [finalName, collisions] of finalNames) {
      if (collisions.length < 2) {
        continue;
      }

      const alreadyOccupied = collisions.find((entry) => !entry.applied);
      const appliedEntries = collisions
        .filter((entry) => entry.applied)
        .sort((left, right) => right.confidence - left.confidence);

      if (alreadyOccupied) {
        for (const proposal of appliedEntries) {
          proposal.applied = false;
          proposal.reason = `Skipped because "${finalName}" is already occupied by a sibling directory.`;
        }

        continue;
      }

      const [, ...losers] = appliedEntries;

      for (const proposal of losers) {
        proposal.applied = false;
        proposal.reason = `Skipped because another sibling won the target name "${finalName}" at higher confidence.`;
      }
    }
  }
}

function parentPathFor(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? "." : normalized.slice(0, lastSlash);
}
