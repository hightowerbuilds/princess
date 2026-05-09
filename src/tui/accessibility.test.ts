/**
 * accessibility.test.ts — Tests for accessibility and resilience primitives.
 */
import {
  detectProfile,
  getFallbackChars,
  announceProgress,
  announceListItem,
  announceAction,
  announceScreen,
  highContrastStyle,
  removeDim,
  isReducedMotion,
  REDUCED_MOTION_CONFIG,
  stripAnsi,
  stripAnsiLines,
  formatJsonOutput,
  formatPlainTextProposals,
  checkSizeFloor,
  renderResizeMessage,
  detectColorScheme,
  getAdaptivePalette,
  ADAPTIVE_PALETTES,
} from "./accessibility.ts";
import { stringWidth } from "./typeset.ts";

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

// ── Terminal Profile ─────────────────────────────────────────────────────

section("detectProfile");

{
  // With overrides
  const p = detectProfile({ highContrast: true, reducedMotion: true });
  assertEq(p.highContrast, true, "override highContrast");
  assertEq(p.reducedMotion, true, "override reducedMotion");
}

{
  const p = detectProfile({ color: "none", unicode: "ascii" });
  assertEq(p.color, "none", "override color tier");
  assertEq(p.unicode, "ascii", "override unicode tier");
}

{
  const p = detectProfile();
  assert(["truecolor", "256", "16", "none"].includes(p.color), "valid color tier");
  assert(["full", "basic", "ascii"].includes(p.unicode), "valid unicode tier");
  assert(typeof p.isTTY === "boolean", "isTTY is boolean");
}

// ── Fallback Characters ──────────────────────────────────────────────────

section("getFallbackChars");

{
  const unicode = getFallbackChars(detectProfile({ unicode: "full" }));
  assertEq(unicode.topLeft, "╭", "unicode: rounded corner");
  assertEq(unicode.treeBranch, "├── ", "unicode: tree branch");
  assertEq(unicode.check, "✓", "unicode: check mark");
  assertEq(unicode.sparkBlocks.length, 8, "unicode: 8 spark blocks");
}

{
  const ascii = getFallbackChars(detectProfile({ unicode: "ascii" }));
  assertEq(ascii.topLeft, "+", "ascii: plus corner");
  assertEq(ascii.treeBranch, "|-- ", "ascii: tree branch");
  assertEq(ascii.check, "[x]", "ascii: check mark");
  assertEq(ascii.arrow, "->", "ascii: arrow");
}

// ── Screen Reader Announcements ──────────────────────────────────────────

section("announceProgress / announceListItem / announceAction");

{
  const a = announceProgress("Scanning", 4, 12, "src/components");
  assertEq(a, "Scanning: 4 of 12 — src/components", "progress announcement");
}

{
  const a = announceListItem(3, 15, "src-components", "rename → src--components");
  assert(a.includes("3 of 15"), "list item index");
  assert(a.includes("src-components"), "list item name");
  assert(a.includes("rename"), "list item status");
}

{
  const a = announceAction("Approved", "12 proposals");
  assertEq(a, "Approved: 12 proposals", "action announcement");
}

section("announceScreen");

{
  const a = announceScreen("Review", [
    "\x1b[1mBold header\x1b[22m",
    "  Normal line",
    "",
    "  Another line",
  ]);
  assert(a.includes("--- Review ---"), "screen title");
  assert(a.includes("Bold header"), "ANSI stripped from header");
  assert(!a.includes("\x1b"), "no ANSI codes in output");
  // Empty lines are filtered
  assert(!a.includes("\n\n\n"), "empty lines filtered");
}

// ── High Contrast ────────────────────────────────────────────────────────

section("highContrastStyle");

{
  const p = highContrastStyle("hello", "primary");
  assert(p.includes("hello"), "primary: text preserved");
  // In non-TTY, bold/underline may be no-ops, but function should not error
}

{
  const m = highContrastStyle("hello", "muted");
  assertEq(m, "hello", "muted: text unchanged");
}

section("removeDim");

{
  const result = removeDim("\x1b[2mDim text\x1b[22m");
  assertEq(result, "Dim text", "dim codes removed");
}

{
  const result = removeDim("No dim here");
  assertEq(result, "No dim here", "no dim = unchanged");
}

// ── Reduced Motion ───────────────────────────────────────────────────────

section("reducedMotion");

