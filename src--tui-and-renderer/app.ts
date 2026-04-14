import { batch } from "solid-js";
import path from "node:path";
import { readdir, stat, access } from "node:fs/promises";
import { analyzeRepository } from "../src--cli-and-pipeline/discovery.ts";
import { buildRenamePlan, resolveThresholds } from "../src--cli-and-pipeline/pipeline.ts";
import { executeRenamePlan } from "../src--cli-and-pipeline/apply.ts";
import type { KeyEvent } from "./input.ts";
import type { ProposalReviewItem, TuiState } from "./state.ts";
import { MENU_ITEMS } from "./views/home.ts";
import {
  createScanProgressCallback,
  createInferenceProgressCallback,
  createApplyProgressCallback,
} from "./progress.ts";

type KeyResolver = (key: KeyEvent) => void;
let activeKeyResolver: KeyResolver | null = null;

export function handleKey(key: KeyEvent, _state: TuiState): void {
  if (key.name === "ctrl+c") {
    process.exit(130);
  }
  if (activeKeyResolver) {
    activeKeyResolver(key);
  }
}

// ── Top-level app flow ──────────────────────────────────────────────

export async function runApp(state: TuiState): Promise<void> {
  // Direct mode: repo already provided via CLI
  if (state.repoPath()) {
    state.setScreen("optimize");
    await runOptimizeFlow(state);
    return;
  }

  // App shell loop
  while (true) {
    resetFullState(state);
    state.setScreen("home");

    const menuChoice = await waitForHomeSelection(state);
    if (!menuChoice) return; // quit

    state.setActiveFunction(menuChoice as "optimize" | "verify");

    // Repo picker
    state.setScreen("repo-picker");
    await detectRepos(state);
    const repo = await waitForRepoPick(state);
    if (!repo) continue; // back to home

    // Configure paths
    const resolvedRepo = path.resolve(repo);
    const outputPath = path.join(
      path.dirname(resolvedRepo),
      `${path.basename(resolvedRepo)}-princess`,
    );

    batch(() => {
      state.setRepoPath(resolvedRepo);
      state.setOutputPath(outputPath);
    });

    // Run selected function
    if (menuChoice === "optimize") {
      state.setScreen("optimize");
      await runOptimizeFlow(state);
    }
    // verify, explore, etc. can be added here
  }
}

// ── Home screen ─────────────────────────────────────────────────────

function waitForHomeSelection(state: TuiState): Promise<string | null> {
  return new Promise((resolve) => {
    activeKeyResolver = (key: KeyEvent) => {
      const cursor = state.homeCursor();
      const availableItems = MENU_ITEMS.filter((m) => m.available);

      switch (key.name) {
        case "down":
        case "j": {
          // Skip to next available item
          let next = cursor + 1;
          while (next < MENU_ITEMS.length && !MENU_ITEMS[next].available) next++;
          if (next < MENU_ITEMS.length) state.setHomeCursor(next);
          break;
        }
        case "up":
        case "k": {
          let prev = cursor - 1;
          while (prev >= 0 && !MENU_ITEMS[prev].available) prev--;
          if (prev >= 0) state.setHomeCursor(prev);
          break;
        }
        case "enter": {
          const item = MENU_ITEMS[cursor];
          if (item && item.available) {
            activeKeyResolver = null;
            resolve(item.id);
          }
          break;
        }
        case "q":
        case "escape": {
          activeKeyResolver = null;
          resolve(null);
          break;
        }
      }
    };
  });
}

// ── Repo picker ─────────────────────────────────────────────────────

async function detectRepos(state: TuiState): Promise<void> {
  const cwd = process.cwd();
  const repos: string[] = [];

  // Check CWD itself
  if (await hasPackageJson(cwd)) {
    repos.push(cwd);
  }

  // Check siblings (parent directory children)
  const parentDir = path.dirname(cwd);
  try {
    const entries = await readdir(parentDir);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = path.join(parentDir, entry);
      if (fullPath === cwd && repos.includes(cwd)) continue; // already added
      const s = await stat(fullPath).catch(() => null);
      if (!s?.isDirectory()) continue;
      if (await hasPackageJson(fullPath)) {
        repos.push(fullPath);
      }
    }
  } catch {
    // Can't read parent — that's fine
  }

  // Also check children of CWD
  try {
    const entries = await readdir(cwd);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = path.join(cwd, entry);
      if (repos.includes(fullPath)) continue;
      const s = await stat(fullPath).catch(() => null);
      if (!s?.isDirectory()) continue;
      if (await hasPackageJson(fullPath)) {
        repos.push(fullPath);
      }
    }
  } catch {
    // Can't read cwd children — unusual but fine
  }

  // Sort: cwd first, then alphabetical
  repos.sort((a, b) => {
    if (a === cwd) return -1;
    if (b === cwd) return 1;
    return a.localeCompare(b);
  });

  batch(() => {
    state.setRepoPickerItems(repos);
    state.setRepoPickerCursor(0);
    state.setRepoPickerInput("");
    state.setRepoPickerMode("list");
  });
}

