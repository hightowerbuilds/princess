import { batch } from "solid-js";
import path from "node:path";
import { analyzeRepository } from "../src--cli-and-pipeline/discovery.ts";
import { buildRenamePlan, resolveThresholds } from "../src--cli-and-pipeline/pipeline.ts";
import { executeRenamePlan } from "../src--cli-and-pipeline/apply.ts";
import type { KeyEvent } from "./input.ts";
import type { ProposalReviewItem, TuiState } from "./state.ts";
import {
  createScanProgressCallback,
  createInferenceProgressCallback,
  createApplyProgressCallback,
} from "./progress.ts";

type KeyResolver = (key: KeyEvent) => void;
let activeKeyResolver: KeyResolver | null = null;

export function handleKeyForStage(key: KeyEvent, state: TuiState): void {
  // Global quit on ctrl+c
  if (key.name === "ctrl+c") {
    process.exit(130);
  }

  if (activeKeyResolver) {
    activeKeyResolver(key);
  }
}

export async function runStageTransitions(state: TuiState): Promise<void> {
  // Welcome: wait for Enter
  state.setStage("welcome");
  const welcomeAction = await waitForKey(
    (key) => key.name === "enter" || key.name === "q" || key.name === "escape",
  );
  if (welcomeAction.name === "q" || welcomeAction.name === "escape") return;

  // Start spinner
  const spinnerInterval = startSpinner(state);

  try {
    // Scanning
    state.setStage("scanning");
    const scanCallback = createScanProgressCallback(state);
    const { repoSummary, dossiers } = await analyzeRepository(
      state.repoPath(),
      { includeHidden: false },
      scanCallback,
    );

    batch(() => {
      state.setRepoSummary(repoSummary);
      state.setDossiers(dossiers);
    });

    // Inference
    state.setStage("inference");
    const inferCallback = createInferenceProgressCallback(state);
    const thresholds = resolveThresholds({});
    const plan = await buildRenamePlan(
      {
        sourceRepoPath: state.repoPath(),
        outputRepoPath: state.outputPath(),
        repoSummary,
        dossiers,
        thresholds,
        engine: state.engine(),
      },
      inferCallback,
    );

    // Prepare review items
    const reviewItems: ProposalReviewItem[] = plan.proposals.map((proposal) => ({
      ...proposal,
      userApproved: proposal.applied,
    }));

    batch(() => {
      state.setReviewItems(reviewItems);
      state.setReviewCursor(0);
      state.setReviewScrollOffset(0);
    });

    // Review: interactive
    stopSpinner(spinnerInterval);
    state.setStage("review");
    const approved = await waitForReviewApproval(state);

    if (!approved) return;

    // Apply user decisions back to plan
    const items = state.reviewItems();
    for (const proposal of plan.proposals) {
      const item = items.find((i) => i.relativePath === proposal.relativePath);
      if (item) {
        proposal.applied = item.userApproved && item.proposedName !== item.currentName;
      }
    }

    // Applying
    const applySpinner = startSpinner(state);
    state.setStage("applying");
    const applyCallback = createApplyProgressCallback(state);
    const manifest = await executeRenamePlan(plan, { force: true }, applyCallback);

    stopSpinner(applySpinner);

    // Complete
    batch(() => {
      state.setManifest(manifest);
      state.setVerificationChecks(manifest.verification.checks);
      state.setStage("complete");
    });

    // Wait for user decision
    const completeAction = await waitForKey(
      (key) => key.name === "q" || key.name === "escape" || key.name === "r",
    );

    if (completeAction.name === "r") {
      resetState(state);
      await runStageTransitions(state);
    }
  } catch (err) {
    stopSpinner(spinnerInterval);
    state.setError(err instanceof Error ? err.message : String(err));
    state.setStage("complete");

    const action = await waitForKey(
      (key) => key.name === "q" || key.name === "escape" || key.name === "r",
    );

    if (action.name === "r") {
      resetState(state);
      await runStageTransitions(state);
    }
  }
}

function waitForKey(matches: (key: KeyEvent) => boolean): Promise<KeyEvent> {
  return new Promise((resolve) => {
    activeKeyResolver = (key: KeyEvent) => {
      if (matches(key)) {
        activeKeyResolver = null;
        resolve(key);
      }
    };
  });
}

function waitForReviewApproval(state: TuiState): Promise<boolean> {
  return new Promise((resolve) => {
    activeKeyResolver = (key: KeyEvent) => {
      const items = state.reviewItems();
      const cursor = state.reviewCursor();
      const rows = state.rows();
      const listHeight = Math.max(rows - 8, 5);
      const offset = state.reviewScrollOffset();

      switch (key.name) {
        case "down":
        case "j": {
          const next = Math.min(cursor + 1, items.length - 1);
          state.setReviewCursor(next);
          if (next >= offset + listHeight) {
            state.setReviewScrollOffset(next - listHeight + 1);
          }
          break;
        }

        case "up":
        case "k": {
          const prev = Math.max(cursor - 1, 0);
          state.setReviewCursor(prev);
          if (prev < offset) {
            state.setReviewScrollOffset(prev);
          }
          break;
        }

        case "pagedown": {
          const next = Math.min(cursor + listHeight, items.length - 1);
          state.setReviewCursor(next);
          state.setReviewScrollOffset(Math.min(next, Math.max(0, items.length - listHeight)));
          break;
        }

        case "pageup": {
          const prev = Math.max(cursor - listHeight, 0);
          state.setReviewCursor(prev);
          state.setReviewScrollOffset(prev);
          break;
        }

        case "space": {
          const item = items[cursor];
          if (item && (item.decision === "rename" || item.decision === "keep")) {
            const updated = [...items];
            updated[cursor] = { ...item, userApproved: !item.userApproved };
            state.setReviewItems(updated);
          }
          break;
        }

        case "a": {
          const updated = items.map((item) =>
            item.decision === "rename" || item.decision === "keep"
              ? { ...item, userApproved: true }
              : item,
          );
          state.setReviewItems(updated);
          break;
        }

        case "n": {
          const updated = items.map((item) =>
            item.decision === "rename" || item.decision === "keep"
              ? { ...item, userApproved: false }
              : item,
          );
          state.setReviewItems(updated);
          break;
        }

        case "enter": {
          activeKeyResolver = null;
          resolve(true);
          break;
        }

        case "q":
        case "escape": {
          activeKeyResolver = null;
          resolve(false);
          break;
        }
      }
    };
  });
}

function startSpinner(state: TuiState): ReturnType<typeof setInterval> {
  return setInterval(() => {
    state.setSpinnerTick((t) => t + 1);
  }, 80);
}

function stopSpinner(interval: ReturnType<typeof setInterval>): void {
  clearInterval(interval);
}

function resetState(state: TuiState): void {
  batch(() => {
    state.setStage("welcome");
    state.setScanProgress({ directoriesScanned: 0, currentPath: "" });
    state.setRepoSummary(null);
    state.setDossiers([]);
    state.setInferenceProgress({ totalChunks: 0, completedChunks: 0, currentChunkSize: 0, engineUsed: "" });
    state.setReviewItems([]);
    state.setReviewCursor(0);
    state.setReviewScrollOffset(0);
    state.setApplyProgress({ phase: "", current: 0, total: 0, currentItem: "" });
    state.setVerificationChecks([]);
    state.setManifest(null);
    state.setError(null);
    state.setSpinnerTick(0);
  });
}
