/**
 * typeset.test.ts — Verification tests for the typesetting engine.
 */
import {
  charWidth,
  stringWidth,
  prepare,
  layout,
  materialize,
  materializeToStrings,
  measureLineStats,
  measureNaturalWidth,
  walkLineRanges,
  layoutNextLineRange,
  advancePastNewline,
  prepareRichInline,
  balancedWidth,
} from "./typeset.ts";
import {
  truncatePath,
  truncateEnd,
  columns,
  justifyLine,
  justifiedLayout,
  box,
  hangingIndent,
  breakpoint,
  breakpointName,
  findHyphenationPoints,
  hyphenateWord,
  optimalBreaks,
  layoutOptimal,
} from "./typeset-compose.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── charWidth ────────────────────────────────────────────────────────────

section("charWidth");

assertEq(charWidth(0x41), 1, "Latin 'A' is width 1");
assertEq(charWidth(0x20), 1, "space is width 1");
assertEq(charWidth(0x4e2d), 2, "CJK '中' is width 2");
assertEq(charWidth(0x3042), 2, "Hiragana 'あ' is width 2");
assertEq(charWidth(0xac00), 2, "Hangul '가' is width 2");
assertEq(charWidth(0xff01), 2, "Fullwidth '！' is width 2");
assertEq(charWidth(0x0a), 0, "newline is width 0");
assertEq(charWidth(0x1b), 0, "escape is width 0");
assertEq(charWidth(0x200b), 0, "ZWS is width 0");
assertEq(charWidth(0x0300), 0, "combining diacritical is width 0");

// ── stringWidth ──────────────────────────────────────────────────────────

section("stringWidth");

assertEq(stringWidth("hello"), 5, "plain ASCII");
assertEq(stringWidth(""), 0, "empty string");
assertEq(stringWidth("\x1b[1mhello\x1b[22m"), 5, "bold ANSI wrapping");
assertEq(stringWidth("\x1b[31m\x1b[1mhi\x1b[22m\x1b[39m"), 2, "nested ANSI");
assertEq(stringWidth("中文"), 4, "CJK characters");
assertEq(stringWidth("hello中文"), 9, "mixed ASCII and CJK");

// ── prepare ──────────────────────────────────────────────────────────────

section("prepare (segmentation)");

{
  const p = prepare("hello world");
  assertEq(p.segments.length, 3, "2 words + 1 space = 3 segments");
  assertEq(p.segments[0].kind, "word", "first segment is word");
  assertEq(p.segments[0].text, "hello", "first word text");
  assertEq(p.segments[0].width, 5, "first word width");
  assertEq(p.segments[1].kind, "space", "second segment is space");
  assertEq(p.segments[1].width, 1, "collapsed space width");
  assertEq(p.segments[2].kind, "word", "third segment is word");
  assertEq(p.naturalWidth, 11, "natural width");
}

{
  const p = prepare("  hello   world  ");
  assertEq(p.segments.length, 3, "whitespace collapsed: 3 segments");
  assertEq(p.segments[0].kind, "word", "leading space trimmed");
  assertEq(p.segments[0].text, "hello", "first word after trim");
}

{
  const p = prepare("hello\nworld");
  assertEq(p.segments.length, 3, "newline produces 3 segments");
  assertEq(p.segments[1].kind, "newline", "middle segment is newline");
  assertEq(p.naturalWidth, 5, "natural width = longest forced line");
}

{
  const p = prepare("\x1b[1mhello\x1b[22m world");
  assertEq(p.segments.length, 5, "ANSI + word + ANSI + space + word = 5");
  assertEq(p.segments[0].kind, "ansi", "ANSI open");
  assertEq(p.segments[0].width, 0, "ANSI has zero width");
  assertEq(p.segments[1].kind, "word", "word after ANSI");
  assertEq(p.segments[2].kind, "ansi", "ANSI close");
  assertEq(p.naturalWidth, 11, "ANSI doesn't affect natural width");
}

{
  const p = prepare("  hello   world  ", { whiteSpace: "pre-wrap" });
  assert(p.segments.length > 3, "pre-wrap preserves whitespace (more segments)");
  assertEq(p.segments[0].kind, "space", "pre-wrap keeps leading space");
}

// ── layout (basic wrapping) ──────────────────────────────────────────────

section("layout (basic wrapping)");

{
  const p = prepare("hello world");
  const r = layout(p, 80);
  assertEq(r.lineCount, 1, "fits on one line");
  assertEq(r.maxLineWidth, 11, "full width used");
}