async function hasPackageJson(dir: string): Promise<boolean> {
  return access(path.join(dir, "package.json"))
    .then(() => true)
    .catch(() => false);
}

function waitForRepoPick(state: TuiState): Promise<string | null> {
  return new Promise((resolve) => {
    activeKeyResolver = (key: KeyEvent) => {
      const mode = state.repoPickerMode();

      if (mode === "input") {
        handleRepoInputKey(key, state, resolve);
      } else {
        handleRepoListKey(key, state, resolve);
      }
    };
  });
}

function handleRepoListKey(
  key: KeyEvent,
  state: TuiState,
  resolve: (val: string | null) => void,
): void {
  const items = state.repoPickerItems();
  const cursor = state.repoPickerCursor();

  switch (key.name) {
    case "down":
    case "j": {
      if (cursor < items.length - 1) state.setRepoPickerCursor(cursor + 1);
      break;
    }
    case "up":
    case "k": {
      if (cursor > 0) state.setRepoPickerCursor(cursor - 1);
      break;
    }
    case "enter": {
      const selected = items[cursor];
      if (selected) {
        activeKeyResolver = null;
        resolve(selected);
      }
      break;
    }
    case "/": {
      state.setRepoPickerMode("input");
      state.setRepoPickerInput("");
      break;
    }
    case "escape":
    case "q": {
      activeKeyResolver = null;
      resolve(null);
      break;
    }
  }
}

function handleRepoInputKey(
  key: KeyEvent,
  state: TuiState,
  resolve: (val: string | null) => void,
): void {
  const input = state.repoPickerInput();

  switch (key.name) {
    case "enter": {
      if (input.trim()) {
        activeKeyResolver = null;
        resolve(input.trim());
      }
      break;
    }
    case "escape": {
      state.setRepoPickerMode("list");
      break;
    }
    case "backspace": {
      state.setRepoPickerInput(input.slice(0, -1));
      break;
    }
    default: {
      // Printable character — append to input
      if (key.name.length === 1 && !key.ctrl && !key.meta) {
        state.setRepoPickerInput(input + key.name);
      } else if (key.name === "space") {
        state.setRepoPickerInput(input + " ");
      }
      break;
    }
  }
}

// ── Optimize flow (extracted from stages.ts) ────────────────────────

async function runOptimizeFlow(state: TuiState): Promise<void> {
  // Welcome: wait for Enter
  state.setStage("welcome");
  const welcomeAction = await waitForKey(
    (key) => key.name === "enter" || key.name === "q" || key.name === "escape",
  );
  if (welcomeAction.name === "q" || welcomeAction.name === "escape") return;

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
      (key) =>
        key.name === "q" ||
        key.name === "escape" ||
        key.name === "r" ||
        key.name === "h",
    );

    if (completeAction.name === "r") {
      resetOptimizeState(state);
      await runOptimizeFlow(state);
    }
    // "h" or "q" returns to caller (app loop goes back to home, direct mode exits)
  } catch (err) {
    stopSpinner(spinnerInterval);
    state.setError(err instanceof Error ? err.message : String(err));
    state.setStage("complete");

    const action = await waitForKey(
      (key) =>
        key.name === "q" ||
        key.name === "escape" ||
        key.name === "r" ||
        key.name === "h",
    );

    if (action.name === "r") {
      resetOptimizeState(state);
      await runOptimizeFlow(state);
    }
  }
}

// ── Shared helpers ──────────────────────────────────────────────────

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
          state.setReviewScrollOffset(
            Math.min(next, Math.max(0, items.length - listHeight)),
          );
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

function resetOptimizeState(state: TuiState): void {
  batch(() => {
    state.setStage("welcome");
    state.setScanProgress({ directoriesScanned: 0, currentPath: "" });
    state.setRepoSummary(null);
    state.setDossiers([]);
    state.setInferenceProgress({
      totalChunks: 0,
      completedChunks: 0,
      currentChunkSize: 0,
      engineUsed: "",
    });
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

function resetFullState(state: TuiState): void {
  batch(() => {
    state.setHomeCursor(0);
    state.setRepoPickerItems([]);
    state.setRepoPickerCursor(0);
    state.setRepoPickerInput("");
    state.setRepoPickerMode("list");
    state.setActiveFunction("");
    state.setRepoPath("");
    state.setOutputPath("");
  });
  resetOptimizeState(state);
}
