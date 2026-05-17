export interface TerminalCapabilities {
  isTTY: boolean;
  supportsColor: boolean;
  supports256Color: boolean;
  supportsTrueColor: boolean;
  supportsAlternateScreen: boolean;
  supportsUnicode: boolean;
  columns: number;
  rows: number;
  term: string;
  termProgram: string;
}

const TRUECOLOR_TERMINALS = new Set([
  "iTerm.app",
  "iTerm2",
  "WezTerm",
  "ghostty",
  "Ghostty",
  "Alacritty",
  "alacritty",
  "kitty",
  "vscode",
]);

export function detectCapabilities(): TerminalCapabilities {
  const env = process.env;
  const term = env.TERM ?? "";
  const termProgram = env.TERM_PROGRAM ?? "";
  const colorTerm = env.COLORTERM ?? "";
  const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const noColor = "NO_COLOR" in env;
  const forceColor = "FORCE_COLOR" in env;

  const supportsColor = forceColor || (!noColor && isTTY && term !== "dumb");
  const supports256Color = supportsColor && (term.includes("256color") || colorTerm.length > 0);
  const supportsTrueColor =
    supportsColor &&
    (colorTerm === "truecolor" ||
      colorTerm === "24bit" ||
      TRUECOLOR_TERMINALS.has(termProgram));
  const supportsAlternateScreen = isTTY && term !== "dumb";

  const lang = env.LANG ?? env.LC_ALL ?? "";
  const supportsUnicode = /utf-?8/i.test(lang) || TRUECOLOR_TERMINALS.has(termProgram);

  return {
    isTTY,
    supportsColor,
    supports256Color,
    supportsTrueColor,
    supportsAlternateScreen,
    supportsUnicode,
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
    term,
    termProgram,
  };
}

let capabilities: TerminalCapabilities | null = null;

export function getCapabilities(): TerminalCapabilities {
  if (!capabilities) {
    capabilities = detectCapabilities();
  }
  return capabilities;
}

export function write(data: string): void {
  process.stdout.write(data);
}

export function enterRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
}

export function exitRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

export function enterAlternateScreen(): void {
  write("\x1b[?1049h");
}

export function exitAlternateScreen(): void {
  write("\x1b[?1049l");
}

export function hideCursor(): void {
  write("\x1b[?25l");
}

export function showCursor(): void {
  write("\x1b[?25h");
}

export function enableMouse(): void {
  // ?1000h press/release (used for scroll-wheel page nav)
  // ?1006h SGR extended encoding
  // Intentionally NOT enabling ?1002h (motion-while-button-held). It
  // floods stdin during clicks and drags, none of which we consume —
  // we only react to wheel events. Keeping motion off makes the input
  // stream calm enough that incomplete-sequence handling is robust.
  write("\x1b[?1000h\x1b[?1006h");
}

export function disableMouse(): void {
  // Send the ?1002l reset too, in case a previous run left it on.
  write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
}

export function clearScreen(): void {
  write("\x1b[2J\x1b[H");
}

export function moveCursor(row: number, col: number): void {
  write(`\x1b[${row};${col}H`);
}

export function clearLine(): void {
  write("\x1b[2K");
}

export function onResize(callback: (cols: number, rows: number) => void): () => void {
  const handler = () => {
    capabilities = null;
    callback(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
  };
  process.stdout.on("resize", handler);
  return () => process.stdout.off("resize", handler);
}

let cleanupRegistered = false;

export function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    showCursor();
    disableMouse();
    exitAlternateScreen();
    exitRawMode();
  };

  process.on("exit", cleanup);

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });
}
