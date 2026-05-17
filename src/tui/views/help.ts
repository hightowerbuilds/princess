import path from "node:path";
import type { TuiState } from "../state.ts";
import { themed } from "../theme.ts";
import { panel, truncateEnd } from "../typeset-compose.ts";
import { getPaths } from "../../paths.ts";

function statusLine(label: string, value: string): string {
  return `${themed.dim(label)} ${value}`;
}

export function renderHelp(state: TuiState, cols: number, rows: number): string[] {
  const paths = getPaths();
  const body: string[] = [];
  const screen = state.state.screen;
  const currentFile = state.state.editor.file;
  const currentDir = state.state.inbox.directory;

  const innerHeight = Math.max(rows - 3, 5);

  body.push(themed.dim(" Princess keeps prompts as local Markdown files."));
  body.push("");

  body.push(themed.title(" Navigation"));
  body.push(statusLine(" [Ctrl+/]", "Open this screen from anywhere"));
  body.push(statusLine(" [Esc]", "Close help and return"));
  body.push(statusLine(" [Enter]", "Open or preview the selected item"));
  body.push("");

  body.push(themed.title(" Inbox"));
  body.push(statusLine(" [/] ", "Search prompts by title, metadata, path, or body"));
  body.push(statusLine(" [o]", "Open an HTML workspace in the default browser"));
  body.push(statusLine(" [c]", "Copy a prompt file"));
  body.push(statusLine(" [d]", "Delete a prompt file"));
  body.push(statusLine(" [q]", "Quit from the inbox"));
  body.push("");

  body.push(themed.title(" Editor"));
  body.push(statusLine(" [Ctrl+S]", "Save the current prompt"));
  body.push(statusLine(" [Ctrl+R]", "Open the latest diff"));
  body.push(statusLine(" [Ctrl+P]", "Browse and restore revisions"));
  body.push(statusLine(" [Ctrl+C]", "Copy the current buffer"));
  body.push(statusLine(" [o]", "Open read-only HTML in the default browser"));
  body.push("");

  body.push(themed.title(" Revisions"));
  body.push(statusLine(" [Enter]", "Preview a saved revision"));
  body.push(statusLine(" [r]", "Restore the previewed revision into the editor"));
  body.push(statusLine(" [v]", "Save a revision as a new file (Variant)"));
  body.push(statusLine(" [c]", "Copy a revision snapshot"));
  body.push("");

  body.push(themed.title(" Trust"));
  body.push(statusLine(" Inbox", truncateEnd(paths.inboxDir, Math.max(0, cols - 16))));
  body.push(statusLine(" Config", truncateEnd(paths.configDir, Math.max(0, cols - 16))));
  body.push(statusLine(" Data", truncateEnd(paths.dataDir, Math.max(0, cols - 16))));
  body.push(statusLine(" Agent", truncateEnd(paths.agentFile, Math.max(0, cols - 16))));
  body.push(statusLine(" Mode", screen === "help" ? "Help" : screen));
  body.push(statusLine(" File", currentFile ?? "None open"));
  body.push(statusLine(" Folder", currentDir ? path.join(paths.inboxDir, currentDir) : paths.inboxDir));

  while (body.length < innerHeight) body.push("");

  return panel(body, cols, {
    border: "rounded",
    title: "Help & Status",
    hotkeys: "esc back · ↵ close · ctrl+/ toggle",
    borderColor: themed.border,
    borderFocusColor: themed.borderFocus,
    focused: true,
    titleStyle: themed.title,
    hotkeyStyle: themed.dim,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  });
}
