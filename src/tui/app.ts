import { batch } from "solid-js";
import os from "node:os";
import path from "node:path";
import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import type { KeyEvent } from "./input.ts";
import type { TuiState } from "./state.ts";
import { copyToClipboard } from "./clipboard.ts";
import { getPaths } from "../paths.ts";

type KeyResolver = (key: KeyEvent) => void;
let activeKeyResolver: KeyResolver | null = null;

export function handleKey(key: KeyEvent, _state: TuiState): void {
  if (activeKeyResolver) {
    activeKeyResolver(key);
  } else if (key.name === "ctrl+c") {
    process.exit(130);
  }
}

export async function runApp(state: TuiState): Promise<void> {
  const { inboxDir: baseInboxDir } = getPaths();
  
  // Ensure base inbox directory exists
  try {
    await mkdir(baseInboxDir, { recursive: true });
  } catch {}

  while (true) {
    state.setScreen("inbox");
    state.idlePulse.start();

    // Reload files for current directory
    await loadInboxFiles(state, baseInboxDir);

    const action = await waitForInboxSelection(state);
    state.idlePulse.stop();

    if (action === "quit") return;
    if (action === "refresh") continue;

    if (action === "edit") {
      const files = state.inboxFiles();
      const cursor = state.inboxCursor();
      const selected = files[cursor];

      if (selected) {
        if (selected.isDirectory) {
           if (selected.name === "..") {
             // Go up one directory
             const current = state.currentDirectory();
             const parent = path.dirname(current);
             state.setCurrentDirectory(parent === "." || current === parent ? "" : parent);
           } else {
             // Go into subdirectory
             const targetPath = path.join(state.currentDirectory(), selected.name);
             state.setCurrentDirectory(targetPath);
           }
           state.setInboxCursor(0);
        } else {
          await loadEditor(state, selected.path);
          state.setScreen("editor");
          await waitForEditor(state, selected.path);
        }
      }
    }
  }
}

async function loadInboxFiles(state: TuiState, baseInboxDir: string) {
  try {
    const currentSub = state.currentDirectory();
    const targetDir = path.join(baseInboxDir, currentSub);
    const entries = await readdir(targetDir, { withFileTypes: true });
    
    let entriesList = entries
      .filter(e => e.isDirectory() || e.name.endsWith(".md"))
      .map(e => ({
        name: e.name,
        path: path.join(targetDir, e.name),
        isDirectory: e.isDirectory()
      }));

    // Sort: directories first, then alphabetically
    entriesList.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    if (currentSub !== "") {
      entriesList.unshift({
        name: "..",
        path: path.dirname(targetDir),
        isDirectory: true
      });
    }

    batch(() => {
      state.setInboxFiles(entriesList);
      if (state.inboxCursor() >= entriesList.length) {
        state.setInboxCursor(Math.max(0, entriesList.length - 1));
      }
    });
  } catch (err) {
    state.setError(err instanceof Error ? err.message : String(err));
  }
}

function waitForInboxSelection(state: TuiState): Promise<"edit" | "quit" | "refresh"> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      const files = state.inboxFiles();
      const cursor = state.inboxCursor();
      const offset = state.inboxScrollOffset();
      const listHeight = Math.max(state.rows() - 14, 5);

      switch (key.name) {
        case "down":
        case "j": {
          if (cursor < files.length - 1) {
             const next = cursor + 1;
             state.setInboxCursor(next);
             if (next >= offset + listHeight) {
               state.setInboxScrollOffset(next - listHeight + 1);
             }
          }
          break;
        }
        case "up":
        case "k": {
          if (cursor > 0) {
            const prev = cursor - 1;
            state.setInboxCursor(prev);
            if (prev < offset) {
              state.setInboxScrollOffset(prev);
            }
          }
          break;
        }
        case "pagedown": {
          const next = Math.min(cursor + listHeight, files.length - 1);
          state.setInboxCursor(next);
          state.setInboxScrollOffset(Math.min(next, Math.max(0, files.length - listHeight)));
          break;
        }
        case "pageup": {
          const prev = Math.max(cursor - listHeight, 0);
          state.setInboxCursor(prev);
          state.setInboxScrollOffset(prev);
          break;
        }
        case "c": {
          if (files.length > 0 && !key.ctrl && !key.meta) {
             const selected = files[cursor];
             if (!selected.isDirectory) {
               try {
                  const content = await readFile(selected.path, "utf8");
                  await copyToClipboard(content);
                  state.setError("Copied to clipboard!");
               } catch (err: any) {
                  state.setError(err.message);
               }
             } else {
               state.setError("Cannot copy a directory.");
             }
             activeKeyResolver = null;
             resolve("refresh");
          }
          break;
        }
        case "d": {
          if (files.length > 0 && !key.ctrl && !key.meta) {
             const selected = files[cursor];
             if (selected.name === "..") {
               state.setError("Cannot delete parent directory link.");
             } else {
               try {
                  // For now, simple unlink for files, rmdir for empty dirs
                  if (selected.isDirectory) {
                     await import("node:fs/promises").then(fs => fs.rmdir(selected.path));
                  } else {
                     await unlink(selected.path);
                  }
                  state.setError(`Deleted ${selected.name}`);
               } catch(err: any) {
                  state.setError(err.message);
               }
             }
             activeKeyResolver = null;
             resolve("refresh");
          }
          break;
        }
        case "enter": {
          if (files.length > 0) {
            activeKeyResolver = null;
            resolve("edit");
          }
          break;
        }
        case "ctrl+c":
        case "q":
        case "escape": {
          activeKeyResolver = null;
          resolve("quit");
          break;
        }
      }
    };
  });
}

