import { bold, cyan, dim, gray } from "../colors.ts";
import { centerText, emptyLine, horizontalRule } from "../layout.ts";
import { columns, breakpoint } from "../typeset-compose.ts";
import type { TuiState } from "../state.ts";

const LOGO = [
  "  ____       _",
  " |  _ \\ _ __(_)_ __   ___ ___  ___ ___",
  " | |_) | '__| | '_ \\ / __/ _ \\/ __/ __|",
  " |  __/| |  | | | | | (_|  __/\\__ \\__ \\",
  " |_|   |_|  |_|_| |_|\\___\\___||___/___/",
];

// Total segments for typewriter: 5 logo + 1 subtitle + 1 rule + 3 config
const WELCOME_SEGMENTS = 8;

export function renderWelcome(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const repoPath = state.repoPath();
  const engine = state.engine();
  const outputPath = state.outputPath();
  const tw = state.welcomeTypewriter;

  // Top padding
  const topPad = Math.max(2, Math.floor((rows - 16) / 2));
  for (let i = 0; i < topPad; i++) {
    lines.push(emptyLine());
  }

  // Logo — segments 0-4
  for (let i = 0; i < LOGO.length; i++) {
    const opacity = tw.opacity(i);
    if (opacity <= 0) {
      lines.push(emptyLine());
    } else {
      const styled = opacity < 1 ? dim(cyan(LOGO[i])) : cyan(LOGO[i]);
      lines.push(centerText(styled, cols));
    }
  }

  // Subtitle — segment 5
  lines.push(emptyLine());
  const subtitleOpacity = tw.opacity(5);
  if (subtitleOpacity <= 0) {
    lines.push(emptyLine());
  } else {
    const subtitle = subtitleOpacity < 1
      ? dim(dim("repo-to-repo directory renaming tool"))
      : dim("repo-to-repo directory renaming tool");
    lines.push(centerText(subtitle, cols));
  }

  lines.push(emptyLine());
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 60, wide: 60 });

  // Rule — segment 6
  const ruleOpacity = tw.opacity(6);
  if (ruleOpacity <= 0) {
    lines.push(emptyLine());
  } else {
    lines.push(centerText(horizontalRule(ruleWidth), cols));
  }

  lines.push(emptyLine());

  // Config summary — segment 7
  const configOpacity = tw.opacity(7);
  const configLines = [
    columns([{ content: bold("Source:"), minWidth: 12 }, { content: repoPath }], ruleWidth),
    columns([{ content: bold("Output:"), minWidth: 12 }, { content: outputPath }], ruleWidth),
    columns([{ content: bold("Engine:"), minWidth: 12 }, { content: engine }], ruleWidth),
  ];

  for (const line of configLines) {
    if (configOpacity <= 0) {
      lines.push(emptyLine());
    } else {
      const styled = configOpacity < 1 ? dim(line) : line;
      lines.push(centerText(styled, cols));
    }
  }

  lines.push(emptyLine());
  lines.push(emptyLine());

  // Hints — always visible after config appears
  if (configOpacity > 0) {
    lines.push(centerText(gray("Press Enter to begin scanning"), cols));
    lines.push(centerText(gray("Press q to quit"), cols));
  } else {
    lines.push(emptyLine());
    lines.push(emptyLine());
  }

  return lines;
}
