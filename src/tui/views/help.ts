import path from "node:path";
import type { TuiState } from "../state.ts";
import { bgGray, white, black, cyan, dim, green, yellow } from "../colors.ts";
import { truncateEnd } from "../typeset-compose.ts";
import { getPaths } from "../../paths.ts";

function statusLine(label: string, value: string): string {
  return `${dim(label)} ${value}`;
}

export function renderHelp(state: TuiState, cols: number, rows: number): string[] {
  const paths = getPaths();
  const lines: string[] = [];
  const screen = state.state.screen;
  const currentFile = state.state.editor.file;
  const currentDir = state.state.inbox.directory;

  lines.push(bgGray(white(` Help & Status ${"".padEnd(Math.max(0, cols - 15))} `)));
  lines.push(dim(" Princess keeps prompts as local Markdown files. Press Esc to return."));
  lines.push("");

  lines.push(green(" Navigation"));
  lines.push(statusLine(" [Ctrl+/]", "Open this screen from anywhere"));
  lines.push(statusLine(" [Esc]", "Close help and return"));
  lines.push(statusLine(" [Enter]", "Open or preview the selected item"));
  lines.push("");

  lines.push(yellow(" Inbox"));
  lines.push(statusLine(" [/] ", "Search prompts by title, metadata, path, or body"));
  lines.push(statusLine(" [c]", "Copy a prompt file"));
  lines.push(statusLine(" [d]", "Delete a prompt file"));
  lines.push(statusLine(" [q]", "Quit from the inbox"));
  lines.push("");

  lines.push(cyan(" Editor"));
  lines.push(statusLine(" [Ctrl+S]", "Save the current prompt"));
  lines.push(statusLine(" [Ctrl+R]", "Open the latest diff"));
  lines.push(statusLine(" [Ctrl+P]", "Browse and restore revisions"));
  lines.push(statusLine(" [Ctrl+C]", "Copy the current buffer"));
  lines.push("");

  lines.push(green(" Revisions"));
  lines.push(statusLine(" [Enter]", "Preview a saved revision"));
  lines.push(statusLine(" [r]", "Restore the previewed revision into the editor"));
  lines.push(statusLine(" [v]", "Save a revision as a new file (Variant)"));
  lines.push(statusLine(" [c]", "Copy a revision snapshot"));
  lines.push("");

  lines.push(yellow(" Trust"));
  lines.push(statusLine(" Inbox", truncateEnd(paths.inboxDir, Math.max(0, cols - 12))));
  lines.push(statusLine(" Config", truncateEnd(paths.configDir, Math.max(0, cols - 12))));
  lines.push(statusLine(" Data", truncateEnd(paths.dataDir, Math.max(0, cols - 12))));
  lines.push(statusLine(" Agent", truncateEnd(paths.agentFile, Math.max(0, cols - 12))));
  lines.push(statusLine(" Mode", screen === "help" ? "Help" : screen));
  lines.push(statusLine(" File", currentFile ?? "None open"));
  lines.push(statusLine(" Folder", currentDir ? path.join(paths.inboxDir, currentDir) : paths.inboxDir));
  lines.push("");

  lines.push(dim(" [Esc] Back to where you were  [Enter] Close  [Ctrl+/] Toggle "));

  while (lines.length < rows - 2) {
    lines.push("");
  }

  return lines;
}
