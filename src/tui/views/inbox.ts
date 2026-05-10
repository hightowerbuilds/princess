import type { TuiState } from "../state.ts";
import { dim, bgDodgerBlue, black, bgPink, bgGreen } from "../colors.ts";
import path from "node:path";
import { getPaths } from "../../paths.ts";

const LOGO = [
  "PPPP  RRRR  III N   N  CCC  EEEEE  SSS   SSS ",
  "P   P R   R  I  NN  N C   C E     S     S    ",
  "PPPP  RRRR   I  N N N C     EEE    SSS   SSS ",
  "P     R R    I  N  NN C   C E         S     S",
  "P     R  RR III N   N  CCC  EEEEE  SSS   SSS "
];

function renderLogo(): string[] {
  return LOGO.map(line => {
    let coloredLine = " ";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === " ") {
        coloredLine += " "; 
      } else {
        coloredLine += bgDodgerBlue(" ");
      }
    }
    return coloredLine;
  });
}

export function renderInbox(state: TuiState, cols: number, rows: number): string[] {
  const files = state.inboxFiles();
  const cursor = state.inboxCursor();
  const error = state.error();
  const currentDir = state.currentDirectory();
  const offset = state.inboxScrollOffset();
  const listHeight = Math.max(rows - 14, 5);

  const lines: string[] = [];
  
  lines.push(...renderLogo());
  lines.push("");
  const paths = getPaths();
  if (paths.isLocal) {
    lines.push(dim(" ────────────────────────────────────────────── ") + bgPink(black(" PROJECT LOCAL ")));
  } else {
    lines.push(dim(" ──────────────────────────────────────────────"));
  }
  
  if (currentDir) {
    lines.push(dim(` /${currentDir}`));
    lines.push(dim(" ──────────────────────────────────────────────"));
  }
  lines.push("");

  if (error) {
    lines.push(` Error: ${error}`);
    lines.push("");
  }

  if (files.length === 0) {
    lines.push("  (Inbox is empty)");
  } else {
    for (let i = offset; i < Math.min(files.length, offset + listHeight); i++) {
      const entry = files[i];
      let displayString = entry.isDirectory ? `${entry.name}/` : entry.name;

      if (i === cursor) {
        let rawText = entry.isDirectory ? (entry.name === ".." ? `  ${entry.name} (Up)` : `  ${entry.name}/`) : `  ${entry.name}`;
        lines.push(bgDodgerBlue(black(` > ${rawText.padEnd(cols - 3)}`)));
      } else {
        lines.push(`   ${displayString}`);
      }
    }
  }

  // Pad remaining list height
  const renderedCount = Math.min(files.length, offset + listHeight) - offset;
  for (let i = renderedCount; i < listHeight; i++) {
     lines.push("");
  }

  lines.push("");
  lines.push(dim(" [Enter] Open   [PgUp/PgDn] Scroll   [c] Copy   [d] Delete   [q] Quit "));

  // We can wrap it in a box or just return it
  return lines;
}
