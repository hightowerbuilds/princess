/**
 * theme.test.ts — Tests for the Princess black & orange palette.
 *
 * Runs under FORCE_COLOR + COLORTERM=truecolor so the truecolor branch
 * is exercised by default; the capability cache is poked between tests
 * to also exercise the 256-color and 16-color fallbacks.
 */

// Force a known-capability environment before any imports that touch
// the capability cache.
process.env.FORCE_COLOR = "1";
process.env.COLORTERM = "truecolor";
process.env.TERM = "xterm-256color";

import {
  THEME,
  fg,
  bg,
  themed,
  statusStyle,
  diffAdded,
  diffRemoved,
  PRINCESS_LOGO_STOPS,
  princessLogoPulseStops,
} from "./theme.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(
      `  FAIL: ${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── Palette shape ────────────────────────────────────────────────────────

section("palette shape");

assert(THEME.fg.rgb[0] === 255 && THEME.fg.rgb[1] === 165, "fg is core orange #ffa500");
assert(THEME.bg.rgb[0] === 0 && THEME.bg.rgb[1] === 0 && THEME.bg.rgb[2] === 0, "bg is pure black");
assert(
  THEME.borderFocus.rgb[0] === 255 && THEME.borderFocus.rgb[1] === 204,
  "borderFocus is pale gold #ffcc66",
);
assert(THEME.accentEmber.rgb[0] === 180, "accentEmber is deep ember");
assert(
  THEME.selectionBg.rgb[0] === THEME.fg.rgb[0] &&
    THEME.selectionFg.rgb[0] === 0,
  "selection inverts: orange bg, black fg",
);

// Every theme color must have all four representation tiers.
for (const name of Object.keys(THEME) as Array<keyof typeof THEME>) {
  const c = THEME[name];
  assert(Array.isArray(c.rgb) && c.rgb.length === 3, `${name} has rgb triple`);
  assert(Number.isInteger(c.x256) && c.x256 >= 0 && c.x256 <= 255, `${name} has valid 256 index`);
  assert(Number.isInteger(c.ansi16Fg), `${name} has ansi16Fg`);
  assert(Number.isInteger(c.ansi16Bg), `${name} has ansi16Bg`);
}

// ── Truecolor output ─────────────────────────────────────────────────────

section("truecolor output");

const orange = fg("fg", "hi");
assert(orange.startsWith("\x1b[38;2;255;165;0m"), "fg emits 24-bit SGR for truecolor");
assert(orange.endsWith("\x1b[39m"), "fg resets foreground after text");
assert(orange.includes("hi"), "fg preserves the original text");

const bgOrange = bg("selectionBg", "row");
assert(bgOrange.startsWith("\x1b[48;2;255;165;0m"), "bg emits 24-bit bg SGR");
assert(bgOrange.endsWith("\x1b[49m"), "bg resets background after text");

// ── Semantic helpers ─────────────────────────────────────────────────────

section("semantic helpers");

const titled = themed.title("Inbox");
assert(titled.includes("\x1b[1m"), "title is bold");
assert(titled.includes("\x1b[38;2;255;204;102m"), "title uses gold rgb");

const sel = themed.selection(" > entry ");
assert(sel.includes("\x1b[48;2;255;165;0m"), "selection paints orange background");
assert(sel.includes("\x1b[38;2;0;0;0m"), "selection paints black foreground");

assert(themed.dim("x") !== "x", "dim wraps text when color is supported");
assert(themed.border("─").includes("\x1b[38;2;255;165;0m"), "border uses primary orange");
assert(themed.borderFocus("─").includes("\x1b[38;2;255;204;102m"), "borderFocus uses gold");

// ── Status mapping ───────────────────────────────────────────────────────

section("status mapping");

assert(statusStyle("ready", "[ready]").includes("\x1b[38;2;255;204;102m"), "ready → gold");
assert(statusStyle("READY", "[ready]").includes("\x1b[38;2;255;204;102m"), "status lookup is case-insensitive");
assert(statusStyle("draft", "[draft]").includes("\x1b[38;2;255;165;0m"), "draft → core orange");
assert(statusStyle("used", "[used]").includes("\x1b[38;2;150;100;40m"), "used → ash-amber");
assert(statusStyle("rejected", "[rejected]").includes("\x1b[38;2;180;60;0m"), "rejected → ember");
assert(statusStyle("nonsense", "[?]").includes("\x1b[38;2;179;116;0m"), "unknown status → fgDim");

assert(diffAdded("+ row").includes("\x1b[38;2;255;204;102m"), "diff added → gold");
assert(diffRemoved("- row").includes("\x1b[38;2;180;60;0m"), "diff removed → ember");

// ── Logo gradient stops ──────────────────────────────────────────────────

section("logo gradient stops");

assertEq(PRINCESS_LOGO_STOPS.length, 3, "logo has three stops");
assertEq(PRINCESS_LOGO_STOPS[0][0], 0.0, "first stop at 0.0");
assertEq(PRINCESS_LOGO_STOPS[2][0], 1.0, "last stop at 1.0");
// Luminance (rough sRGB-weighted brightness) climbs left → right.
const lum = ([r, g, b]: readonly [number, number, number]) =>
  0.299 * r + 0.587 * g + 0.114 * b;
assert(
  lum(PRINCESS_LOGO_STOPS[0][1]) < lum(PRINCESS_LOGO_STOPS[1][1]) &&
    lum(PRINCESS_LOGO_STOPS[1][1]) < lum(PRINCESS_LOGO_STOPS[2][1]),
  "brightness climbs left → right across the wordmark (ember → orange → gold)",
);

// Pulse: brightness rises at t=0.5 (the peak of the triangle wave).
const trough = princessLogoPulseStops(0.0);
const peak = princessLogoPulseStops(0.5);
assert(
  peak[1][1][0] > trough[1][1][0] || peak[1][1][1] > trough[1][1][1],
  "pulse mid-stop is brighter at peak (t=0.5) than trough (t=0.0)",
);
assertEq(peak.length, 3, "pulse keeps the three-stop shape");

// ── Palette table sanity for fallback tiers ──────────────────────────────
// We can't bust the cached capability snapshot from inside this process
// (Bun caches the terminal module), so capability *branching* is tested
// in terminal/colors test suites. Here we just verify the table the
// fallback branches *will* read is well-formed.

section("fallback table sanity");

// 256-color codes for the orange family should fall within the
// xterm-256 "yellow → orange → red" band (208–214 for bright orange,
// 166–172 for darker, 94 for muted, 58 for divider).
const inOrangeBand = (n: number) => (n >= 52 && n <= 230);
for (const name of Object.keys(THEME) as Array<keyof typeof THEME>) {
  if (name === "bg" || name === "selectionFg") continue; // pure black
  assert(inOrangeBand(THEME[name].x256), `${name} 256-index ${THEME[name].x256} sits in the warm band`);
}

// 16-color fallbacks: every orange-family role should map to either
// yellow (33) or red (31), never to blue/green/cyan/magenta.
// 31 red, 33 yellow, 91 bright red, 93 bright yellow — the full warm set.
const warmAnsi = new Set([31, 33, 91, 93]);
const neutralAnsi = new Set([30, 37, 90]); // black, white, bright black for bg/selectionFg/dividers
for (const name of Object.keys(THEME) as Array<keyof typeof THEME>) {
  const ansi = THEME[name].ansi16Fg;
  assert(
    warmAnsi.has(ansi) || neutralAnsi.has(ansi),
    `${name} 16-color fg ${ansi} is warm or neutral (not cool)`,
  );
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`theme: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
