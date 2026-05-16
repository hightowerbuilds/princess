#!/usr/bin/env bun

import { createRoot } from "solid-js";
import { createTuiState } from "./state.ts";
import { createRenderer } from "./renderer.ts";
import {
  detectCapabilities,
  enterRawMode,
  exitRawMode,
  enterAlternateScreen,
  exitAlternateScreen,
  enableMouse,
  showCursor,
  hideCursor,
  registerCleanup,
  onResize,
} from "./terminal.ts";
import { startInputLoop } from "./input.ts";
import { handleKey, runApp } from "./app.ts";

export interface TuiOptions {
  // Empty for now, can add options later
}

export async function runTui(options: TuiOptions): Promise<void> {
  const caps = detectCapabilities();

  if (!caps.isTTY) {
    console.error("Princess TUI requires an interactive terminal.");
    console.error(`Debug: stdout.isTTY=${process.stdout.isTTY}, stdin.isTTY=${process.stdin.isTTY}`);
    // process.exit(1);
  }

  registerCleanup();

  if (caps.supportsAlternateScreen) {
    enterAlternateScreen();
  }

  hideCursor();
  enableMouse();
  enterRawMode();

  await createRoot(async (dispose) => {
    const state = createTuiState();

    // Start renderer
    createRenderer(state);

    // Start input loop
    const stopInput = startInputLoop((key) => {
      handleKey(key, state);
    });

    // Wire resize
    const stopResize = onResize((cols, rows) => {
      state.setState("terminal", { columns: cols, rows });
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
  await runTui({});
}

// Only run main if this file is the entry point
if (import.meta.main) {
  main().catch((err) => {
    console.error(`Princess TUI error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