{
  const p = prepare("hello world");
  const r = layout(p, 5);
  assertEq(r.lineCount, 2, "wraps into 2 lines");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "hello", "line 1: hello");
  assertEq(lines[1], "world", "line 2: world");
}

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const r = layout(p, 15);
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "The quick brown", "line 1 fills exactly");
  assertEq(r.lines[0].width, 15, "line 1 width = 15");
  assert(r.lineCount >= 3, "wraps into 3+ lines");
}

{
  const p = prepare("short");
  const r = layout(p, 100);
  assertEq(r.lineCount, 1, "short text = 1 line");
  assertEq(r.maxLineWidth, 5, "width matches text");
}

// ── layout (hard breaks) ─────────────────────────────────────────────────

section("layout (hard breaks)");

{
  const p = prepare("hello\nworld");
  const r = layout(p, 80);
  assertEq(r.lineCount, 2, "newline splits into 2 lines");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "hello", "line 1");
  assertEq(lines[1], "world", "line 2");
}

{
  const p = prepare("a\n\nb");
  const r = layout(p, 80);
  assertEq(r.lineCount, 3, "double newline = 3 lines");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "a", "line 1");
  assertEq(lines[1], "", "line 2 (empty)");
  assertEq(lines[2], "b", "line 3");
}

{
  const p = prepare("hello\n");
  const r = layout(p, 80);
  assertEq(r.lineCount, 2, "trailing newline = 2 lines");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "hello", "line 1");
  assertEq(lines[1], "", "line 2 (empty)");
}

// ── layout (overflow) ────────────────────────────────────────────────────

section("layout (overflow)");

{
  const p = prepare("superlongword here");
  const r = layout(p, 5);
  assertEq(r.lineCount, 2, "overflow word gets its own line");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "superlongword", "overflow word not split");
  assertEq(lines[1], "here", "next word on new line");
}

{
  const p = prepare("superlongword");
  const r = layout(p, 5);
  assertEq(r.lineCount, 1, "single overflow word = 1 line");
  assertEq(r.maxLineWidth, 13, "width exceeds maxWidth (overflow)");
}

// ── layout (ANSI) ────────────────────────────────────────────────────────

section("layout (ANSI)");

{
  const p = prepare("\x1b[1mhello\x1b[22m \x1b[2mworld\x1b[22m");
  const r = layout(p, 80);
  assertEq(r.lineCount, 1, "ANSI text on one line");
  assertEq(r.maxLineWidth, 11, "ANSI doesn't count toward width");
}

{
  const p = prepare("\x1b[1mhello\x1b[22m \x1b[2mworld\x1b[22m");
  const r = layout(p, 5);
  assertEq(r.lineCount, 2, "ANSI text wraps correctly");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "\x1b[1mhello\x1b[22m", "line 1 keeps ANSI");
  assertEq(lines[1], "\x1b[2mworld\x1b[22m", "line 2 keeps ANSI");
}

// ── layout (empty / edge cases) ──────────────────────────────────────────

section("layout (edge cases)");

{
  const p = prepare("");
  const r = layout(p, 80);
  assertEq(r.lineCount, 1, "empty text = 1 line");
  assertEq(r.maxLineWidth, 0, "empty text = 0 width");
}

{
  const p = prepare("\n");
  const r = layout(p, 80);
  assertEq(r.lineCount, 2, "single newline = 2 lines");
}

{
  const p = prepare("\n\n\n");
  const r = layout(p, 80);
  assertEq(r.lineCount, 4, "three newlines = 4 lines");
}

// ── measureLineStats ─────────────────────────────────────────────────────

section("measureLineStats");

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const stats = measureLineStats(p, 15);
  assert(stats.lineCount >= 3, "reports correct line count");
  assert(stats.maxLineWidth <= 15, "max width within bounds");
}

// ── walkLineRanges ───────────────────────────────────────────────────────

section("walkLineRanges");

{
  const p = prepare("hello world foo");
  const widths: number[] = [];
  const count = walkLineRanges(p, 6, (range) => {
    widths.push(range.width);
  });
  assertEq(count, 3, "3 lines at width 6");
  assertEq(widths.length, 3, "callback called 3 times");
}

// ── layoutNextLineRange (variable-width) ─────────────────────────────────

