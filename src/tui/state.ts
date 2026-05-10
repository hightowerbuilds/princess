import { createSignal } from "solid-js";
import { createBreathingPulse } from "./motion.ts";
import type { ParsedPromptDocument } from "../prompts.ts";

export type AppScreen = "inbox" | "editor" | "diff" | "revisions" | "revision-preview" | "help";
export type EditorSaveState = "clean" | "dirty" | "saving" | "error";

export interface InboxEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  label?: string;
  prompt?: ParsedPromptDocument;
}

export function createTuiState() {
  const [screen, setScreen] = createSignal<AppScreen>("inbox");

  // Terminal dimensions
  const [columns, setColumns] = createSignal(process.stdout.columns ?? 80);
  const [rows, setRows] = createSignal(process.stdout.rows ?? 24);

  // Inbox
  const [currentDirectory, setCurrentDirectory] = createSignal("");
  const [inboxFiles, setInboxFiles] = createSignal<InboxEntry[]>([]);
  const [inboxCursor, setInboxCursor] = createSignal(0);
  const [inboxScrollOffset, setInboxScrollOffset] = createSignal(0);
  const [inboxSearchQuery, setInboxSearchQuery] = createSignal("");
  const [inboxSearchMode, setInboxSearchMode] = createSignal(false);
  const [inboxInputMode, setInboxInputMode] = createSignal<"create-folder" | "rename" | null>(null);
  const [inboxInputQuery, setInboxInputQuery] = createSignal("");
  const [inboxDeleteConfirm, setInboxDeleteConfirm] = createSignal<InboxEntry | null>(null);

  // Editor
  const [currentFile, setCurrentFile] = createSignal<string | null>(null);
  const [fileContent, setFileContent] = createSignal<string>("");
  const [editorCursorLine, setEditorCursorLine] = createSignal(0);
  const [editorCursorCol, setEditorCursorCol] = createSignal(0);
  const [editorSaveState, setEditorSaveState] = createSignal<EditorSaveState>("clean");
  const [diffOldContent, setDiffOldContent] = createSignal("");
  const [diffNewContent, setDiffNewContent] = createSignal("");
  const [diffRevisionPath, setDiffRevisionPath] = createSignal<string | null>(null);
  const [revisionFiles, setRevisionFiles] = createSignal<{
    path: string;
    createdAt: string;
    content: string;
  }[]>([]);
  const [revisionCursor, setRevisionCursor] = createSignal(0);
  const [revisionScrollOffset, setRevisionScrollOffset] = createSignal(0);
  const [revisionPreviewPath, setRevisionPreviewPath] = createSignal<string | null>(null);
  const [revisionPreviewContent, setRevisionPreviewContent] = createSignal("");

  // Global
  const [error, setError] = createSignal<string | null>(null);

  // Motion
  const idlePulse = createBreathingPulse({ period: 4000, min: 0.4, max: 1.0 });
  const logoPulse = createBreathingPulse({ period: 8000, min: 0, max: 1.0 });

  return {
    screen, setScreen,
    columns, setColumns,
    rows, setRows,
    currentDirectory, setCurrentDirectory,
    inboxFiles, setInboxFiles,
    inboxCursor, setInboxCursor,
    inboxScrollOffset, setInboxScrollOffset,
    inboxSearchQuery, setInboxSearchQuery,
    inboxSearchMode, setInboxSearchMode,
    inboxInputMode, setInboxInputMode,
    inboxInputQuery, setInboxInputQuery,
    inboxDeleteConfirm, setInboxDeleteConfirm,
    currentFile, setCurrentFile,
    fileContent, setFileContent,
    editorCursorLine, setEditorCursorLine,
    editorCursorCol, setEditorCursorCol,
    editorSaveState, setEditorSaveState,
    diffOldContent, setDiffOldContent,
    diffNewContent, setDiffNewContent,
    diffRevisionPath, setDiffRevisionPath,
    revisionFiles, setRevisionFiles,
    revisionCursor, setRevisionCursor,
    revisionScrollOffset, setRevisionScrollOffset,
    revisionPreviewPath, setRevisionPreviewPath,
    revisionPreviewContent, setRevisionPreviewContent,
    error, setError,
    idlePulse,
    logoPulse
  };
}

export type TuiState = ReturnType<typeof createTuiState>;
