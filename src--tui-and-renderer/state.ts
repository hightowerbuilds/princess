import { createSignal, createMemo } from "solid-js";
import type {
  FolderDossier,
  PlannedRename,
  RepoSummary,
  RunManifest,
  VerificationCheck,
} from "../src--cli-and-pipeline/contracts.ts";

export type AppScreen =
  | "home"
  | "repo-picker"
  | "optimize"
  | "verify"
  | "explore";

export type TuiStage =
  | "welcome"
  | "scanning"
  | "inference"
  | "review"
  | "applying"
  | "complete";

export interface ProposalReviewItem extends PlannedRename {
  userApproved: boolean;
}

export function createTuiState() {
  // App screen
  const [screen, setScreen] = createSignal<AppScreen>("home");
  const [activeFunction, setActiveFunction] = createSignal<"optimize" | "verify" | "">("");

  // Home screen
  const [homeCursor, setHomeCursor] = createSignal(0);

  // Repo picker
  const [repoPickerItems, setRepoPickerItems] = createSignal<string[]>([]);
  const [repoPickerCursor, setRepoPickerCursor] = createSignal(0);
  const [repoPickerInput, setRepoPickerInput] = createSignal("");
  const [repoPickerMode, setRepoPickerMode] = createSignal<"list" | "input">("list");

  // Stage (within optimize screen)
  const [stage, setStage] = createSignal<TuiStage>("welcome");

  // Terminal dimensions
  const [columns, setColumns] = createSignal(process.stdout.columns ?? 80);
  const [rows, setRows] = createSignal(process.stdout.rows ?? 24);

  // Config
  const [repoPath, setRepoPath] = createSignal("");
  const [engine, setEngine] = createSignal<"heuristic" | "model" | "auto">("heuristic");
  const [outputPath, setOutputPath] = createSignal("");

  // Scanning stage
  const [scanProgress, setScanProgress] = createSignal({
    directoriesScanned: 0,
    currentPath: "",
  });
  const [repoSummary, setRepoSummary] = createSignal<RepoSummary | null>(null);
  const [dossiers, setDossiers] = createSignal<FolderDossier[]>([]);

  // Inference stage
  const [inferenceProgress, setInferenceProgress] = createSignal({
    totalChunks: 0,
    completedChunks: 0,
    currentChunkSize: 0,
    engineUsed: "",
  });

  // Review stage
  const [reviewItems, setReviewItems] = createSignal<ProposalReviewItem[]>([]);
  const [reviewCursor, setReviewCursor] = createSignal(0);
  const [reviewScrollOffset, setReviewScrollOffset] = createSignal(0);

  // Apply stage
  const [applyProgress, setApplyProgress] = createSignal({
    phase: "" as "copy" | "rename" | "rewrite-imports" | "rewrite-configs" | "verify" | "",
    current: 0,
    total: 0,
    currentItem: "",
  });

  // Verification
  const [verificationChecks, setVerificationChecks] = createSignal<VerificationCheck[]>([]);

  // Complete stage
  const [manifest, setManifest] = createSignal<RunManifest | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  // Spinner tick (driven by timer)
  const [spinnerTick, setSpinnerTick] = createSignal(0);

  // Derived
  const renameCount = createMemo(
    () => reviewItems().filter((item) => item.userApproved && item.proposedName !== item.currentName).length,
  );
  const keepCount = createMemo(
    () => reviewItems().filter((item) => !item.userApproved || item.proposedName === item.currentName).length,
  );
  const totalProposals = createMemo(() => reviewItems().length);

  return {
    screen, setScreen,
    activeFunction, setActiveFunction,
    homeCursor, setHomeCursor,
    repoPickerItems, setRepoPickerItems,
    repoPickerCursor, setRepoPickerCursor,
    repoPickerInput, setRepoPickerInput,
    repoPickerMode, setRepoPickerMode,
    stage, setStage,
    columns, setColumns,
    rows, setRows,
    repoPath, setRepoPath,
    engine, setEngine,
    outputPath, setOutputPath,
    scanProgress, setScanProgress,
    repoSummary, setRepoSummary,
    dossiers, setDossiers,
    inferenceProgress, setInferenceProgress,
    reviewItems, setReviewItems,
    reviewCursor, setReviewCursor,
    reviewScrollOffset, setReviewScrollOffset,
    applyProgress, setApplyProgress,
    verificationChecks, setVerificationChecks,
    manifest, setManifest,
    error, setError,
    spinnerTick, setSpinnerTick,
    renameCount, keepCount, totalProposals,
  };
}

export type TuiState = ReturnType<typeof createTuiState>;