section("layoutNextLineRange (variable-width)");

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const lines: string[] = [];
  let pos = { segmentIndex: 0, charOffset: 0 };

  while (true) {
    // Alternate between narrow and wide lines
    const width = lines.length % 2 === 0 ? 10 : 20;
    const range = layoutNextLineRange(p, pos, width);
    if (!range) break;
    lines.push(materialize(p, range).text);
    pos = advancePastNewline(p, range.end);
  }

  assert(lines.length >= 3, "variable-width produces multiple lines");
  // Narrow lines should be shorter than wide lines
  assert(
    stringWidth(lines[0]) <= 10,
    "narrow line respects width constraint",
  );
}

// ── prepareRichInline ────────────────────────────────────────────────────

section("prepareRichInline");

{
  const p = prepareRichInline([
    { text: "Hello", ansiOpen: "\x1b[1m", ansiClose: "\x1b[22m" },
    { text: " ", ansiOpen: "", ansiClose: "" },
    { text: "world", ansiOpen: "\x1b[2m", ansiClose: "\x1b[22m" },
  ]);
  assertEq(p.naturalWidth, 11, "rich inline natural width");
  const r = layout(p, 5);
  assertEq(r.lineCount, 2, "rich inline wraps correctly");
}

// ── balancedWidth ────────────────────────────────────────────────────────

section("balancedWidth");

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const balanced = balancedWidth(p, 80);
  const unbalanced = measureLineStats(p, 80);
  // At width 80 it's one line, so balanced = natural width
  assertEq(unbalanced.lineCount, 1, "one line at 80");
  assertEq(balanced, p.naturalWidth, "balanced = natural when 1 line");
}

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const balanced = balancedWidth(p, 25);
  const statsBalanced = measureLineStats(p, balanced);
  const statsMax = measureLineStats(p, 25);
  assertEq(
    statsBalanced.lineCount,
    statsMax.lineCount,
    "balanced width preserves line count",
  );
  assert(balanced <= 25, "balanced width <= maxWidth");
}

// ── pre whitespace mode ──────────────────────────────────────────────────

section("pre whitespace mode");

{
  const p = prepare("hello   world", { whiteSpace: "pre" });
  const r = layout(p, 5);
  // In pre mode, no wrapping — just hard breaks
  assertEq(r.lineCount, 1, "pre mode doesn't wrap");
  const lines = materializeToStrings(p, r);
  assert(lines[0].includes("   "), "pre mode preserves spaces");
}

{
  const p = prepare("line1\nline2\nline3", { whiteSpace: "pre" });
  const r = layout(p, 80);
  assertEq(r.lineCount, 3, "pre mode splits on newlines");
}

// ── CJK / double-width ──────────────────────────────────────────────────

section("CJK / double-width");

{
  const p = prepare("中文测试");
  assertEq(p.naturalWidth, 8, "4 CJK chars = 8 columns");
  const r = layout(p, 6);
  // "中文测" would be 6 columns, but it's one word segment, so no break
  assertEq(r.lineCount, 1, "CJK word doesn't break (normal mode)");
}

