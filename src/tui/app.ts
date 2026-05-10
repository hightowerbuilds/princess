import { batch } from "solid-js";
import os from "node:os";
import path from "node:path";
import { readdir, readFile, mkdir, unlink } from "node:fs/promises";
import type { KeyEvent } from "./input.ts";
import type { TuiState } from "./state.ts";
import { copyToClipboard } from "./clipboard.ts";
import { getPaths } from "../paths.ts";
import { filterPromptSearchEntries, parsePromptDocument, type PromptSearchEntry } from "../prompts.ts";
import { recordPromptRevision, readLatestPromptRevision, listPromptRevisions } from "../revisions.ts";
import { atomicWriteFile, cleanupTempFiles } from "../storage.ts";

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
    // Cleanup stale temp files on startup
    void cleanupTempFiles(baseInboxDir);
  } catch {}

  while (true) {
    state.setScreen("inbox");
    state.idlePulse.start();
    state.logoPulse.start();

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
    const query = state.inboxSearchQuery().trim();

    if (query.length > 0) {
      const entries = await collectPromptSearchEntries(targetDir, "");
      const filtered = filterPromptSearchEntries(query, entries);

      batch(() => {
        state.setInboxFiles(
          filtered.map((entry) => ({
            name: entry.name,
            label: entry.relativePath,
            path: entry.path,
            isDirectory: false,
            prompt: entry.document,
          })),
        );
        if (state.inboxCursor() >= filtered.length) {
          state.setInboxCursor(Math.max(0, filtered.length - 1));
        }
        state.setInboxScrollOffset(0);
      });
      return;
    }

    const entries = await readdir(targetDir, { withFileTypes: true });
    
    const entriesList = await Promise.all(
      entries
        .filter((e) => e.isDirectory() || e.name.endsWith(".md"))
        .map(async (e) => {
          const item = {
            name: e.name,
            path: path.join(targetDir, e.name),
            isDirectory: e.isDirectory(),
          };

          if (e.isDirectory()) {
            return item;
          }

          try {
            const content = await readFile(item.path, "utf8");
            return { ...item, prompt: parsePromptDocument(content) };
          } catch {
            return item;
          }
        }),
    );

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
      state.setInboxScrollOffset(Math.min(state.inboxScrollOffset(), Math.max(0, entriesList.length - 1)));
    });
  } catch (err) {
    state.setError(err instanceof Error ? err.message : String(err));
  }
}

async function collectPromptSearchEntries(rootDir: string, relativeDir: string): Promise<PromptSearchEntry[]> {
  const targetDir = path.join(rootDir, relativeDir);
  const entries = await readdir(targetDir, { withFileTypes: true });
  const results: PromptSearchEntry[] = [];

  for (const entry of entries) {
    const entryPath = path.join(targetDir, entry.name);
    const entryRelativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      const children = await collectPromptSearchEntries(rootDir, entryRelativePath);
      results.push(...children);
      continue;
    }

    if (!entry.name.endsWith(".md")) continue;

    try {
      const content = await readFile(entryPath, "utf8");
      results.push({
        name: entry.name,
        path: entryPath,
        relativePath: entryRelativePath,
        document: parsePromptDocument(content),
      });
    } catch {
      continue;
    }
  }

  return results;
}

