const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function truncate(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  const stripped = stripAnsi(text);
  if (stripped.length <= maxWidth) return text;

  let visible = 0;
  let result = "";
  let inEscape = false;
  const ellipsis = maxWidth >= 4 ? "..." : "";
  const targetLength = maxWidth - ellipsis.length;

  for (const char of text) {
    if (char === "\x1b") {
      inEscape = true;
      result += char;
      continue;
    }

    if (inEscape) {
      result += char;
      if (/[a-zA-Z]/.test(char)) {
        inEscape = false;
      }
      continue;
    }

    if (visible >= targetLength) break;
    result += char;
    visible += 1;
  }

  return result + ellipsis;
}

export function padRight(text: string, width: number): string {
  const visLen = visibleLength(text);
  if (visLen >= width) return text;
  return text + " ".repeat(width - visLen);
}

export function padLeft(text: string, width: number): string {
  const visLen = visibleLength(text);
  if (visLen >= width) return text;
  return " ".repeat(width - visLen) + text;
}

export function centerText(text: string, width: number): string {
  const visLen = visibleLength(text);
  if (visLen >= width) return text;
  const leftPad = Math.floor((width - visLen) / 2);
  const rightPad = width - visLen - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

export function horizontalRule(width: number, char = "\u2500"): string {
  return char.repeat(width);
}

export function horizontalRuleAscii(width: number): string {
  return "-".repeat(width);
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (currentLine.length + 1 + word.length <= width) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

export function progressBar(current: number, total: number, width: number): string {
  if (width < 5 || total <= 0) return "";
  const innerWidth = width - 2;
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(innerWidth * ratio);
  const empty = innerWidth - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

export function progressBarAscii(current: number, total: number, width: number): string {
  if (width < 5 || total <= 0) return "";
  const innerWidth = width - 2;
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(innerWidth * ratio);
  const empty = innerWidth - filled;
  return `[${"#".repeat(filled)}${".".repeat(empty)}]`;
}

export function emptyLine(): string {
  return "";
}

export function indent(text: string, spaces: number): string {
  return " ".repeat(spaces) + text;
}

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const SPINNER_FRAMES_ASCII = ["|", "/", "-", "\\"];

export function spinnerFrame(tick: number, ascii = false): string {
  const frames = ascii ? SPINNER_FRAMES_ASCII : SPINNER_FRAMES;
  return frames[tick % frames.length];
}

export const CHECK_MARK = "✔";
export const CROSS_MARK = "✘";
export const ARROW_RIGHT = "→";
export const BULLET = "•";

export const CHECK_MARK_ASCII = "+";
export const CROSS_MARK_ASCII = "x";
export const ARROW_RIGHT_ASCII = "->";
export const BULLET_ASCII = "*";
