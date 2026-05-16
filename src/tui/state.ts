import { createStore } from "solid-js/store";
import { createMemo } from "solid-js";
import { createBreathingPulse, createCursorTrail, createStaggeredReveal, createGlowPulse } from "./motion.ts";
import { filterPromptSearchEntries, parsePromptDocument, type ParsedPromptDocument, type PromptSearchEntry } from "../prompts.ts";
import type { PromptRevision } from "../revisions.ts";
import { IDLE_PULSE_PERIOD_MS, LOGO_PULSE_PERIOD_MS } from "./constants.ts";

export type AppScreen = "inbox" | "editor" | "diff" | "revisions" | "revision-preview" | "help";
export type EditorSaveState = "clean" | "dirty" | "saving" | "error";
export type InboxInputMode = "create-folder" | "rename" | null;

export interface InboxEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isHtmlWorkspace?: boolean;
  isAsset?: boolean;
  isTableData?: boolean;
  label?: string;
  prompt?: ParsedPromptDocument;
}

export interface TerminalState {
  columns: number;
  rows: number;
}

export interface InboxState {
  directory: string;
  files: InboxEntry[];
  searchEntries: PromptSearchEntry[];
  cursor: number;
  scrollOffset: number;
  searchQuery: string;
  searchMode: boolean;
  inputMode: InboxInputMode;
  inputQuery: string;
  deleteConfirm: InboxEntry | null;
}

export interface EditorState {
  file: string | null;
  content: string;
  cursorLine: number;
  cursorCol: number;
  saveState: EditorSaveState;
  readOnly: boolean;
}

export interface DiffState {
  oldContent: string;
  newContent: string;
  revisionPath: string | null;
}

export interface RevisionsState {
  files: PromptRevision[];
  cursor: number;
  scrollOffset: number;
  previewPath: string | null;
  previewContent: string;
}

export interface OverlayState {
  helpReturnTo: AppScreen | null;
}

export interface TuiStore {
  screen: AppScreen;
  running: boolean;
  overlay: OverlayState;
  terminal: TerminalState;
  inbox: InboxState;
  editor: EditorState;
  diff: DiffState;
  revisions: RevisionsState;
  error: string | null;
  hardwareCursor: { row: number; col: number } | null;
}

export function createTuiState() {
  const [state, setState] = createStore<TuiStore>({
    screen: "inbox",
    running: true,
    overlay: { helpReturnTo: null },
    terminal: {
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    },
    inbox: {
      directory: "",
      files: [],
      searchEntries: [],
      cursor: 0,
      scrollOffset: 0,
      searchQuery: "",
      searchMode: false,
      inputMode: null,
      inputQuery: "",
      deleteConfirm: null,
    },
    editor: {
      file: null,
      content: "",
      cursorLine: 0,
      cursorCol: 0,
      saveState: "clean",
      readOnly: false,
    },
    diff: {
      oldContent: "",
      newContent: "",
      revisionPath: null,
    },
    revisions: {
      files: [],
      cursor: 0,
      scrollOffset: 0,
      previewPath: null,
      previewContent: "",
    },
    error: null,
    hardwareCursor: null,
  });

  const idlePulse = createBreathingPulse({ period: IDLE_PULSE_PERIOD_MS, min: 0.4, max: 1.0 });
  const logoPulse = createBreathingPulse({ period: LOGO_PULSE_PERIOD_MS, min: 0, max: 1.0 });

  const inboxCursorTrail = createCursorTrail(() => state.inbox.cursor, {
    fadeFrames: 6,
    maxTrail: 2,
  });

  const inboxReveal = createStaggeredReveal(() => state.inbox.files.length, {
    delay: 22,
    fadeDuration: 140,
    triggerKey: () => state.inbox.directory,
  });

  const hintGlow = createGlowPulse({
    period: 5200,
    baseColor: [88, 88, 88],
    glowColor: [185, 185, 185],
  });

  const editorParsedPrompt = createMemo(() => parsePromptDocument(state.editor.content));

  const inboxFilteredSearch = createMemo<InboxEntry[] | null>(() => {
    const query = state.inbox.searchQuery.trim();
    if (query.length === 0) return null;
    if (state.inbox.searchEntries.length === 0) return null;
    const filtered = filterPromptSearchEntries(query, state.inbox.searchEntries);
    return filtered.map((entry) => ({
      name: entry.name,
      label: entry.relativePath,
      path: entry.path,
      isDirectory: entry.isDirectory === true,
      isHtmlWorkspace: entry.isHtmlWorkspace,
      prompt: entry.document,
    }));
  });

  return { state, setState, idlePulse, logoPulse, inboxCursorTrail, inboxReveal, hintGlow, editorParsedPrompt, inboxFilteredSearch };
}

export type TuiState = ReturnType<typeof createTuiState>;
