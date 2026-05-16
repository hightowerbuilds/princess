import { batch, createEffect, createRoot, onCleanup } from "solid-js";
import path from "node:path";
import { access, readdir, readFile, mkdir, unlink, rename, rmdir, stat } from "node:fs/promises";
import type { KeyEvent } from "./input.ts";
import type { InboxEntry, TuiState } from "./state.ts";
import type { AppScreen } from "./state.ts";
import { copyToClipboard } from "./clipboard.ts";
import { getPaths } from "../paths.ts";
import { parsePromptDocument, sanitizePromptTitle, type PromptSearchEntry } from "../prompts.ts";
import { recordPromptRevision, readLatestPromptRevision, listPromptRevisions } from "../revisions.ts";
import { atomicWriteFile, cleanupTempFiles } from "../storage.ts";
import { openFileInDefaultBrowser } from "../browser.ts";
import { EDITOR_BODY_OVERHEAD_ROWS, INBOX_KEY_LIST_OVERHEAD_ROWS, REVISIONS_LIST_OVERHEAD_ROWS, SAVE_DEBOUNCE_MS } from "./constants.ts";
import { AGENT_LETTER_FILENAME } from "../default-prompts.ts";
import { readHtmlPromptManifest, type HtmlPromptManifest, type HtmlPromptResource } from "../html-prompts.ts";
import { isImageAssetFile, isTableDataFile, isVisibleInboxFile } from "../inbox-files.ts";

interface EditorSaveAPI {
  save: (forceSnapshot: boolean) => Promise<void>;
  cancelPending: () => void;
  resetBaseline: () => void;
}

let editorSaveAPI: EditorSaveAPI | null = null;

export function compareInboxEntriesForDisplay(currentSub: string, a: InboxEntry, b: InboxEntry): number {
  if (currentSub === "") {
    const aIsAgentLetter = a.name === AGENT_LETTER_FILENAME;
    const bIsAgentLetter = b.name === AGENT_LETTER_FILENAME;
    if (aIsAgentLetter && !bIsAgentLetter) return -1;
    if (!aIsAgentLetter && bIsAgentLetter) return 1;
  }
  if (a.isDirectory && !b.isDirectory) return -1;
  if (!a.isDirectory && b.isDirectory) return 1;
  return a.name.localeCompare(b.name);
}

export function handleKey(key: KeyEvent, state: TuiState): void {
  if (!state.state.running) return;

  const screen = state.state.screen;

  if (screen !== "help" && isHelpHotkey(key)) {
    openHelp(state);
    return;
  }

  switch (screen) {
    case "inbox":
      void handleInboxKey(key, state);
      return;
    case "editor":
      void handleEditorKey(key, state);
      return;
    case "diff":
      handleDiffKey(key, state);
      return;
    case "revisions":
      void handleRevisionsKey(key, state);
      return;
    case "revision-preview":
      void handleRevisionPreviewKey(key, state);
      return;
    case "help":
      handleHelpKey(key, state);
      return;
  }
}

export async function runApp(state: TuiState): Promise<void> {
  const { inboxDir: baseInboxDir } = getPaths();

  try {
    await mkdir(baseInboxDir, { recursive: true });
    void cleanupTempFiles(baseInboxDir);
  } catch {}

  state.idlePulse.start();
  state.logoPulse.start();

  await new Promise<void>((resolve) => {
    createRoot((dispose) => {
      editorSaveAPI = createEditorSaveLoop(state);

      createEffect(() => {
        const screen = state.state.screen;
        const directory = state.state.inbox.directory;
        if (screen === "inbox") {
          void loadInboxFiles(state, baseInboxDir, directory);
        }
      });

      createEffect(() => {
        if (!state.state.running) {
          dispose();
          resolve();
        }
      });
    });
  });

  state.idlePulse.stop();
  state.logoPulse.stop();
  editorSaveAPI = null;
}

