import { getCapabilities } from "./terminal.ts";

function sgr(open: string, close: string, text: string): string {
  if (!getCapabilities().supportsColor) return text;
  return `\x1b[${open}m${text}\x1b[${close}m`;
}

export function bold(text: string): string {
  return sgr("1", "22", text);
}

export function dim(text: string): string {
  return sgr("2", "22", text);
}

export function italic(text: string): string {
  return sgr("3", "23", text);
}

export function underline(text: string): string {
  return sgr("4", "24", text);
}

export function strikethrough(text: string): string {
  return sgr("9", "29", text);
}

export function inverse(text: string): string {
  return sgr("7", "27", text);
}

export function green(text: string): string {
  return sgr("32", "39", text);
}

export function red(text: string): string {
  return sgr("31", "39", text);
}

export function yellow(text: string): string {
  return sgr("33", "39", text);
}

export function blue(text: string): string {
  return sgr("34", "39", text);
}

export function cyan(text: string): string {
  return sgr("36", "39", text);
}

export function magenta(text: string): string {
  return sgr("35", "39", text);
}

export function gray(text: string): string {
  return sgr("90", "39", text);
}

export function white(text: string): string {
  return sgr("37", "39", text);
}

export function fg256(color: number, text: string): string {
  if (!getCapabilities().supports256Color) return text;
  return `\x1b[38;5;${color}m${text}\x1b[39m`;
}

export function rgb(r: number, g: number, b: number, text: string): string {
  if (!getCapabilities().supportsTrueColor) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function bgDodgerBlue(text: string): string {
  if (!getCapabilities().supportsTrueColor) return sgr("44", "49", text); // Fallback to blue
  return `\x1b[48;2;30;144;255m${text}\x1b[49m`;
}

export function bgGray(text: string): string {
  if (!getCapabilities().supportsTrueColor) return sgr("100", "49", text);
  return `\x1b[48;2;36;36;36m${text}\x1b[49m`;
}

export function bgCyan(text: string): string {
  return sgr("46", "49", text);
}

export function bgGreen(text: string): string {
  return sgr("42", "49", text);
}

export function bgPink(text: string): string {
  if (!getCapabilities().supportsTrueColor) return sgr("45", "49", text); // Fallback to magenta
  return `\x1b[48;2;255;105;180m${text}\x1b[49m`;
}

export function black(text: string): string {
  return sgr("30", "39", text);
}

export function reset(text: string): string {
  return `\x1b[0m${text}\x1b[0m`;
}
