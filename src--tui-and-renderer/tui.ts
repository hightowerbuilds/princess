#!/usr/bin/env bun

import { createRoot, batch } from "solid-js";
import path from "node:path";
import { stat } from "node:fs/promises";
import { createTuiState } from "./state.ts";
import { createRenderer } from "./renderer.ts";
import {
  detectCapabilities,
  enterRawMode,
  exitRawMode,
  enterAlternateScreen,
  exitAlternateScreen,
  showCursor,
  hideCursor,
  registerCleanup,
  onResize,
} from "./terminal.ts";
import { startInputLoop } from "./input.ts";
import { handleKey, runApp } from "./app.ts";

export interface TuiOptions {
  repoPath?: string;
  engine: "heuristic" | "model" | "auto";
  outputPath?: string;
}

export async function runTui(options: TuiOptions): Promise<void> {
  const caps = detectCapabilities();

  if (!caps.isTTY) {
    console.error("Princess TUI requires an interactive terminal.");
    console.error("Use the standard CLI for scripted usage:");
    console.error("  princess optimize <repo> --dry-run");
    process.exit(1);
  }

  let sourceRepoPath = "";
  let outputRepoPath = "";

  if (options.repoPath) {
    sourceRepoPath = path.resolve(options.repoPath);
    const sourceStats = await stat(sourceRepoPath).catch(() => null);

    if (!sourceStats?.isDirectory()) {
      console.error(`Not a directory: ${sourceRepoPath}`);
      process.exit(1);
    }

    outputRepoPath = options.outputPath
      ? path.resolve(options.outputPath)
      : path.join(path.dirname(sourceRepoPath), `${path.basename(sourceRepoPath)}-princess`);
  }

  registerCleanup();

  if (caps.supportsAlternateScreen) {
    enterAlternateScreen();
  }

  hideCursor();
  enterRawMode();

  await createRoot(async (dispose) => {
    const state = createTuiState();

    // Initialize config
    batch(() => {
      if (sourceRepoPath) {
        state.setRepoPath(sourceRepoPath);
        state.setOutputPath(outputRepoPath);
        state.setScreen("optimize");
      }
      state.setEngine(options.engine);
    });

    // Start renderer
    createRenderer(state);

    // Start input loop
    const stopInput = startInputLoop((key) => {
      handleKey(key, state);
    });

    // Wire resize
    const stopResize = onResize((cols, rows) => {
      batch(() => {
        state.setColumns(cols);
        state.setRows(rows);
      });
    });

    try {
      await runApp(state);
    } finally {
      stopInput();
      stopResize();
      dispose();
      showCursor();

      if (caps.supportsAlternateScreen) {
        exitAlternateScreen();
      }

      exitRawMode();
    }
  });
}

// Direct invocation support
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let repoPath: string | undefined;
  let engine: "heuristic" | "model" | "auto" = "heuristic";
  let outputPath: string | undefined;

  // Simple arg parsing for direct invocation
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "optimize" && positionals.length === 0) {
      continue; // skip the subcommand word
    }

    if (arg === "--engine" && i + 1 < args.length) {
      const val = args[++i];
      if (val === "heuristic" || val === "model" || val === "auto") {
        engine = val;
      }
      continue;
    }

    if (arg === "--out" && i + 1 < args.length) {
      outputPath = args[++i];
      continue;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
    }
  }

  if (positionals.length > 0) {
    repoPath = positionals[0];
  }

  await runTui({ repoPath, engine, outputPath });
}

// Only run main if this file is the entry point
if (import.meta.main) {
  main().catch((err) => {
    console.error(`Princess TUI error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
