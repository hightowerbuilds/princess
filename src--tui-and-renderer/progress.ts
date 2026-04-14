import { batch } from "solid-js";
import type { ProgressCallback, ProgressEvent } from "../src--cli-and-pipeline/contracts.ts";
import type { TuiState } from "./state.ts";

export function createScanProgressCallback(state: TuiState): ProgressCallback {
  return (event: ProgressEvent) => {
    if (event.type !== "scan") return;
    state.setScanProgress({
      directoriesScanned: event.directoriesScanned,
      currentPath: event.currentPath,
    });
  };
}

export function createInferenceProgressCallback(state: TuiState): ProgressCallback {
  return (event: ProgressEvent) => {
    if (event.type !== "inference") return;
    batch(() => {
      state.setInferenceProgress({
        totalChunks: event.totalChunks,
        completedChunks: event.completedChunks,
        currentChunkSize: event.currentChunkSize,
        engineUsed: event.engineUsed,
      });
    });
  };
}

export function createApplyProgressCallback(state: TuiState): ProgressCallback {
  return (event: ProgressEvent) => {
    if (event.type !== "apply") return;
    batch(() => {
      state.setApplyProgress({
        phase: event.phase,
        current: event.current,
        total: event.total,
        currentItem: event.currentItem,
      });
    });
  };
}
