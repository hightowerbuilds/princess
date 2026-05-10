import type { TuiState } from "../state.ts";
import { dim, bold, bgGray, white, black, bgPink, cyan, green, yellow } from "../colors.ts";
import path from "node:path";
import { getPaths } from "../../paths.ts";
import { truncateEnd } from "../typeset-compose.ts";
import { box } from "../typeset-compose.ts";
import { dropShadow } from "../aesthetics.ts";

import { gradientText, gradientTextMulti } from "../aesthetics.ts";

function getPulseStops(state: TuiState): Array<[number, [number, number, number]]> {
  const t = state.logoPulse.value();
  const limeGreen: [number, number, number] = [50, 255, 50];
  const blue: [number, number, number] = [0, 120, 255];
  const middle: [number, number, number] = [25, 187, 152]; // Cyan-ish transition

  const lerpColor = (c1: [number, number, number], c2: [number, number, number], p: number): [number, number, number] => [
    Math.round(c1[0] + (c2[0] - c1[0]) * p),
    Math.round(c1[1] + (c2[1] - c1[1]) * p),
    Math.round(c1[2] + (c2[2] - c1[2]) * p),
  ];

  return [
    [0, lerpColor(limeGreen, blue, t)],
    [0.5, middle],
    [1, lerpColor(blue, limeGreen, t)],
  ];
}

function renderLogo(state: TuiState): string[] {
  const stops = getPulseStops(state);
  return [
    "",
    "  " + gradientTextMulti("Princess", stops),
  ];
}

function renderPromptMeta(entry: { prompt?: { metadata: { status?: string; category?: string; updatedAt?: string }; preview?: string } }, cols: number): string {
  const meta = entry.prompt?.metadata;
  if (!meta) return "";

  const chips: string[] = [];
  if (meta.status) {
    const status = meta.status.toLowerCase();
    const statusText = status === "ready" ? green(`[${status}]`) : status === "draft" ? yellow(`[${status}]`) : cyan(`[${status}]`);
    chips.push(statusText);
  }
  if (meta.category) {
    chips.push(dim(`[${meta.category}]`));
  }
  if (meta.updatedAt) {
    chips.push(dim(meta.updatedAt.slice(0, 10)));
  }

  const preview = entry.prompt?.preview ? dim(` ${truncateEnd(entry.prompt.preview, Math.max(0, cols - 32))}`) : "";
  return ` ${chips.join(" ")}${preview}`;
}

