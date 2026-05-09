/**
 * visualize.test.ts — Tests for information visualization primitives.
 */
import {
  sparkline,
  sparklineColored,
  brailleSparkline,
  brailleBarChart,
  blockHeatmap,
  blockHeatmapColored,
  renderTree,
  renderFlatTree,
  confidenceRgb,
  confidenceText,
  confidenceBar,
  confidenceNotches,
  fileTypeBar,
  fileTypeLegend,
  diffHighlight,
  highlightMatches,
  shrinkBreadcrumb,
  sideBySideRename,
  directoryFingerprint,
  _categorizeExt,
} from "./visualize.ts";
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

// ── Sparklines ───────────────────────────────────────────────────────────

section("sparkline");

{
  const s = sparkline([1, 3, 7, 4, 2]);
  assertEq(s.length, 5, "sparkline has 5 chars");
  // Min=1 → ▁, Max=7 → █
  assertEq(s[0], "▁", "min value maps to ▁");
  assertEq(s[2], "█", "max value maps to █");
}

{
  const s = sparkline([5, 5, 5]);
  // All equal values: range=0, all map to index 0 (▁ is relative minimum)
  assertEq(s.length, 3, "flat values produce 3 chars");
  // With range=0, (v-min)/range = 0/1 = 0, so all map to ▁
  assertEq(s, "▁▁▁", "flat values map to lowest block (no variance)");
}

assertEq(sparkline([]), "", "empty array returns empty string");

