export type PrincessDecision = "rename" | "keep" | "ignore";
export type VerificationStatus = "passed" | "partial" | "failed" | "skipped";
export type RewriteKind = "import" | "config" | "script" | "other";
export type RewriteStatus = "updated" | "skipped" | "failed";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface RepoSummary {
  rootName: string;
  detectedStack: string[];
  namingStyle?: string;
  notes?: string[];
}

export interface FolderDossier {
  relativePath: string;
  currentName: string;
  parentPath: string;
  childDirectories: string[];
  representativeFiles: string[];
  extensionCounts: Record<string, number>;
  frameworkHints: string[];
  testHints: string[];
  instructionFiles: string[];
  staticSummary: string;
}

export interface ModelThresholds {
  minConfidence: number;
  maxNameLength: number;
  maxSegments: number;
}

export interface OpenAIModelOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  timeoutMs?: number;
  maxDossiersPerCall?: number;
}

export interface RenameProposal {
  relativePath: string;
  currentName: string;
  proposedName: string;
  purpose: string;
  directives: string[];
  confidence: number;
  decision: PrincessDecision;
  reasoning: string;
  riskFlags: string[];
}

export interface RewriteRecord {
  filePath: string;
  kind: RewriteKind;
  status: RewriteStatus;
  details?: string;
}

export interface ApplyOptions {
  force?: boolean;
  preserveGit?: boolean;
}

export interface VerificationCheck {
  name: string;
  status: "passed" | "failed" | "skipped";
  details?: string;
}

export interface VerificationSummary {
  status: VerificationStatus;
  checks: VerificationCheck[];
}

export interface PlannedRename {
  relativePath: string;
  currentName: string;
  proposedName: string;
  decision: PrincessDecision;
  confidence: number;
  applied: boolean;
  reason: string;
}

export interface RenamePlan {
  runId: string;
  sourceRepoPath: string;
  outputRepoPath: string;
  createdAt: string;
  thresholds: ModelThresholds;
  proposals: PlannedRename[];
  inference?: {
    engineRequested: string;
    engineUsed: string;
    warnings: string[];
  };
}

export interface RunManifest extends RenamePlan {
  rewrites: RewriteRecord[];
  verification: VerificationSummary;
}

// Progress events for TUI integration

export interface ScanProgressEvent {
  type: "scan";
  directoriesScanned: number;
  currentPath: string;
}

export interface InferenceProgressEvent {
  type: "inference";
  totalChunks: number;
  completedChunks: number;
  currentChunkSize: number;
  engineUsed: string;
}

export interface ApplyProgressEvent {
  type: "apply";
  phase: "copy" | "rename" | "rewrite-imports" | "rewrite-configs" | "verify";
  current: number;
  total: number;
  currentItem: string;
}

export type ProgressEvent = ScanProgressEvent | InferenceProgressEvent | ApplyProgressEvent;
export type ProgressCallback = (event: ProgressEvent) => void;
