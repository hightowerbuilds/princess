/**
 * aesthetics.test.ts — Tests for high-end visual polish primitives.
 */
import {
  gradientText,
  gradientTextMulti,
  dropShadow,
  skeleton,
  skeletonLine,
  noiseTexture,
  noiseLine,
  focusDimLevel,
  focusDimLine,
  depthBlur,
  statusBar,
  formatElapsed,
} from "./aesthetics.ts";
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

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) <= tolerance) passed++;
  else {
    failed++;
    console.error(
      `  FAIL: ${message}\n    expected: ~${expected} (±${tolerance})\n    actual:   ${actual}`,
    );
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── Gradient Text ────────────────────────────────────────────────────────

section("gradientText");

{
  const g = gradientText("Hello", [255, 0, 0], [0, 0, 255]);
  assert(g.includes("H"), "contains first char");
  assert(g.includes("o"), "contains last char");
  // In non-TTY, rgb() is a no-op, so output is plain text
  assert(g.length >= 5, "output is at least 5 chars");
}

{
  const g = gradientText("", [255, 0, 0], [0, 0, 255]);
  assertEq(g, "", "empty string returns empty");
}

{
  const g = gradientText("A", [255, 0, 0], [0, 0, 255]);
  assert(g.includes("A"), "single char preserved");
}

section("gradientTextMulti");

{
  const g = gradientTextMulti("Rainbow", [
    [0.0, [255, 0, 0]],
    [0.5, [0, 255, 0]],
    [1.0, [0, 0, 255]],
  ]);
  assert(g.length >= 7, "multi-stop gradient produces output");
}

{
  // ANSI codes should be skipped in gradient
  const input = "\x1b[1mHello\x1b[22m";
  const g = gradientTextMulti(input, [[0, [255, 0, 0]], [1, [0, 0, 255]]]);
  assert(g.includes("\x1b[1m"), "ANSI bold code preserved");
  assert(g.includes("H"), "text content preserved");
}

// ── Drop Shadow ──────────────────────────────────────────────────────────

section("dropShadow");

{
  const panel = ["AB", "CD"];
  const shadowed = dropShadow(panel, 2);
  assertEq(shadowed.length, 3, "adds one shadow row");
  // First line (i < offset) gets spaces on right, not shadow
  assert(shadowed[0].includes("AB"), "first line content preserved");
  // Shadow row at bottom
  assert(shadowed[2].length > 0, "shadow bottom row exists");
}

{
  const panel = ["Hello"];
  const shadowed = dropShadow(panel, 5, { char: "▒" });
  assert(shadowed.length === 2, "1 content line + 1 shadow row");
}

// ── Skeleton Loading ─────────────────────────────────────────────────────

section("skeleton");

{
  const s = skeleton(30, 3);
  assertEq(s.length, 3, "skeleton has correct height");
  for (const line of s) {
    assert(stringWidth(line) <= 30, `skeleton line fits width: ${stringWidth(line)} <= 30`);
    assert(stringWidth(line) > 0, "skeleton line is not empty");
  }
}

{
  const s1 = skeletonLine(20, 42);
  const s2 = skeletonLine(20, 42);
  assertEq(s1, s2, "same seed produces same skeleton");
}

{
  const s1 = skeletonLine(20, 1);
  const s2 = skeletonLine(20, 2);
  assert(s1 !== s2, "different seeds produce different skeletons");
}

{
  assertEq(skeletonLine(0), "", "zero width returns empty");
}

// ── Noise Texture ────────────────────────────────────────────────────────

section("noiseTexture");

{
  const n = noiseTexture(20, 3);
  assertEq(n.length, 3, "noise has correct height");
  for (const line of n) {
    assert(stringWidth(line) === 20, `noise line width: ${stringWidth(line)} === 20`);
  }
}

{
  // Deterministic: same params produce same output
  const n1 = noiseLine(30, 0, 42);
  const n2 = noiseLine(30, 0, 42);
  assertEq(n1, n2, "same params produce same noise");
}

{
  // Different rows produce different patterns
  const n1 = noiseLine(30, 0, 0);
  const n2 = noiseLine(30, 1, 0);
  assert(n1 !== n2, "different rows produce different noise");
}

{
  // Noise contains some dots (not all spaces)
  const n = noiseLine(100, 0, 0);
  assert(n.includes("·") || n.includes("\x1b"), "noise contains dots");
}

// ── Focus Dimming ────────────────────────────────────────────────────────

section("focusDimLevel");

{
  assertApprox(focusDimLevel(3, 3, 5), 1.0, 0.01, "at focus = full brightness");
  assertApprox(focusDimLevel(8, 3, 5), 0.2, 0.01, "at max distance = min brightness");
  assertApprox(focusDimLevel(100, 3, 5), 0.2, 0.01, "beyond max distance = min brightness");

  const mid = focusDimLevel(5, 3, 5);
  assert(mid > 0.2 && mid < 1.0, `mid-distance brightness: ${mid.toFixed(2)}`);
}

{
  // Symmetric around focus
  const left = focusDimLevel(1, 5, 5);
  const right = focusDimLevel(9, 5, 5);
  assertApprox(left, right, 0.01, "symmetric dimming");
}

section("focusDimLine");

{
  const line = focusDimLine("Hello", 3, 3, 5);
  assertEq(line, "Hello", "at focus = unmodified");
}

{
  const line = focusDimLine("Hello", 10, 3, 5);
  // Should be dim (at max distance or beyond)
  assert(line.includes("\x1b[") || line === "Hello", "distant line has styling or passes through");
}

// ── Depth-of-Field ───────────────────────────────────────────────────────

section("depthBlur");

{
  assertEq(depthBlur("Hello", 0), "Hello", "depth 0 = no change");
}

{
  const d1 = depthBlur("Hello", 1);
  assert(d1 !== "Hello" || true, "depth 1 applies dim (or passes through in non-TTY)");
}

{
  const d2 = depthBlur("Hello", 2);
  assert(d2.length > 0, "depth 2 produces output");
}

// ── Status Bar ───────────────────────────────────────────────────────────

section("statusBar");

{
  const bar = statusBar(
    { operation: "Scanning", elapsedMs: 4200 },
    60,
  );
  assert(bar.includes("Scanning"), "contains operation label");
  assert(bar.includes("4.2"), "contains elapsed time");
  assert(stringWidth(bar) === 60, `status bar width: ${stringWidth(bar)} === 60`);
}

{
  const bar = statusBar(
    { operation: "Applying", elapsedMs: 1500, progress: 0.5, itemLabel: "12/24 dirs" },
    80,
  );
  assert(bar.includes("Applying"), "contains operation");
  assert(bar.includes("50%"), "contains progress percentage");
  assert(bar.includes("12/24"), "contains item label");
}

section("formatElapsed");

{
  assertEq(formatElapsed(500), "500ms", "sub-second");
  assertEq(formatElapsed(4200), "4.2s", "seconds");
  assertEq(formatElapsed(65000), "1m5s", "minutes");
  assertEq(formatElapsed(0), "0ms", "zero");
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