{
  const p = prepare("hello 中文");
  const r = layout(p, 8);
  assertEq(r.lineCount, 2, "mixed ASCII/CJK wraps at space");
  const lines = materializeToStrings(p, r);
  assertEq(lines[0], "hello", "ASCII on line 1");
  assertEq(lines[1], "中文", "CJK on line 2");
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 1: Composition Utilities
// ══════════════════════════════════════════════════════════════════════════

// ── truncatePath ─────────────────────────────────────────────────────────

section("truncatePath");

{
  const short = "src/components";
  assertEq(truncatePath(short, 30), short, "short path unchanged");
}

{
  const long = "src/components/ui/buttons/PrimaryButton.tsx";
  const result = truncatePath(long, 30);
  assert(stringWidth(result) <= 30, "truncated path fits in width");
  assert(result.startsWith("src/"), "preserves first segment");
  assert(result.endsWith("PrimaryButton.tsx"), "preserves last segment");
  assert(result.includes("..."), "contains ellipsis");
}

{
  const path = "/Users/luke/Desktop/websites/princess/src";
  const result = truncatePath(path, 25);
  assert(stringWidth(result) <= 25, "absolute path truncated to fit");
  assert(result.includes("..."), "contains ellipsis");
  assert(result.endsWith("src"), "preserves last segment");
}

{
  // Very tight — can't even fit first/last
  const result = truncatePath("a/b/c/d/e/f/g/h", 8);
  assert(stringWidth(result) <= 8, "very tight truncation fits");
}

{
  // Single segment — no slashes, falls back to end truncation
  const single = truncatePath("verylongfilename.txt", 10);
  assert(stringWidth(single) <= 10, "single segment truncated to fit");
  assert(single.includes("..."), "single segment uses ellipsis");
}

// ── truncateEnd ──────────────────────────────────────────────────────────

section("truncateEnd");

{
  assertEq(truncateEnd("hello", 10), "hello", "short text unchanged");
  assertEq(truncateEnd("hello world", 8), "hello...", "basic truncation");
  assertEq(truncateEnd("", 5), "", "empty string");
  assertEq(truncateEnd("hi", 0), "", "zero width");
}

{
  const ansi = "\x1b[1mhello world\x1b[22m";
  const result = truncateEnd(ansi, 8);
  assert(stringWidth(result) <= 8, "ANSI-aware truncation respects visual width");
}

// ── columns ──────────────────────────────────────────────────────────────

section("columns");

{
  const result = columns([
    { content: "Name:", minWidth: 8 },
    { content: "value", flex: 1 },
  ], 30);
  assertEq(stringWidth(result), 30, "columns fill total width");
  assert(result.startsWith("Name:   "), "fixed column padded");
}

{
  const result = columns([
    { content: "Left", align: "left" },
    { content: "Right", align: "right", flex: 1 },
  ], 20);
  assertEq(stringWidth(result), 20, "mixed alignment fills width");
}

{
  const result = columns([
    { content: "Source:", minWidth: 12, align: "right" },
    { content: "/very/long/path/that/exceeds", flex: 1, truncate: true },
  ], 30);
  assertEq(stringWidth(result), 30, "truncated flex column fits");
}

{
  const result = columns([
    { content: "A" },
    { content: "B" },
    { content: "C" },
  ], 20, 2);
  assert(result.includes("A"), "gap columns include content");
  assert(result.includes("B"), "gap columns include all items");
}

// ── justifyLine ──────────────────────────────────────────────────────────

section("justifyLine");

{
  const result = justifyLine("hello world foo", 20);
  assertEq(stringWidth(result), 20, "justified line fills target width");
  assert(result.startsWith("hello"), "starts with first word");
  assert(result.endsWith("foo"), "ends with last word");
}

{
  // Short line should not be justified
  const result = justifyLine("hi", 40);
  assertEq(result, "hi", "short line not justified (below minFill)");
}

{
  // Single word — no gaps to distribute
  const result = justifyLine("word", 10);
  assertEq(result, "word", "single word not justified");
}

{
  // Already full — no change
  const result = justifyLine("exact", 5);
  assertEq(result, "exact", "exact-fit line unchanged");
}

// ── justifiedLayout ──────────────────────────────────────────────────────

section("justifiedLayout");

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const lines = justifiedLayout(p, 20);
  assert(lines.length >= 2, "justified layout produces multiple lines");

  // All lines except the last should be fully justified
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== "") {
      assertEq(
        stringWidth(lines[i]),
        20,
        `justified line ${i} fills width`,
      );
    }
  }

  // Last line should NOT be fully justified (left-aligned)
  const lastLine = lines[lines.length - 1];
  assert(
    stringWidth(lastLine) <= 20,
    "last line not forcefully justified",
  );
}

// ── box ──────────────────────────────────────────────────────────────────

section("box");

{
  const result = box(["Hello", "World"], 20, { border: "single" });
  assert(result.length >= 4, "bordered box has >= 4 lines (top/bottom border + 2 content)");
  assert(result[0].includes("\u250c"), "top border has top-left corner");
  assert(result[0].includes("\u2510"), "top border has top-right corner");
  assert(result[result.length - 1].includes("\u2514"), "bottom border has bottom-left corner");
}

{
  const result = box(["Hello"], 20, { border: "rounded" });
  assert(result[0].includes("\u256d"), "rounded top-left corner");
  assert(result[result.length - 1].includes("\u256f"), "rounded bottom-right corner");
}

{
  const result = box(["Test"], 30, {
    border: "single",
    padding: 1,
  });
  // Should have: top border, padding line, content line, padding line, bottom border
  assert(result.length >= 5, "padded box has padding lines");
}

{
  const result = box(["Content"], 40, {
    border: "none",
    padding: { left: 2, right: 2 },
  });
  assert(result[0].startsWith("  "), "no-border box respects left padding");
}

{
  const result = box(["Centered"], 40, {
    border: "single",
    maxWidth: 15,
    align: "center",
  });
  // The box should be narrower than 40 and centered
  assert(result[0].includes(" \u250c"), "centered box has leading space before border");
}

{
  const result = box(["A", "B"], 20, {
    border: "double",
  });
  assert(result[0].includes("\u2554"), "double border top-left");
  assert(result[0].includes("\u2550"), "double border horizontal");
}