function createEditorSaveLoop(state: TuiState): EditorSaveAPI {
  let baseline = "";
  let currentFile: string | null = null;
  let inFlight: Promise<void> | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPending = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const save = async (forceSnapshot: boolean): Promise<void> => {
    while (inFlight) await inFlight;
    const file = currentFile;
    if (!file) return;
    inFlight = (async () => {
      try {
        const content = state.state.editor.content;
        if (content === baseline) {
          state.setState("editor", "saveState", "clean");
          return;
        }
        const previousContent = await readFile(file, "utf8").catch(() => null);
        if (previousContent !== null && previousContent !== content && (forceSnapshot || baseline !== "")) {
          await recordPromptRevision(file, previousContent);
        }
        state.setState("editor", "saveState", "saving");
        await atomicWriteFile(file, content);
        baseline = content;
        state.setState("editor", "saveState", "clean");
      } catch (err: any) {
        state.setState("editor", "saveState", "error");
        state.setState("error", err.message);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const resetBaseline = () => {
    currentFile = state.state.editor.file;
    baseline = state.state.editor.content;
    cancelPending();
  };

  createEffect(() => {
    const screen = state.state.screen;
    const content = state.state.editor.content;
    if (screen !== "editor") return;
    if (content === baseline) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      void save(false);
    }, SAVE_DEBOUNCE_MS);
    onCleanup(cancelPending);
  });

  return { save, cancelPending, resetBaseline };
}

async function loadSearchEntries(state: TuiState, baseInboxDir: string) {
  try {
    const currentSub = state.state.inbox.directory;
    const targetDir = path.join(baseInboxDir, currentSub);
    const entries = await collectPromptSearchEntries(targetDir, "");
    state.setState("inbox", "searchEntries", entries);
  } catch (err) {
    state.setState("error", err instanceof Error ? err.message : String(err));
  }
}

async function loadInboxFiles(state: TuiState, baseInboxDir: string, currentSub: string) {
  try {
    const targetDir = path.join(baseInboxDir, currentSub);

    const entries = await readdir(targetDir, { withFileTypes: true });

    const entriesList = await Promise.all(
      entries
        .filter((e) => e.isDirectory() || isVisibleInboxFile(e.name))
        .map(async (e) => {
          const itemPath = path.join(targetDir, e.name);
          const isDir = e.isDirectory();
          const isAsset = !isDir && isImageAssetFile(e.name);
          const isTableData = !isDir && isTableDataFile(e.name);
          const item = {
            name: e.name,
            path: itemPath,
            isDirectory: isDir,
            isAsset,
            isTableData,
          };

          if (isDir) {
            const isWorkspace = await access(path.join(itemPath, "manifest.json")).then(() => true).catch(() => false);
            if (isWorkspace) {
              return { ...item, isHtmlWorkspace: true };
            }
            return item;
          }

          if (isAsset || isTableData) return item;

          try {
            const content = await readFile(item.path, "utf8");
            return { ...item, prompt: parsePromptDocument(content) };
          } catch {
            return item;
          }
        }),
    );

    entriesList.sort((a, b) => compareInboxEntriesForDisplay(currentSub, a, b));

    if (currentSub !== "") {
      entriesList.unshift({
        name: "..",
        path: path.dirname(targetDir),
        isDirectory: true,
        isAsset: false,
        isTableData: false,
      });
    }

    batch(() => {
      state.setState("inbox", "files", entriesList);
      if (state.state.inbox.cursor >= entriesList.length) {
        state.setState("inbox", "cursor", Math.max(0, entriesList.length - 1));
      }
      state.setState("inbox", "scrollOffset", Math.min(state.state.inbox.scrollOffset, Math.max(0, entriesList.length - 1)));
    });
  } catch (err) {
    state.setState("error", err instanceof Error ? err.message : String(err));
  }
}

function isInsideDirectory(rootDir: string, candidate: string): boolean {
  const relative = path.relative(rootDir, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function htmlWorkspaceMetadataText(manifest: HtmlPromptManifest, relativePath: string): string {
  const category = path.dirname(relativePath);
  const values = [
    manifest.title,
    manifest.slug,
    category === "." ? "" : category,
    manifest.createdAt,
    manifest.updatedAt,
    "html workspace",
    ...manifest.resources.flatMap((resource) => [
      resource.id,
      resource.type,
      resource.path,
      resource.originalPath ?? "",
      resource.mediaType ?? "",
      resource.alt ?? "",
      resource.trust ?? "",
    ]),
  ];
  return values.filter(Boolean).join("\n");
}

function isTextLikeHtmlResource(resource: HtmlPromptResource): boolean {
  if (resource.type === "table") return true;
  if (resource.type !== "source") return false;
  const mediaType = resource.mediaType ?? "";
  return mediaType.startsWith("text/") || mediaType === "application/json" || mediaType === "application/xml";
}

async function readHtmlResourceSearchText(workspaceDir: string, resource: HtmlPromptResource): Promise<string> {
  const metadata = [
    resource.id,
    resource.type,
    resource.path,
    resource.originalPath ?? "",
    resource.mediaType ?? "",
    resource.alt ?? "",
    resource.trust ?? "",
  ].filter(Boolean).join(" ");

  if (!isTextLikeHtmlResource(resource)) return metadata;

  const resourcePath = path.resolve(workspaceDir, resource.path);
  if (!isInsideDirectory(workspaceDir, resourcePath)) return metadata;

  try {
    const resourceStat = await stat(resourcePath);
    if (!resourceStat.isFile() || resourceStat.size > 512 * 1024) return metadata;
    const content = await readFile(resourcePath, "utf8");
    return `${metadata}\n${resource.type === "table" ? htmlToPlainText(content) : content}`;
  } catch {
    return metadata;
  }
}

async function htmlWorkspaceSearchEntry(rootDir: string, workspaceDir: string, relativePath: string): Promise<PromptSearchEntry | null> {
  if (!isInsideDirectory(rootDir, workspaceDir)) return null;

  try {
    const manifest = await readHtmlPromptManifest(workspaceDir);
    const promptHtml = await readFile(path.join(workspaceDir, "prompt.html"), "utf8").catch(() => "");
    const resourceTexts = await Promise.all(
      manifest.resources.map((resource) => readHtmlResourceSearchText(workspaceDir, resource)),
    );
    const category = path.dirname(relativePath);
    const body = [
      promptHtml,
      htmlToPlainText(promptHtml),
      htmlWorkspaceMetadataText(manifest, relativePath),
      ...resourceTexts,
    ].filter(Boolean).join("\n\n");

    return {
      name: path.basename(relativePath),
      path: workspaceDir,
      relativePath,
      isDirectory: true,
      isHtmlWorkspace: true,
      document: {
        hasFrontmatter: false,
        metadata: {
          title: manifest.title,
          category: category === "." ? "" : category,
          createdAt: manifest.createdAt,
          updatedAt: manifest.updatedAt,
          format: "html",
        },
        body,
        preview: htmlToPlainText(promptHtml) || manifest.title,
      },
    };
  } catch {
    return null;
  }
}

export async function collectPromptSearchEntries(rootDir: string, relativeDir: string): Promise<PromptSearchEntry[]> {
  const targetDir = path.join(rootDir, relativeDir);
  const entries = await readdir(targetDir, { withFileTypes: true });
  const results: PromptSearchEntry[] = [];

  for (const entry of entries) {
    const entryPath = path.join(targetDir, entry.name);
    const entryRelativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      const workspaceEntry = await htmlWorkspaceSearchEntry(rootDir, entryPath, entryRelativePath);
      if (workspaceEntry) {
        results.push(workspaceEntry);
        continue;
      }

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

function isHelpHotkey(key: KeyEvent): boolean {
  if (key.ctrl && key.name === "ctrl+/") return true;
  if (!key.ctrl && !key.meta && key.name === "?") return true;
  return false;
}

function openHelp(state: TuiState): void {
  batch(() => {
    state.setState("overlay", "helpReturnTo", state.state.screen);
    state.setState("screen", "help");
  });
}

function closeHelp(state: TuiState): void {
  const target: AppScreen = state.state.overlay.helpReturnTo ?? "inbox";
  batch(() => {
    state.setState("screen", target);
    state.setState("overlay", "helpReturnTo", null);
  });
}

function handleHelpKey(key: KeyEvent, state: TuiState): void {
  if (isHelpHotkey(key) || key.name === "escape" || key.name === "enter") {
    closeHelp(state);
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────────

async function handleInboxKey(key: KeyEvent, state: TuiState): Promise<void> {
  const files = state.inboxFilteredSearch() ?? state.state.inbox.files;
  const cursor = state.state.inbox.cursor;
  const offset = state.state.inbox.scrollOffset;
  const listHeight = Math.max(state.state.terminal.rows - INBOX_KEY_LIST_OVERHEAD_ROWS, 5);
  const isSearchMode = state.state.inbox.searchMode;
  const inputMode = state.state.inbox.inputMode;
  const deleteConfirm = state.state.inbox.deleteConfirm;
  const { inboxDir: baseInboxDir } = getPaths();

  if (deleteConfirm) {
    if (key.name === "y" || key.name === "Y") {
      try {
        if (deleteConfirm.isDirectory) {
          await rmdir(deleteConfirm.path);
        } else {
          await unlink(deleteConfirm.path);
        }
        state.setState("error", `Deleted ${deleteConfirm.name}`);
      } catch (err: any) {
        state.setState("error", err.message);
      }
      state.setState("inbox", "deleteConfirm", null);
      void loadInboxFiles(state, baseInboxDir, state.state.inbox.directory);
      return;
    }
    if (key.name === "n" || key.name === "N" || key.name === "escape") {
      state.setState("inbox", "deleteConfirm", null);
    }
    return;
  }

  if (inputMode) {
    if (key.name === "escape") {
      batch(() => {
        state.setState("inbox", "inputMode", null);
        state.setState("inbox", "inputQuery", "");
        state.setState("error", null);
      });
      return;
    }
    if (key.name === "enter") {
      const query = state.state.inbox.inputQuery.trim();
      if (query.length > 0) {
        try {
          const currentSub = state.state.inbox.directory;
          const targetParent = path.join(baseInboxDir, currentSub);
          if (inputMode === "create-folder") {
            await mkdir(path.join(targetParent, query), { recursive: true });
            state.setState("error", `Created folder: ${query}`);
          } else if (inputMode === "rename") {
            const selected = files[cursor];
            if (selected && selected.name !== "..") {
              const oldPath = selected.path;
              const newPath = path.join(path.dirname(oldPath), query);
              await rename(oldPath, newPath);
              state.setState("error", `Renamed to: ${query}`);
            }
          }
        } catch (err: any) {
          state.setState("error", err.message);
        }
      }
      batch(() => {
        state.setState("inbox", "inputMode", null);
        state.setState("inbox", "inputQuery", "");
      });
      void loadInboxFiles(state, baseInboxDir, state.state.inbox.directory);
      return;
    }
    if (key.name === "backspace") {
      state.setState("inbox", "inputQuery", state.state.inbox.inputQuery.slice(0, -1));
      return;
    }
    if (key.name === "space") {
      state.setState("inbox", "inputQuery", state.state.inbox.inputQuery + " ");
      return;
    }
    if (key.name.length === 1 && !key.ctrl && !key.meta) {
      state.setState("inbox", "inputQuery", state.state.inbox.inputQuery + (key.shift ? key.name.toUpperCase() : key.name));
      return;
    }
    return;
  }

  if (isSearchMode) {
    if (key.name === "escape") {
      batch(() => {
        state.setState("inbox", "searchMode", false);
        state.setState("inbox", "searchQuery", "");
        state.setState("inbox", "searchEntries", []);
        state.setState("inbox", "cursor", 0);
        state.setState("inbox", "scrollOffset", 0);
        state.setState("error", null);
      });
      return;
    }
    if (key.name === "enter") {
      state.setState("inbox", "searchMode", false);
      return;
    }
    if (key.name === "backspace") {
      batch(() => {
        state.setState("inbox", "searchQuery", state.state.inbox.searchQuery.slice(0, -1));
        state.setState("inbox", "cursor", 0);
        state.setState("inbox", "scrollOffset", 0);
      });
      return;
    }
    if (key.name === "space") {
      batch(() => {
        state.setState("inbox", "searchQuery", state.state.inbox.searchQuery + " ");
        state.setState("inbox", "cursor", 0);
        state.setState("inbox", "scrollOffset", 0);
      });
      return;
    }
    if (key.name.length === 1 && !key.ctrl && !key.meta) {
      batch(() => {
        state.setState("inbox", "searchQuery", state.state.inbox.searchQuery + key.name);
        state.setState("inbox", "cursor", 0);
        state.setState("inbox", "scrollOffset", 0);
      });
      return;
    }
    return;
  }

  switch (key.name) {
    case "/": {
      batch(() => {
        state.setState("inbox", "searchMode", true);
        state.setState("inbox", "cursor", 0);
        state.setState("inbox", "scrollOffset", 0);
      });
      void loadSearchEntries(state, baseInboxDir);
      return;
    }
    case "n": {
      if (!key.ctrl && !key.meta) {
        batch(() => {
          state.setState("inbox", "inputMode", "create-folder");
          state.setState("inbox", "inputQuery", "");
        });
      }
      return;
    }
    case "r": {
      if (!key.ctrl && !key.meta && files.length > 0) {
        const selected = files[cursor];
        if (selected && selected.name !== "..") {
          batch(() => {
            state.setState("inbox", "inputMode", "rename");
            state.setState("inbox", "inputQuery", selected.name);
          });
        } else {
          state.setState("error", "Cannot rename parent directory link.");
        }
      }
      return;
    }
    case "down":
    case "j": {
      if (cursor < files.length - 1) {
        const next = cursor + 1;
        state.setState("inbox", "cursor", next);
        if (next >= offset + listHeight) {
          state.setState("inbox", "scrollOffset", next - listHeight + 1);
        }
      }
      return;
    }
    case "up":
    case "k": {
      if (cursor > 0) {
        const prev = cursor - 1;
        state.setState("inbox", "cursor", prev);
        if (prev < offset) {
          state.setState("inbox", "scrollOffset", prev);
        }
      }
      return;
    }
    case "pagedown": {
      const next = Math.min(cursor + listHeight, files.length - 1);
      state.setState("inbox", "cursor", next);
      state.setState("inbox", "scrollOffset", Math.min(next, Math.max(0, files.length - listHeight)));
      return;
    }
    case "pageup": {
      const prev = Math.max(cursor - listHeight, 0);
      state.setState("inbox", "cursor", prev);
      state.setState("inbox", "scrollOffset", prev);
      return;
    }
    case "c": {
      if (files.length > 0 && !key.ctrl && !key.meta) {
        const selected = files[cursor];
        if (selected.isAsset || selected.isTableData) {
          try {
            await copyToClipboard(selected.path);
            state.setState("error", selected.isTableData ? "Copied table path to clipboard!" : "Copied asset path to clipboard!");
          } catch (err: any) {
            state.setState("error", err.message);
          }
        } else if (!selected.isDirectory) {
          try {
            const content = await readFile(selected.path, "utf8");
            await copyToClipboard(content);
            state.setState("error", "Copied to clipboard!");
          } catch (err: any) {
            state.setState("error", err.message);
          }
        } else {
          state.setState("error", "Cannot copy a directory.");
        }
      }
      return;
    }
    case "o": {
      if (files.length > 0 && !key.ctrl && !key.meta) {
        const selected = files[cursor];
        if (selected?.isHtmlWorkspace) {
          try {
            const openedPath = await openFileInDefaultBrowser(path.join(selected.path, "prompt.html"));
            state.setState("error", `Opened in browser: ${path.basename(openedPath)}`);
          } catch (err: any) {
            state.setState("error", err.message);
          }
        } else {
          state.setState("error", "Browser open is available for HTML prompt workspaces.");
        }
      }
      return;
    }
    case "d": {
      if (files.length > 0 && !key.ctrl && !key.meta) {
        const selected = files[cursor];
        if (selected.name === "..") {
          state.setState("error", "Cannot delete parent directory link.");
        } else {
          batch(() => {
            state.setState("inbox", "deleteConfirm", selected);
            state.setState("error", null);
          });
        }
      }
      return;
    }
    case "enter": {
      if (files.length === 0) return;
      const selected = files[cursor];
      if (!selected) return;
      if (selected.isHtmlWorkspace) {
        await openEditorFile(state, path.join(selected.path, "prompt.html"), { readOnly: true });
      } else if (selected.isAsset || selected.isTableData) {
        state.setState("error", "Reference files are listed by name. Copy the path or import/attach them from the operating system.");
      } else if (selected.isDirectory) {
        if (selected.name === "..") {
          const current = state.state.inbox.directory;
          const parent = path.dirname(current);
          state.setState("inbox", "directory", parent === "." || current === parent ? "" : parent);
        } else {
          const targetPath = path.join(state.state.inbox.directory, selected.name);
          state.setState("inbox", "directory", targetPath);
        }
        state.setState("inbox", "cursor", 0);
      } else {
        await openEditorFile(state, selected.path);
      }
      return;
    }
    case "ctrl+c":
    case "q":
    case "escape": {
      state.setState("running", false);
      return;
    }
  }
}

async function openEditorFile(state: TuiState, filepath: string, options: { readOnly?: boolean } = {}): Promise<void> {
  try {
    const content = await readFile(filepath, "utf8");
    batch(() => {
      state.setState("editor", "file", filepath);
      state.setState("editor", "content", content);
      state.setState("editor", "cursorLine", 0);
      state.setState("editor", "cursorCol", 0);
      state.setState("editor", "saveState", "clean");
      state.setState("editor", "readOnly", options.readOnly === true);
      state.setState("screen", "editor");
    });
    editorSaveAPI?.resetBaseline();
  } catch (err) {
    state.setState("error", err instanceof Error ? err.message : String(err));
  }
}

// ── Editor ────────────────────────────────────────────────────────────────

async function handleEditorKey(key: KeyEvent, state: TuiState): Promise<void> {
  const filepath = state.state.editor.file;
  if (!filepath || !editorSaveAPI) return;
  const readOnly = state.state.editor.readOnly;

  if (key.name === "escape") {
    if (!readOnly) {
      editorSaveAPI.cancelPending();
      await editorSaveAPI.save(false);
    }
    state.setState("screen", "inbox");
    return;
  }
  if (key.name === "ctrl+c") {
    try {
      await copyToClipboard(state.state.editor.content);
      state.setState("error", "Copied to clipboard!");
    } catch (err: any) {
      state.setState("error", err.message);
    }
    return;
  }
  if (key.name === "o" && readOnly && !key.ctrl && !key.meta) {
    try {
      const openedPath = await openFileInDefaultBrowser(filepath);
      state.setState("error", `Opened in browser: ${path.basename(openedPath)}`);
    } catch (err: any) {
      state.setState("error", err.message);
    }
    return;
  }

  if (readOnly) {
    applyEditorEdit(state, key, { readOnly: true });
    return;
  }

  switch (key.name) {
    case "ctrl+s": {
      editorSaveAPI.cancelPending();
      state.setState("editor", "saveState", "saving");
      await editorSaveAPI.save(true);
      state.setState("error", "Saved.");
      return;
    }
    case "ctrl+r": {
      editorSaveAPI.cancelPending();
      try {
        const latest = await readLatestPromptRevision(filepath);
        if (!latest) {
          state.setState("error", "No revisions saved yet.");
          return;
        }
        batch(() => {
          state.setState("diff", "oldContent", latest.content);
          state.setState("diff", "newContent", state.state.editor.content);
          state.setState("diff", "revisionPath", latest.path);
          state.setState("screen", "diff");
        });
      } catch (err: any) {
        state.setState("error", err.message);
      }
      return;
    }
    case "ctrl+p": {
      editorSaveAPI.cancelPending();
      try {
        const revisions = await listPromptRevisions(filepath);
        batch(() => {
          state.setState("revisions", "files", revisions);
          state.setState("revisions", "cursor", 0);
          state.setState("revisions", "scrollOffset", 0);
          state.setState("screen", "revisions");
        });
      } catch (err: any) {
        state.setState("error", err.message);
      }
      return;
    }
  }

  applyEditorEdit(state, key, { readOnly: false });
}

function applyEditorEdit(state: TuiState, key: KeyEvent, options: { readOnly: boolean }): void {
  const content = state.state.editor.content;
  let lines = content.split('\n');
  let cLine = state.state.editor.cursorLine;
  let cCol = state.state.editor.cursorCol;
  let needsSave = false;
  const readOnly = options.readOnly;

  switch (key.name) {
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
      const listHeight = Math.max(state.state.terminal.rows - EDITOR_BODY_OVERHEAD_ROWS, 5);
      cLine = Math.min(cLine + listHeight, lines.length - 1);
      cCol = Math.min(cCol, (lines[cLine] || "").length);
      break;
    }
    case "pageup": {
      const listHeight = Math.max(state.state.terminal.rows - EDITOR_BODY_OVERHEAD_ROWS, 5);
      cLine = Math.max(cLine - listHeight, 0);
      cCol = Math.min(cCol, (lines[cLine] || "").length);
      break;
    }
    case "ctrl+d": {
      const listHeight = Math.max(Math.floor((state.state.terminal.rows - EDITOR_BODY_OVERHEAD_ROWS) / 2), 1);
      cLine = Math.min(cLine + listHeight, lines.length - 1);
      cCol = Math.min(cCol, (lines[cLine] || "").length);
      break;
    }
    case "ctrl+u": {
      const listHeight = Math.max(Math.floor((state.state.terminal.rows - EDITOR_BODY_OVERHEAD_ROWS) / 2), 1);
      cLine = Math.max(cLine - listHeight, 0);
      cCol = Math.min(cCol, (lines[cLine] || "").length);
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
      if (readOnly) break;
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
      if (readOnly) break;
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
      if (readOnly) break;
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

  batch(() => {
    if (!readOnly) {
      state.setState("editor", "content", lines.join('\n'));
    }
    state.setState("editor", "cursorLine", cLine);
    state.setState("editor", "cursorCol", cCol);
    if (needsSave) {
      state.setState("editor", "saveState", "dirty");
    }
  });
}

// ── Diff ──────────────────────────────────────────────────────────────────

function handleDiffKey(key: KeyEvent, state: TuiState): void {
  if (key.name === "escape" || key.name === "ctrl+r") {
    state.setState("screen", "editor");
  }
}

// ── Revisions ─────────────────────────────────────────────────────────────

async function handleRevisionsKey(key: KeyEvent, state: TuiState): Promise<void> {
  const revisions = state.state.revisions.files;
  const cursor = state.state.revisions.cursor;
  const offset = state.state.revisions.scrollOffset;
  const listHeight = Math.max(state.state.terminal.rows - REVISIONS_LIST_OVERHEAD_ROWS, 5);
  const filepath = state.state.editor.file;

  switch (key.name) {
    case "up":
    case "k": {
      if (cursor > 0) {
        const prev = cursor - 1;
        state.setState("revisions", "cursor", prev);
        if (prev < offset) state.setState("revisions", "scrollOffset", prev);
      }
      return;
    }
    case "down":
    case "j": {
      if (cursor < revisions.length - 1) {
        const next = cursor + 1;
        state.setState("revisions", "cursor", next);
        if (next >= offset + listHeight) state.setState("revisions", "scrollOffset", next - listHeight + 1);
      }
      return;
    }
    case "pageup": {
      const prev = Math.max(cursor - listHeight, 0);
      state.setState("revisions", "cursor", prev);
      state.setState("revisions", "scrollOffset", prev);
      return;
    }
    case "pagedown": {
      const next = Math.min(cursor + listHeight, revisions.length - 1);
      state.setState("revisions", "cursor", next);
      state.setState("revisions", "scrollOffset", Math.min(next, Math.max(0, revisions.length - listHeight)));
      return;
    }
    case "c": {
      if (revisions.length > 0 && !key.ctrl && !key.meta) {
        try {
          await copyToClipboard(revisions[cursor].content);
          state.setState("error", "Revision copied to clipboard!");
        } catch (err: any) {
          state.setState("error", err.message);
        }
      }
      return;
    }
    case "v": {
      if (revisions.length > 0 && !key.ctrl && !key.meta && filepath) {
        await saveRevisionAsVariant(state, filepath, revisions[cursor].content);
      }
      return;
    }
    case "enter": {
      if (revisions.length > 0) {
        const selected = revisions[cursor];
        batch(() => {
          state.setState("revisions", "previewPath", selected.path);
          state.setState("revisions", "previewContent", selected.content);
          state.setState("screen", "revision-preview");
        });
      }
      return;
    }
    case "escape": {
      state.setState("screen", "editor");
      return;
    }
  }
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
      const exists = await stat(newPath).then(() => true).catch(() => false);
      if (!exists) break;
      version++;
    }

    await atomicWriteFile(newPath, content);
    state.setState("error", `Saved variant: ${path.basename(newPath)}`);
  } catch (err: any) {
    state.setState("error", `Failed to save variant: ${err.message}`);
  }
}

// ── Revision preview ──────────────────────────────────────────────────────

async function handleRevisionPreviewKey(key: KeyEvent, state: TuiState): Promise<void> {
  const previewContent = state.state.revisions.previewContent;

  switch (key.name) {
    case "r": {
      if (!key.ctrl && !key.meta) {
        const currentPath = state.state.editor.file;
        const currentContent = state.state.editor.content;
        if (currentPath) {
          await recordPromptRevision(currentPath, currentContent);
        }
        batch(() => {
          state.setState("editor", "content", previewContent);
          state.setState("editor", "cursorLine", 0);
          state.setState("editor", "cursorCol", 0);
          state.setState("editor", "saveState", "dirty");
          state.setState("screen", "editor");
        });
        state.setState("error", "Revision restored into editor.");
      }
      return;
    }
    case "c": {
      if (!key.ctrl && !key.meta) {
        try {
          await copyToClipboard(previewContent);
          state.setState("error", "Revision copied to clipboard.");
        } catch (err: any) {
          state.setState("error", err.message);
        }
      }
      return;
    }
    case "v": {
      if (!key.ctrl && !key.meta) {
        const currentPath = state.state.editor.file;
        if (currentPath) {
          await saveRevisionAsVariant(state, currentPath, previewContent);
        }
      }
      return;
    }
    case "escape": {
      state.setState("screen", "revisions");
      return;
    }
  }
}