async function loadEditor(state: TuiState, filepath: string) {
  try {
    const content = await readFile(filepath, "utf8");
    batch(() => {
      state.setCurrentFile(filepath);
      state.setFileContent(content);
      state.setEditorCursorLine(0);
      state.setEditorCursorCol(0);
    });
  } catch (err) {
    state.setError(err instanceof Error ? err.message : String(err));
  }
}

function waitForEditor(state: TuiState, filepath: string): Promise<void> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      let content = state.fileContent();
      let lines = content.split('\n');
      let cLine = state.editorCursorLine();
      let cCol = state.editorCursorCol();

      let needsSave = false;

      switch (key.name) {
        case "escape": {
          activeKeyResolver = null;
          resolve();
          return;
        }
        case "up": {
          if (cLine > 0) {
            cLine--;
            cCol = Math.min(cCol, (lines[cLine] || "").length);
          }
          break;
        }
        case "down": {
          if (cLine < lines.length - 1) {
            cLine++;
            cCol = Math.min(cCol, (lines[cLine] || "").length);
          }
          break;
        }
        case "pagedown": {
          const listHeight = Math.max(state.rows() - 4, 5);
          cLine = Math.min(cLine + listHeight, lines.length - 1);
          cCol = Math.min(cCol, (lines[cLine] || "").length);
          break;
        }
        case "pageup": {
          const listHeight = Math.max(state.rows() - 4, 5);
          cLine = Math.max(cLine - listHeight, 0);
          cCol = Math.min(cCol, (lines[cLine] || "").length);
          break;
        }
        case "ctrl+d": {
           const listHeight = Math.max(Math.floor((state.rows() - 4) / 2), 1);
           cLine = Math.min(cLine + listHeight, lines.length - 1);
           cCol = Math.min(cCol, (lines[cLine] || "").length);
           break;
        }
        case "ctrl+u": {
           const listHeight = Math.max(Math.floor((state.rows() - 4) / 2), 1);
           cLine = Math.max(cLine - listHeight, 0);
           cCol = Math.min(cCol, (lines[cLine] || "").length);
           break;
        }
        case "ctrl+c": {
           try {
              await copyToClipboard(state.fileContent());
              state.setError("Copied to clipboard!");
           } catch (err: any) {
              state.setError(err.message);
           }
           break;
        }
        case "left": {
          if (cCol > 0) {
            cCol--;
          } else if (cLine > 0) {
            cLine--;
            cCol = (lines[cLine] || "").length;
          }
          break;
        }
        case "right": {
          if (cCol < (lines[cLine] || "").length) {
            cCol++;
          } else if (cLine < lines.length - 1) {
            cLine++;
            cCol = 0;
          }
          break;
        }
        case "backspace": {
          if (cCol > 0) {
            const line = lines[cLine];
            lines[cLine] = line.slice(0, cCol - 1) + line.slice(cCol);
            cCol--;
            needsSave = true;
          } else if (cLine > 0) {
            const prevLineLength = lines[cLine - 1].length;
            lines[cLine - 1] += lines[cLine];
            lines.splice(cLine, 1);
            cLine--;
            cCol = prevLineLength;
            needsSave = true;
          }
          break;
        }
        case "enter": {
          const line = lines[cLine];
          const before = line.slice(0, cCol);
          const after = line.slice(cCol);
          lines[cLine] = before;
          lines.splice(cLine + 1, 0, after);
          cLine++;
          cCol = 0;
          needsSave = true;
          break;
        }
        default: {
          if (key.name.length === 1 && !key.ctrl && !key.meta) {
            const char = key.shift ? key.name.toUpperCase() : key.name;
            const line = lines[cLine] || "";
            lines[cLine] = line.slice(0, cCol) + char + line.slice(cCol);
            cCol++;
            needsSave = true;
          } else if (key.name === "space") {
            const line = lines[cLine] || "";
            lines[cLine] = line.slice(0, cCol) + " " + line.slice(cCol);
            cCol++;
            needsSave = true;
          }
          break;
        }
      }

      if (key.name === "s" && key.ctrl) {
        content = lines.join('\n');
        await writeFile(filepath, content, "utf8");
      }

      batch(() => {
        state.setFileContent(lines.join('\n'));
        state.setEditorCursorLine(cLine);
        state.setEditorCursorCol(cCol);
      });
    };
    });
    }