{
  const result = box(["Heavy"], 20, {
    border: "heavy",
  });
  assert(result[0].includes("\u250f"), "heavy border top-left");
}

// ── hangingIndent ────────────────────────────────────────────────────────

section("hangingIndent");

{
  const result = hangingIndent("short text", 40, 4);
  assertEq(result.length, 1, "short text = 1 line");
  assertEq(result[0], "short text", "no indent on single line");
}

{
  const result = hangingIndent(
    "This is a much longer text that definitely needs to wrap across multiple lines",
    25,
    4,
  );
  assert(result.length >= 3, "long text wraps to multiple lines");
  assert(!result[0].startsWith("    "), "first line has no indent");
  assert(result[1].startsWith("    "), "continuation line is indented");
  assert(result[2].startsWith("    "), "third line is indented");
  assert(stringWidth(result[0]) <= 25, "first line within width");
  assert(stringWidth(result[1]) <= 25, "continuation line within width");
}

// ── breakpoint ───────────────────────────────────────────────────────────

section("breakpoint");

{
  assertEq(breakpointName(40), "compact", "40 cols = compact");
  assertEq(breakpointName(80), "standard", "80 cols = standard");
  assertEq(breakpointName(150), "wide", "150 cols = wide");
  assertEq(breakpointName(59), "compact", "59 = compact boundary");
  assertEq(breakpointName(60), "standard", "60 = standard boundary");
  assertEq(breakpointName(119), "standard", "119 = standard boundary");
  assertEq(breakpointName(120), "wide", "120 = wide boundary");
}

{
  const value = breakpoint(80, {
    compact: "small",
    standard: "medium",
    wide: "large",
  });
  assertEq(value, "medium", "breakpoint selects correct value");
}

// ── Soft Hyphenation ─────────────────────────────────────────────────────

section("findHyphenationPoints");

{
  const points = findHyphenationPoints("components");
  assert(points.length > 0, "components has hyphenation points");
  assert(points.every(p => p >= 2 && p <= 8), "all points within valid range");
}

{
  assertEq(findHyphenationPoints("hi"), [], "short word has no points");
  assertEq(findHyphenationPoints("the"), [], "3-letter word has no points");
  assertEq(findHyphenationPoints("a"), [], "single char has no points");
}

{
  const points = findHyphenationPoints("application");
  assert(points.length > 0, "application has hyphenation points");
}

section("hyphenateWord");

{
  const parts = hyphenateWord("components", 6);
  assertEq(parts.length, 2, "word is split into two parts");
  assert(parts[0].endsWith("-"), "first part ends with hyphen");
  assert(stringWidth(parts[0]) <= 6, `first part fits: ${stringWidth(parts[0])} <= 6`);
  // First part minus hyphen + second part = original word
  const firstWithoutHyphen = parts[0].slice(0, -1);
  assertEq(firstWithoutHyphen + parts[1], "components", "parts reconstruct to original word");
}

{
  const parts = hyphenateWord("hi", 10);
  assertEq(parts, ["hi"], "short word not hyphenated");
}

{
  const parts = hyphenateWord("components", 20);
  assertEq(parts, ["components"], "word fits, no hyphenation");
}

// ── Knuth-Plass Optimal Breaks ──────────────────────────────────────────

section("optimalBreaks / layoutOptimal");

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const breaks = optimalBreaks(p, 20);
  assert(breaks.length > 0, "has break points for narrow width");
}

{
  const p = prepare("Short");
  const breaks = optimalBreaks(p, 20);
  assertEq(breaks.length, 0, "single word needs no breaks");
}

{
  const p = prepare("The quick brown fox jumps over the lazy dog");
  const optimal = layoutOptimal(p, 15);
  const greedy = materializeToStrings(p, layout(p, 15));

  assertEq(optimal.length, greedy.length, "same number of lines (approximately)");

  // Optimal should have more balanced line widths
  const optWidths = optimal.map(l => stringWidth(l));
  const greedyWidths = greedy.map(l => stringWidth(l));

  const optVariance = variance(optWidths);
  const greedyVariance = variance(greedyWidths);

  // Optimal should have equal or lower variance (more balanced)
  assert(optVariance <= greedyVariance + 10, `optimal variance (${optVariance.toFixed(1)}) <= greedy (${greedyVariance.toFixed(1)}) + tolerance`);
}

function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  // Exclude last line (always short in both algorithms)
  const v = values.slice(0, -1);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return v.reduce((sum, x) => sum + (x - mean) ** 2, 0) / v.length;
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