{
  // isReducedMotion reads env — just verify it returns a boolean
  assert(typeof isReducedMotion() === "boolean", "isReducedMotion returns boolean");
}

{
  assert(REDUCED_MOTION_CONFIG.spring.stiffness > 1000, "spring config is very stiff");
  assertEq(REDUCED_MOTION_CONFIG.tween.duration, 0, "tween duration is 0");
  assertEq(REDUCED_MOTION_CONFIG.stagger.delay, 0, "stagger delay is 0");
}

// ── Piped Output ─────────────────────────────────────────────────────────

section("stripAnsi");

{
  assertEq(stripAnsi("\x1b[1mBold\x1b[22m"), "Bold", "strips bold");
  assertEq(stripAnsi("\x1b[31mRed\x1b[39m"), "Red", "strips color");
  assertEq(stripAnsi("No ANSI"), "No ANSI", "plain text unchanged");
  assertEq(
    stripAnsi("\x1b[38;2;255;100;50mTruecolor\x1b[39m"),
    "Truecolor",
    "strips truecolor",
  );
}

section("stripAnsiLines");

{
  const lines = stripAnsiLines(["\x1b[1mA\x1b[22m", "\x1b[31mB\x1b[39m"]);
  assertEq(lines, ["A", "B"], "strips ANSI from all lines");
}

section("formatJsonOutput");

{
  const json = formatJsonOutput({ name: "test", value: 42 });
  assert(json.includes('"name"'), "JSON has key");
  assert(json.includes("42"), "JSON has value");
  assert(json.includes("\n"), "JSON is pretty-printed");
}

section("formatPlainTextProposals");

{
  const output = formatPlainTextProposals([
    {
      relativePath: "src/components",
      currentName: "components",
      proposedName: "src--components",
      decision: "rename",
      confidence: 0.85,
    },
    {
      relativePath: "src/utils",
      currentName: "utils",
      proposedName: "utils",
      decision: "keep",
      confidence: 0.9,
    },
  ]);
  assert(output.includes("PROPOSALS"), "has header");
  assert(output.includes("RENAME"), "shows rename");
  assert(output.includes("KEEP"), "shows keep");
  assert(output.includes("85%"), "shows confidence");
  assert(output.includes("1 rename / 1 keep"), "shows summary");
}

// ── Size Floor ───────────────────────────────────────────────────────────

section("checkSizeFloor");

{
  const ok = checkSizeFloor(80, 24);
  assertEq(ok.ok, true, "80x24 meets floor");
  assertEq(ok.message.length, 0, "no message when ok");
}

{
  const small = checkSizeFloor(30, 8);
  assertEq(small.ok, false, "30x8 fails floor");
  assert(small.message.length > 0, "has resize message");
}

{
  const custom = checkSizeFloor(50, 15, 60, 20);
  assertEq(custom.ok, false, "50x15 fails custom floor 60x20");
}

section("renderResizeMessage");

{
  const msg = renderResizeMessage(30, 8, 40, 12);
  assert(msg.some((l) => l.includes("too small")), "resize message shows 'too small'");
  assert(msg.some((l) => l.includes("30x8")), "shows current size");
  assert(msg.some((l) => l.includes("40x12")), "shows minimum size");
}

// ── Color Scheme Detection ───────────────────────────────────────────────

section("detectColorScheme");

{
  assertEq(detectColorScheme("light"), "light", "explicit light override");
  assertEq(detectColorScheme("dark"), "dark", "explicit dark override");
  // Without override, depends on env — just verify it returns a valid value
  const auto = detectColorScheme();
  assert(["dark", "light", "unknown"].includes(auto), "auto detection returns valid scheme");
}

section("getAdaptivePalette");

{
  const dark = getAdaptivePalette("dark");
  assert(dark.primary.length === 3, "dark palette has primary RGB");
  assert(dark.error.length === 3, "dark palette has error RGB");

  const light = getAdaptivePalette("light");
  assert(light.primary[0] < dark.primary[0], "light primary is darker than dark primary");
}

{
  // All schemes have the same keys
  const keys = Object.keys(ADAPTIVE_PALETTES.dark);
  for (const scheme of ["light", "unknown"] as const) {
    const schemeKeys = Object.keys(ADAPTIVE_PALETTES[scheme]);
    assertEq(schemeKeys.length, keys.length, `${scheme} has same number of palette entries`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
