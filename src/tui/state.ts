import { createSignal } from "solid-js";
import { createBreathingPulse } from "./motion.ts";

export type AppScreen = "inbox" | "editor";

export interface InboxEntry {
  name: string;
  path: string;
  isDirectory: boolean;
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

  // Editor
  const [currentFile, setCurrentFile] = createSignal<string | null>(null);
  const [fileContent, setFileContent] = createSignal<string>("");
  const [editorCursorLine, setEditorCursorLine] = createSignal(0);
  const [editorCursorCol, setEditorCursorCol] = createSignal(0);

  // Global
  const [error, setError] = createSignal<string | null>(null);

  // Motion
  const idlePulse = createBreathingPulse({ period: 4000, min: 0.4, max: 1.0 });

  return {
    screen, setScreen,
    columns, setColumns,
    rows, setRows,
    currentDirectory, setCurrentDirectory,
    inboxFiles, setInboxFiles,
    inboxCursor, setInboxCursor,
    inboxScrollOffset, setInboxScrollOffset,
    currentFile, setCurrentFile,
    fileContent, setFileContent,
    editorCursorLine, setEditorCursorLine,
    editorCursorCol, setEditorCursorCol,
    error, setError,
    idlePulse
  };
}

export type TuiState = ReturnType<typeof createTuiState>;