export function renderInbox(state: TuiState, cols: number, rows: number): string[] {
  const files = state.inboxFiles();
  const cursor = state.inboxCursor();
  const error = state.error();
  const currentDir = state.currentDirectory();
  const offset = state.inboxScrollOffset();
  const query = state.inboxSearchQuery().trim();
  const searchMode = state.inboxSearchMode();
  
  const lines: string[] = [];
  
  lines.push(...renderLogo(state));
  lines.push("");

  const paths = getPaths();
  const locationLines: string[] = [];
  if (paths.isLocal) {
    locationLines.push(bgPink(black(" PROJECT LOCAL ")) + dim(` /${currentDir || ""}`));
  } else {
    locationLines.push(dim(` /${currentDir || "global"}`));
  }

  const locationCard = box(locationLines, cols - 1, {
    border: "single",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: white,
    contentStyle: (s) => bgGray(white(s))
  });
  lines.push(...dropShadow(locationCard, cols - 1));

  if (error) {
    lines.push(` Error: ${error}`);
    lines.push("");
  }

  // Calculate list height based on remaining space
  // Header logo: ~2 lines
  // Location card: 3 lines + 1 shadow = 4 lines
  // Logo spacing: 1 line
  // Footer: 2 lines
  // Total overhead: ~9 lines
  const overhead = lines.length + 3; // +3 for list card borders and shadow
  const listHeight = Math.max(rows - overhead - 2, 5); 
  const inboxListLines: string[] = [];

  const selected = files[cursor];
  if (selected && !selected.isDirectory && selected.prompt) {
    const status = selected.prompt.metadata.status ? cyan(`[${selected.prompt.metadata.status}]`) : "";
    const category = selected.prompt.metadata.category ? dim(`[${selected.prompt.metadata.category}]`) : "";
    const updatedAt = selected.prompt.metadata.updatedAt ? dim(`updated ${selected.prompt.metadata.updatedAt.slice(0, 10)}`) : "";
    const detailLine = [status, category, updatedAt].filter(Boolean).join(" ");
    if (detailLine) inboxListLines.push(` ${detailLine}`);
    if (selected.prompt.preview) {
      inboxListLines.push(dim(` ${truncateEnd(selected.prompt.preview, Math.max(0, cols - 8))}`));
    }
    inboxListLines.push("");
  } else if (query.length > 0 && files.length === 0) {
    inboxListLines.push(dim(` No matches for "${query}"`));
    inboxListLines.push("");
  }

  if (files.length === 0) {
    inboxListLines.push(" Welcome to Princess.");
    inboxListLines.push(" This inbox is empty, so there is nothing to browse yet.");
    inboxListLines.push(" Create a prompt with `princess create-prompt \"Title\"`.");
    inboxListLines.push(" Press `Ctrl+/` for shortcuts and storage locations.");
  } else {
    const stops = getPulseStops(state);
    for (let i = offset; i < Math.min(files.length, offset + listHeight); i++) {
      const entry = files[i];
      const displayLabel = entry.label ?? entry.name;
      
      let displayString = displayLabel;
      if (entry.isDirectory) {
        if (entry.name !== "..") {
          displayString = gradientTextMulti(displayLabel, stops) + "/";
        } else {
          displayString = displayLabel + "/";
        }
      }

      if (!entry.isDirectory && entry.prompt) {
        displayString += renderPromptMeta(entry, cols - 4); 
      }

      if (i === cursor) {
        let rawText = "";
        if (entry.isDirectory) {
          if (entry.name === "..") {
            rawText = `  ${entry.name} (Up)`;
          } else {
            rawText = `  ${gradientTextMulti(displayLabel, stops)}/`;
          }
        } else {
          rawText = `  ${displayLabel}`;
        }
        
        const detail = !entry.isDirectory && entry.prompt ? renderPromptMeta(entry, cols - 8) : "";
        const padded = truncateEnd(` > ${rawText}${detail}`, Math.max(0, cols - 8));
        inboxListLines.push(bgGray(white(` ${padded.padEnd(cols - 6)}`)));
      } else {
        inboxListLines.push(`   ${truncateEnd(displayString, Math.max(0, cols - 8))}`);
      }
    }
  }

  while (inboxListLines.length < listHeight) {
    inboxListLines.push("");
  }

  const listCard = box(inboxListLines, cols - 1, {
    border: "single",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: white,
    contentStyle: (s) => bgGray(white(s))
  });
  lines.push(...dropShadow(listCard, cols - 1));

  lines.push("");
  const inputMode = state.inboxInputMode();
  const inputQuery = state.inboxInputQuery();
  const deleteConfirm = state.inboxDeleteConfirm();

  if (deleteConfirm) {
    lines.push(yellow(bold(` Delete "${deleteConfirm.name}"? (y/n)`)));
  } else if (inputMode) {
    const label = inputMode === "create-folder" ? "[New Folder]" : "[Rename]";
    lines.push(dim(` ${label}: ${inputQuery || ""}  [Enter] Confirm   [Esc] Cancel `));
  } else if (searchMode) {
    lines.push(dim(` [/] Search: ${query || ""}  [Enter] Apply   [Esc] Cancel   [Ctrl+/] Help `));
  } else if (query.length > 0) {
    lines.push(dim(` [/] Search: ${query}   [Esc] Clear   [Enter] Open   [c] Copy   [d] Delete   [Ctrl+/] Help `));
  } else {
    lines.push(dim(" [/] Search   [n] New Folder   [r] Rename   [Enter] Open   [c] Copy   [d] Delete   [Ctrl+/] Help   [q] Quit "));
  }

  return lines;
}