function waitForInboxSelection(state: TuiState): Promise<"edit" | "quit" | "refresh"> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      if (isHelpHotkey(key)) {
        await openHelpScreen(state);
        return;
      }

      const files = state.inboxFiles();
      const cursor = state.inboxCursor();
      const offset = state.inboxScrollOffset();
      const listHeight = Math.max(state.rows() - 14, 5);
      const isSearchMode = state.inboxSearchMode();
      const inputMode = state.inboxInputMode();
      const deleteConfirm = state.inboxDeleteConfirm();

      if (deleteConfirm) {
        if (key.name === "y" || key.name === "Y") {
          try {
            if (deleteConfirm.isDirectory) {
              await import("node:fs/promises").then((fs) => fs.rmdir(deleteConfirm.path));
            } else {
              await unlink(deleteConfirm.path);
            }
            state.setError(`Deleted ${deleteConfirm.name}`);
          } catch (err: any) {
            state.setError(err.message);
          }
          state.setInboxDeleteConfirm(null);
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name === "n" || key.name === "N" || key.name === "escape") {
          state.setInboxDeleteConfirm(null);
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        // Ignore other keys while confirming delete
        activeKeyResolver = null;
        resolve("refresh");
        return;
      }

      if (inputMode) {
        if (key.name === "escape") {
          batch(() => {
            state.setInboxInputMode(null);
            state.setInboxInputQuery("");
            state.setError(null);
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name === "enter") {
          const query = state.inboxInputQuery().trim();
          if (query.length > 0) {
            try {
              const { inboxDir: baseInboxDir } = getPaths();
              const currentSub = state.currentDirectory();
              const targetParent = path.join(baseInboxDir, currentSub);

              if (inputMode === "create-folder") {
                await mkdir(path.join(targetParent, query), { recursive: true });
                state.setError(`Created folder: ${query}`);
              } else if (inputMode === "rename") {
                const selected = files[cursor];
                if (selected && selected.name !== "..") {
                  const oldPath = selected.path;
                  const newPath = path.join(path.dirname(oldPath), query);
                  await import("node:fs/promises").then(fs => fs.rename(oldPath, newPath));
                  state.setError(`Renamed to: ${query}`);
                }
              }
            } catch (err: any) {
              state.setError(err.message);
            }
          }
          batch(() => {
            state.setInboxInputMode(null);
            state.setInboxInputQuery("");
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name === "backspace") {
          batch(() => {
            state.setInboxInputQuery(state.inboxInputQuery().slice(0, -1));
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name.length === 1 && !key.ctrl && !key.meta) {
          batch(() => {
            state.setInboxInputQuery(state.inboxInputQuery() + (key.shift ? key.name.toUpperCase() : key.name));
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }
        
        if (key.name === "space") {
          batch(() => {
            state.setInboxInputQuery(state.inboxInputQuery() + " ");
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        activeKeyResolver = null;
        resolve("refresh");
        return;
      }

      if (isSearchMode) {
        if (key.name === "escape") {
          batch(() => {
            state.setInboxSearchMode(false);
            state.setInboxSearchQuery("");
            state.setInboxCursor(0);
            state.setInboxScrollOffset(0);
            state.setError(null);
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name === "enter") {
          batch(() => {
            state.setInboxSearchMode(false);
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name === "backspace") {
          batch(() => {
            state.setInboxSearchQuery(state.inboxSearchQuery().slice(0, -1));
            state.setInboxCursor(0);
            state.setInboxScrollOffset(0);
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        if (key.name.length === 1 && !key.ctrl && !key.meta) {
          batch(() => {
            state.setInboxSearchQuery(state.inboxSearchQuery() + key.name);
            state.setInboxCursor(0);
            state.setInboxScrollOffset(0);
          });
          activeKeyResolver = null;
          resolve("refresh");
          return;
        }

        activeKeyResolver = null;
        resolve("refresh");
        return;
      }

      switch (key.name) {
        case "/": {
          batch(() => {
            state.setInboxSearchMode(true);
            state.setInboxCursor(0);
            state.setInboxScrollOffset(0);
          });
          break;
        }
        case "n": {
          if (!key.ctrl && !key.meta) {
            batch(() => {
              state.setInboxInputMode("create-folder");
              state.setInboxInputQuery("");
            });
          }
          break;
        }
        case "r": {
          if (!key.ctrl && !key.meta && files.length > 0) {
            const selected = files[cursor];
            if (selected && selected.name !== "..") {
              batch(() => {
                state.setInboxInputMode("rename");
                state.setInboxInputQuery(selected.name);
              });
            } else {
              state.setError("Cannot rename parent directory link.");
            }
          }
          break;
        }
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
               batch(() => {
                 state.setInboxDeleteConfirm(selected);
                 state.setError(null);
               });
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
      state.setEditorSaveState("clean");
    });
  } catch (err) {
    state.setError(err instanceof Error ? err.message : String(err));
  }
}

function waitForEditor(state: TuiState, filepath: string): Promise<void> {
  return new Promise((resolve) => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSavedContent = state.fileContent();
    let saving = false;

    const flushSave = async (forceSnapshot = false) => {
      if (saving) return;
      saving = true;
      try {
        const content = state.fileContent();
        if (content === lastSavedContent) {
          batch(() => state.setEditorSaveState("clean"));
          return;
        }

        const previousContent = await readFile(filepath, "utf8").catch(() => null);
        if (previousContent !== null && previousContent !== content && (forceSnapshot || lastSavedContent !== "")) {
          await recordPromptRevision(filepath, previousContent);
        }

        batch(() => state.setEditorSaveState("saving"));
        await atomicWriteFile(filepath, content);
        lastSavedContent = content;
        batch(() => state.setEditorSaveState("clean"));
      } catch (err: any) {
        state.setEditorSaveState("error");
        state.setError(err.message);
      } finally {
        saving = false;
      }
    };

    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void flushSave(false);
      }, 1200);
    };

    const cancelSaveTimer = () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    };

    const openLatestDiff = async () => {
      try {
        cancelSaveTimer();
        const latest = await readLatestPromptRevision(filepath);
        if (!latest) {
          state.setError("No revisions saved yet.");
          return;
        }
        const resumeEditor = activeKeyResolver;
        batch(() => {
          state.setDiffOldContent(latest.content);
          state.setDiffNewContent(state.fileContent());
          state.setDiffRevisionPath(latest.path);
          state.setScreen("diff");
        });
        await waitForDiff(state);
        state.setScreen("editor");
        activeKeyResolver = resumeEditor;
      } catch (err: any) {
        state.setError(err.message);
      }
    };

    const openRevisionBrowser = async () => {
      try {
        cancelSaveTimer();
        const revisions = await listPromptRevisions(filepath);
        const resumeEditor = activeKeyResolver;
        batch(() => {
          state.setRevisionFiles(revisions);
          state.setRevisionCursor(0);
          state.setRevisionScrollOffset(0);
          state.setScreen("revisions");
        });
        await waitForRevisions(state, filepath);
        state.setScreen("editor");
        activeKeyResolver = resumeEditor;
      } catch (err: any) {
        state.setError(err.message);
      }
    };

    activeKeyResolver = async (key: KeyEvent) => {
      let content = state.fileContent();
      let lines = content.split('\n');
      let cLine = state.editorCursorLine();
      let cCol = state.editorCursorCol();

      let needsSave = false;

      if (isHelpHotkey(key)) {
        await openHelpScreen(state);
        return;
      }

      switch (key.name) {
        case "escape": {
          cancelSaveTimer();
          await flushSave(false);
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
        case "ctrl+s": {
           cancelSaveTimer();
           state.setEditorSaveState("saving");
           await flushSave(true);
           state.setError("Saved.");
           break;
        }
        case "ctrl+r": {
           await openLatestDiff();
           break;
        }
        case "ctrl+p": {
           await openRevisionBrowser();
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
        state.setFileContent(content);
        cancelSaveTimer();
        state.setEditorSaveState("saving");
        await flushSave(true);
        state.setError("Saved.");
      }

      batch(() => {
        state.setFileContent(lines.join('\n'));
        state.setEditorCursorLine(cLine);
        state.setEditorCursorCol(cCol);
      });

      if (needsSave) {
        state.setEditorSaveState("dirty");
        scheduleSave();
      }
    };
    });
    }

function waitForDiff(state: TuiState): Promise<void> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      if (isHelpHotkey(key)) {
        await openHelpScreen(state);
        return;
      }

      switch (key.name) {
        case "escape":
        case "ctrl+r": {
          activeKeyResolver = null;
          resolve();
          return;
        }
      }
    };
  });
}

async function openRevisionPreview(
  state: TuiState,
  revision: { path: string; content: string },
): Promise<"back" | "restore"> {
  const resumeRevisions = activeKeyResolver;
  batch(() => {
    state.setRevisionPreviewPath(revision.path);
    state.setRevisionPreviewContent(revision.content);
    state.setScreen("revision-preview");
  });

  const result = await waitForRevisionPreview(state, revision);
  if (result === "back") {
    batch(() => {
      state.setScreen("revisions");
    });
    activeKeyResolver = resumeRevisions;
  }
  return result;
}

async function openHelpScreen(state: TuiState): Promise<void> {
  const resumeResolver = activeKeyResolver;
  const resumeScreen = state.screen();

  batch(() => {
    state.setScreen("help");
  });

  await waitForHelp(state);

  batch(() => {
    state.setScreen(resumeScreen);
  });
  activeKeyResolver = resumeResolver;
}

async function saveRevisionAsVariant(state: TuiState, originalPath: string, content: string) {
  try {
    const dir = path.dirname(originalPath);
    const parsed = parsePromptDocument(content);
    const baseTitle = parsed.metadata.title || path.basename(originalPath, ".md");
    
    let version = 1;
    let newPath = "";
    while (true) {
      const filename = `${sanitizePromptTitle(baseTitle)}-variant-${version}.md`;
      newPath = path.join(dir, filename);
      const exists = await import("node:fs/promises").then(fs => fs.stat(newPath).then(() => true).catch(() => false));
      if (!exists) break;
      version++;
    }

    await atomicWriteFile(newPath, content);
    state.setError(`Saved variant: ${path.basename(newPath)}`);
  } catch (err: any) {
    state.setError(`Failed to save variant: ${err.message}`);
  }
}

function waitForRevisions(state: TuiState, filepath: string): Promise<void> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      if (isHelpHotkey(key)) {
        await openHelpScreen(state);
        return;
      }

      const revisions = state.revisionFiles();
      const cursor = state.revisionCursor();
      const offset = state.revisionScrollOffset();
      const listHeight = Math.max(state.rows() - 10, 5);

      switch (key.name) {
        case "up":
        case "k": {
          if (cursor > 0) {
            const prev = cursor - 1;
            state.setRevisionCursor(prev);
            if (prev < offset) state.setRevisionScrollOffset(prev);
          }
          break;
        }
        case "down":
        case "j": {
          if (cursor < revisions.length - 1) {
            const next = cursor + 1;
            state.setRevisionCursor(next);
            if (next >= offset + listHeight) state.setRevisionScrollOffset(next - listHeight + 1);
          }
          break;
        }
        case "pageup": {
          const prev = Math.max(cursor - listHeight, 0);
          state.setRevisionCursor(prev);
          state.setRevisionScrollOffset(prev);
          break;
        }
        case "pagedown": {
          const next = Math.min(cursor + listHeight, revisions.length - 1);
          state.setRevisionCursor(next);
          state.setRevisionScrollOffset(Math.min(next, Math.max(0, revisions.length - listHeight)));
          break;
        }
        case "c": {
          if (revisions.length > 0 && !key.ctrl && !key.meta) {
            try {
              await copyToClipboard(revisions[cursor].content);
              state.setError("Revision copied to clipboard!");
            } catch (err: any) {
              state.setError(err.message);
            }
          }
          break;
        }
        case "v": {
          if (revisions.length > 0 && !key.ctrl && !key.meta) {
            await saveRevisionAsVariant(state, filepath, revisions[cursor].content);
          }
          break;
        }
        case "enter": {
          if (revisions.length > 0) {
            const selected = revisions[cursor];
            const result = await openRevisionPreview(state, selected);
            if (result === "restore") {
              activeKeyResolver = null;
              resolve();
            }
            return;
          }
          break;
        }
        case "escape": {
          activeKeyResolver = null;
          resolve();
          return;
        }
      }
    };
  });
}

function isHelpHotkey(key: KeyEvent): boolean {
  return key.name === "ctrl+/" || key.name === "/" && key.shift && !key.ctrl && !key.meta;
}

function waitForRevisionPreview(
  state: TuiState,
  revision: { path: string; content: string },
): Promise<"back" | "restore"> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      if (isHelpHotkey(key)) {
        await openHelpScreen(state);
        return;
      }

      switch (key.name) {
        case "r": {
          if (!key.ctrl && !key.meta) {
            const currentPath = state.currentFile();
            const currentContent = state.fileContent();
            if (currentPath) {
              await recordPromptRevision(currentPath, currentContent);
            }

            batch(() => {
              state.setFileContent(revision.content);
              state.setEditorCursorLine(0);
              state.setEditorCursorCol(0);
              state.setEditorSaveState("dirty");
              state.setScreen("editor");
            });
            state.setError("Revision restored into editor.");
            activeKeyResolver = null;
            resolve("restore");
          }
          return;
        }
        case "c": {
          if (!key.ctrl && !key.meta) {
            try {
              await copyToClipboard(revision.content);
              state.setError("Revision copied to clipboard.");
            } catch (err: any) {
              state.setError(err.message);
            }
          }
          return;
        }
        case "v": {
          if (!key.ctrl && !key.meta) {
            const currentPath = state.currentFile();
            if (currentPath) {
              await saveRevisionAsVariant(state, currentPath, revision.content);
            }
          }
          return;
        }
        case "escape": {
          activeKeyResolver = null;
          resolve("back");
          return;
        }
      }
    };
  });
}

function waitForHelp(_state: TuiState): Promise<void> {
  return new Promise((resolve) => {
    activeKeyResolver = async (key: KeyEvent) => {
      if (isHelpHotkey(key) || key.name === "escape" || key.name === "enter") {
        activeKeyResolver = null;
        resolve();
      }
    };
  });
}