{
  const s = sparkline([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 5);
  assertEq(s.length, 5, "resampled to width=5");
}

section("sparklineColored");

{
  const s = sparklineColored([0, 50, 100]);
  // In non-TTY test env, rgb() is a no-op, so output is plain block chars
  // Just verify it produces valid output with 3 block characters
  assert(s.length >= 3, "colored sparkline produces output");
  assert(s.includes("▁") || s.includes("█"), "contains block elements");
}

// ── Braille Charts ───────────────────────────────────────────────────────

section("brailleSparkline");

{
  const s = brailleSparkline([0, 4, 2, 3]);
  assertEq(s.length, 2, "4 values → 2 braille chars");
  // Each char encodes 2 values
}

assertEq(brailleSparkline([]), "", "empty → empty");

{
  const s = brailleSparkline([0, 0, 0, 0]);
  assertEq(s.length, 2, "4 zeros → 2 chars");
  // All zeros: min=max=0, all map to 0 → blank braille
}

section("brailleBarChart");

{
  const rows = brailleBarChart([10, 20, 30, 40], 2);
  assertEq(rows.length, 2, "height=2 → 2 rows");
  assertEq(rows[0].length, 2, "4 values → 2 chars wide");
}

{
  const rows = brailleBarChart([], 3);
  assertEq(rows.length, 0, "empty values → no rows");
}

// ── Block Heatmaps ───────────────────────────────────────────────────────

section("blockHeatmap");

{
  const h = blockHeatmap([0, 5, 10]);
  assertEq(h.length, 3, "3 values → 3 chars");
  assertEq(h[0], " ", "0 maps to space");
  assertEq(h[2], "█", "max maps to full block");
}

{
  const h = blockHeatmap([0, 0, 0]);
  assertEq(h, "   ", "all zeros → spaces");
}

{
  const h = blockHeatmap([4, 4, 4], 8);
  assertEq(h, "▄▄▄", "half of max=8 → ▄");
}

section("blockHeatmapColored");

{
  const h = blockHeatmapColored([0, 5, 10]);
  // In non-TTY env, rgb() is a no-op — test the block elements instead
  assert(h.includes("█"), "colored heatmap contains max block");
  assert(h.length >= 3, "colored heatmap has correct length");
}

// ── Tree Connectors ──────────────────────────────────────────────────────

section("renderTree");

{
  const lines = renderTree([
    {
      label: "src",
      children: [
        { label: "components" },
        {
          label: "utils",
          children: [{ label: "helpers.ts" }],
        },
      ],
    },
  ]);

  assertEq(lines[0], "src", "root has no connector");
  assert(lines[1].includes("├──"), "first child has ├──");
  assert(lines[1].includes("components"), "first child label");
  assert(lines[2].includes("└──"), "last child has └──");
  assert(lines[2].includes("utils"), "last child label");
  assert(lines[3].includes("└──"), "grandchild has └──");
  assert(lines[3].includes("helpers.ts"), "grandchild label");
  assertEq(lines.length, 4, "correct number of lines");
}

{
  const lines = renderTree([
    { label: "a" },
    { label: "b" },
  ]);
  assertEq(lines.length, 2, "two roots");
  assertEq(lines[0], "a", "first root");
  assertEq(lines[1], "b", "second root");
}

{
  // Deep nesting with continuation lines
  const lines = renderTree([
    {
      label: "root",
      children: [
        {
          label: "a",
          children: [
            { label: "a1" },
            { label: "a2" },
          ],
        },
        { label: "b" },
      ],
    },
  ]);

  // "a" is not last child (b follows), so its children get │ continuation
  assert(lines[2].includes("│"), "continuation line for non-last parent");
  // "b" is last child, so its prefix should use spaces, not │
  assert(!lines[4].startsWith("│"), "no continuation for last sibling's row");
}

section("renderFlatTree");

{
  const lines = renderFlatTree([
    { label: "src", depth: 0 },
    { label: "components", depth: 1 },
    { label: "utils", depth: 1 },
    { label: "helpers.ts", depth: 2 },
  ]);

  assertEq(lines[0], "src", "flat tree root");
  assert(lines[1].includes("├──"), "flat tree first child");
  assert(lines[2].includes("└──"), "flat tree last child");
  assert(lines[3].includes("└──"), "flat tree grandchild");
}

// ── Confidence Colors ────────────────────────────────────────────────────

section("confidenceRgb");

{
  const [r, g, b] = confidenceRgb(0);
  assertEq(r, 255, "confidence 0 → red R=255");
  assert(g < 100, "confidence 0 → red G<100");
  assert(b < 100, "confidence 0 → red B<100");
}

{
  const [r, g, b] = confidenceRgb(1);
  assert(r < 50, "confidence 1 → cyan R<50");
  assert(g > 150, "confidence 1 → cyan G>150");
  assert(b > 150, "confidence 1 → cyan B>150");
}

{
  const [r, g, b] = confidenceRgb(0.5);
  assert(r > 200, "confidence 0.5 → yellow R>200");
  assert(g > 200, "confidence 0.5 → yellow G>200");
}

section("confidenceText");

{
  const t = confidenceText(0.8, "good");
  assert(t.includes("good"), "text preserved");
  // rgb() is a no-op in test env — just verify text passes through
  assertEq(t, "good", "text passes through when truecolor unavailable");
}

section("confidenceBar");

{
  const bar = confidenceBar(0.7, 10);
  assert(stringWidth(bar) === 10, "bar width matches");
}

{
  const bar = confidenceBar(0, 5);
  assert(stringWidth(bar) === 5, "empty bar still has correct width");
}

// ── Confidence Notches ───────────────────────────────────────────────────

section("confidenceNotches");

{
  const n = confidenceNotches(1.0, 5);
  assert(n.includes("["), "has opening bracket");
  assert(n.includes("]"), "has closing bracket");
  assert(!n.includes("○"), "all filled at 1.0");
}

{
  const n = confidenceNotches(0.0, 5);
  assert(!n.includes("●"), "none filled at 0.0");
}

{
  const n = confidenceNotches(0.6, 5);
  // 0.6 * 5 = 3 filled
  // Can't easily count due to ANSI codes, but check brackets exist
  assert(n.startsWith("["), "starts with bracket");
  assert(n.endsWith("]"), "ends with bracket");
}

// ── File-Type Distribution ───────────────────────────────────────────────

section("fileTypeBar");

{
  const bar = fileTypeBar(
    [
      { ext: "ts", count: 10 },
      { ext: "json", count: 5 },
    ],
    20,
  );
  assert(stringWidth(bar) === 20, "bar fills target width");
  assert(bar.includes("█"), "contains filled blocks");
}

{
  const bar = fileTypeBar([], 10);
  assertEq(bar, "", "empty types → empty bar");
}

{
  const bar = fileTypeBar([{ ext: "ts", count: 0 }], 10);
  assertEq(bar, "", "zero count → empty bar");
}

section("fileTypeLegend");

{
  const legend = fileTypeLegend([
    { ext: "ts", count: 10 },
    { ext: "json", count: 5 },
  ]);
  assert(legend.includes("ts"), "legend includes extension name");
  assert(legend.includes("json"), "legend includes second extension");
  assert(legend.includes("■"), "legend includes color swatch");
}

// ── Diff Highlighting ────────────────────────────────────────────────────

section("diffHighlight");

{
  const d = diffHighlight("abc", "abc");
  assertEq(d.old, "abc", "identical strings: old unchanged");
  assertEq(d.new, "abc", "identical strings: new unchanged");
}

{
  // "src-components" → "src--components": a "-" was inserted, nothing removed
  const d = diffHighlight(
    "src-components",
    "src--components",
    (s) => `[+${s}]`,
    (s) => `[-${s}]`,
  );
  // Common prefix: "src-", common suffix: "components" (10 chars)
  // old middle: "" (nothing removed), new middle: "-" (inserted)
  assertEq(d.old, "src-components", "old unchanged (nothing removed)");
  assert(d.new.includes("[+-]"), "new has inserted hyphen");
  assert(d.new.includes("components"), "new preserves suffix");
}

{
  // Test actual removal + addition
  const d = diffHighlight(
    "src-old-components",
    "src-new-components",
    (s) => `[+${s}]`,
    (s) => `[-${s}]`,
  );
  assert(d.old.includes("[-old"), "old has removed segment");
  assert(d.new.includes("[+new"), "new has added segment");
}

{
  const d = diffHighlight(
    "hello",
    "help",
    (s) => `(+${s})`,
    (s) => `(-${s})`,
  );
  assert(d.old.includes("hel"), "common prefix preserved");
  assert(d.old.includes("(-lo)"), "old middle highlighted");
  assert(d.new.includes("(+p)"), "new middle highlighted");
}

{
  const d = diffHighlight(
    "abc",
    "xyz",
    (s) => `+${s}`,
    (s) => `-${s}`,
  );
  assertEq(d.old, "-abc", "fully different: entire old highlighted");
  assertEq(d.new, "+xyz", "fully different: entire new highlighted");
}

// ── Search Highlighting ──────────────────────────────────────────────────

section("highlightMatches");

{
  const h = highlightMatches("hello world", "world", (s) => `[${s}]`);
  assertEq(h, "hello [world]", "single match highlighted");
}

{
  const h = highlightMatches("aaa", "a", (s) => `(${s})`);
  assertEq(h, "(a)(a)(a)", "all occurrences highlighted");
}

{
  const h = highlightMatches("Hello HELLO", "hello", (s) => `<${s}>`);
  assertEq(h, "<Hello> <HELLO>", "case-insensitive by default");
}

{
  const h = highlightMatches("no match here", "xyz", (s) => `[${s}]`);
  assertEq(h, "no match here", "no match → unchanged");
}

{
  // Regex special characters
  const h = highlightMatches("a.b", "a.b", (s) => `[${s}]`);
  assertEq(h, "[a.b]", "regex chars escaped for string patterns");
}

// ── Breadcrumb Shrinking ─────────────────────────────────────────────────

section("shrinkBreadcrumb");

{
  const s = shrinkBreadcrumb("src/components/shared/utils/Button.tsx", 100);
  assertEq(s, "src/components/shared/utils/Button.tsx", "fits → unchanged");
}

{
  const s = shrinkBreadcrumb("src/components/shared/utils/Button.tsx", 25);
  assert(stringWidth(s) <= 25, `shrunk path fits: "${s}" (${stringWidth(s)} <= 25)`);
  assert(s.startsWith("src/"), "preserves first segment");
  assert(s.includes("Button.tsx"), "preserves last segment");
}

{
  const s = shrinkBreadcrumb("src/components/shared/utils/Button.tsx", 20);
  assert(stringWidth(s) <= 20, `aggressively shrunk fits: "${s}" (${stringWidth(s)} <= 20)`);
  assert(s.startsWith("src/"), "still preserves first segment");
}

{
  const s = shrinkBreadcrumb("short", 10);
  assertEq(s, "short", "no separator → unchanged");
}

{
  const s = shrinkBreadcrumb("a/b", 100);
  assertEq(s, "a/b", "two parts → unchanged");
}

// ── Side-by-Side Rename ──────────────────────────────────────────────────

section("sideBySideRename");

{
  const s = sideBySideRename("src-components", "src--components", 50);
  assert(s.includes("→"), "contains arrow separator");
  assert(stringWidth(s) <= 50, "fits within width");
}

// ── Directory Fingerprints ───────────────────────────────────────────────

section("directoryFingerprint");

{
  const fp = directoryFingerprint({ ts: 10, json: 3, md: 1 });
  assertEq(fp.length, 2, "fingerprint is 2 chars");
  // Should have presence bits for source, config, doc
}

{
  const fp = directoryFingerprint({});
  assertEq(fp, "⠀⠀", "empty → blank braille");
}

{
  // Two similar directories should produce the same fingerprint
  const fp1 = directoryFingerprint({ ts: 20, json: 5, md: 2 });
  const fp2 = directoryFingerprint({ ts: 40, json: 10, md: 4 });
  assertEq(fp1, fp2, "proportionally similar dirs → same fingerprint");
}

{
  // Very different directories should produce different fingerprints
  const fp1 = directoryFingerprint({ ts: 100 });
  const fp2 = directoryFingerprint({ css: 100 });
  assert(fp1 !== fp2, "different compositions → different fingerprints");
}

section("_categorizeExt");

assertEq(_categorizeExt("ts"), "source", "ts is source");
assertEq(_categorizeExt("css"), "style", "css is style");
assertEq(_categorizeExt("json"), "config", "json is config");
assertEq(_categorizeExt(".ts"), "source", "handles leading dot");
assertEq(_categorizeExt("md"), "doc", "md is doc");
assertEq(_categorizeExt("png"), "asset", "png is asset");
assertEq(_categorizeExt("html"), "markup", "html is markup");
assertEq(_categorizeExt("xyz"), "other", "unknown is other");
assertEq(_categorizeExt("test.ts"), "test", "test in name → test");

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
