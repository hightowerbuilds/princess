import { bold, cyan, dim, gray } from "../colors.ts";
import { centerText, emptyLine, horizontalRule } from "../layout.ts";
import { columns, breakpoint } from "../typeset-compose.ts";
import type { TuiState } from "../state.ts";


const LOGO = [
  "  ├───┐",
  "  │   │",
  "  │   │  ├──   ·   ├──┐   ├──   ├──   ├──   ├──",
  "  │   │  │     │   │  │   │     │     │     │",
  "  ├───┘  │     │   │  │   │     ├──   └──┐  └──┐",
  "  │      │     │   │  │   │     │        │     │",
  "  │      │     │   │  │   │     │        │     │",
  "  │      └──   ┴   └──┘   └──   └──   ──┘   ──┘",
];

export function renderWelcome(state: TuiState, cols: number, rows: number): string[] {
  const lines: string[] = [];
  const repoPath = state.repoPath();
  const engine = state.engine();
  const outputPath = state.outputPath();

  // Top padding
  const topPad = Math.max(2, Math.floor((rows - 20) / 2));
  for (let i = 0; i < topPad; i++) {
    lines.push(emptyLine());
  }

  // Logo
  for (const line of LOGO) {
    lines.push(centerText(cyan(line), cols));
  }

  lines.push(emptyLine());
  lines.push(centerText(dim("repo-to-repo directory renaming tool"), cols));
  lines.push(emptyLine());
  const ruleWidth = breakpoint(cols, { compact: cols - 4, standard: 60, wide: 60 });
  lines.push(centerText(horizontalRule(ruleWidth), cols));
  lines.push(emptyLine());

  // Config summary
  const configLines = [
    columns([{ content: bold("Source:"), minWidth: 12 }, { content: repoPath }], ruleWidth),
    columns([{ content: bold("Output:"), minWidth: 12 }, { content: outputPath }], ruleWidth),
    columns([{ content: bold("Engine:"), minWidth: 12 }, { content: engine }], ruleWidth),
  ];

  for (const line of configLines) {
    lines.push(centerText(line, cols));
  }

  lines.push(emptyLine());
  lines.push(emptyLine());
  lines.push(centerText(gray("Press Enter to begin scanning"), cols));
  lines.push(centerText(gray("Press q to quit"), cols));

  return lines;
}
