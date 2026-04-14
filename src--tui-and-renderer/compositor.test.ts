/**
 * compositor.test.ts — Tests for multi-region compositing primitives.
 */
import {
  padToWidth,
  skipColumns,
  overlayRegion,
  splitPane,
  modalOverlay,
  floatingPanel,
  tabBar,
  tabbedPanel,
  toastBox,
  toastLines,
  toastOverlay,
  pipOverlay,
} from "./compositor.ts";
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

// ── padToWidth ───────────────────────────────────────────────────────────

section("padToWidth");

{
  assertEq(padToWidth("Hi", 5), "Hi   ", "pads short line");
  assertEq(padToWidth("Hello", 5), "Hello", "exact width unchanged");
  assertEq(stringWidth(padToWidth("Long string here", 5)), 5, "truncates long line");
  assertEq(padToWidth("", 3), "   ", "pads empty string");
}

// ── skipColumns ──────────────────────────────────────────────────────────

section("skipColumns");

{
  const s = skipColumns("Hello World", 6);
  assert(s.includes("World"), "skips to 'World'");
}

{
  const s = skipColumns("Hello", 10);
  // Skipping past end returns empty (with possible reset)
  assert(stringWidth(s) === 0, "skip past end returns empty");
}

{
  const s = skipColumns("Hello", 0);
  assert(s.includes("Hello"), "skip 0 returns full line");
}

{
  // ANSI codes in skipped region are discarded
  const s = skipColumns("\x1b[1mHello\x1b[22m World", 6);
  assert(s.includes("World"), "ANSI in skipped region handled");
}

// ── overlayRegion ────────────────────────────────────────────────────────

section("overlayRegion");

{
  const base = ["AAAAAAAAAA", "BBBBBBBBBB", "CCCCCCCCCC"];
  const overlay = ["XX", "YY"];
  const result = overlayRegion(base, overlay, 3, 0, 2);
  assertEq(result.length, 3, "preserves base height");

  // Row 0: "AAA" + "XX" + "AAAAA" (columns 0-2, overlay 3-4, columns 5-9)
  assert(result[0].includes("XX"), "overlay content in row 0");

  // Row 1: "BBB" + "YY" + "BBBBB"
  assert(result[1].includes("YY"), "overlay content in row 1");

  // Row 2: unchanged
  assertEq(result[2], "CCCCCCCCCC", "non-overlaid row unchanged");
}

{
  // Overlay extending past bottom
  const base = ["AAAA"];
  const overlay = ["XX", "YY"];
  const result = overlayRegion(base, overlay, 0, 0, 2);
  assertEq(result.length, 1, "doesn't extend past base height");
}

{
  // Overlay at negative y (partial visibility)
  const base = ["AAAA", "BBBB"];
  const overlay = ["XX", "YY"];
  const result = overlayRegion(base, overlay, 0, -1, 2);
  // Only row 1 of overlay (YY) should appear at base row 0
  assert(result[0].includes("YY"), "partial overlay from negative y");
}

{
  // Overlay wider than replacement width is clipped
  const base = ["AAAAAAAAAA"];
  const overlay = ["XXXX"];
  const result = overlayRegion(base, overlay, 2, 0, 4);
  const w = stringWidth(result[0]);
  // Should be 10 chars wide: 2 A's + 4 X's + remaining A's
  assert(w >= 10, `overlay result width: ${w}`);
}

// ── splitPane ────────────────────────────────────────────────────────────

section("splitPane");

{
  const left = ["Left 1", "Left 2"];
  const right = ["Right 1", "Right 2"];
  const result = splitPane(left, right, 30, 14);

  assertEq(result.length, 2, "height matches max of left/right");
  assert(stringWidth(result[0]) === 30, `split pane total width: ${stringWidth(result[0])}`);
  assert(result[0].includes("Left 1"), "left content present");
  assert(result[0].includes("Right 1"), "right content present");
}

{
  // Mismatched heights: shorter side gets padded
  const left = ["A"];
  const right = ["B", "C", "D"];
  const result = splitPane(left, right, 20, 9);
  assertEq(result.length, 3, "height matches longer side");
  assert(stringWidth(result[2]) === 20, "padded rows maintain width");
}

{
  // Single column split
  const left = ["L"];
  const right = ["R"];
  const result = splitPane(left, right, 5, 2);
  assertEq(result.length, 1, "single row");
  assertEq(stringWidth(result[0]), 5, "total width correct");
}

// ── modalOverlay ─────────────────────────────────────────────────────────

section("modalOverlay");

{
  const backdrop = Array(10).fill("Background content here!!!");
  const content = ["Are you sure?", "Press Enter to confirm."];
  const result = modalOverlay(backdrop, content, 30, 60, 10);

  assertEq(result.length, 10, "modal preserves screen height");
  // Modal should be somewhere in the middle
  const hasModal = result.some((line) => line.includes("Are you sure?"));
  assert(hasModal, "modal content visible");
  // Backdrop is present (dimmed when color support available)
  const hasBackdrop = result.some((line) => line.includes("Background"));
  assert(hasBackdrop, "backdrop content present");
}

{
  // Small screen: modal still renders
  const backdrop = ["A", "B", "C"];
  const content = ["OK"];
  const result = modalOverlay(backdrop, content, 10, 15, 3);
  assertEq(result.length, 3, "small screen preserves height");
}

// ── floatingPanel ────────────────────────────────────────────────────────

section("floatingPanel");

{
  const panel = floatingPanel(["Hello", "World"], 20);
  assertEq(panel.length, 4, "2 content lines + top/bottom border");
  assert(panel[0].includes("╭"), "top border has corner");
  assert(panel[3].includes("╰"), "bottom border has corner");
  assert(panel[1].includes("Hello"), "content line 1");
  assert(panel[2].includes("World"), "content line 2");
}

{
  const panel = floatingPanel(["Test"], 20, "My Title");
  assert(panel[0].includes("My Title"), "title in top border");
  assert(panel[0].includes("╭"), "still has corner");
  assert(panel[0].includes("╮"), "still has right corner");
}

{
  // Single line
  const panel = floatingPanel(["x"], 10);
  assertEq(panel.length, 3, "1 content + 2 borders");
}

// ── tabBar ───────────────────────────────────────────────────────────────

section("tabBar");

{
  const bar = tabBar(
    [
      { label: "Info", active: true },
      { label: "Files", active: false },
      { label: "Diff", active: false },
    ],
    40,
  );
  assert(bar.includes("Info"), "active tab label present");
  assert(bar.includes("Files"), "inactive tab label present");
  assertEq(stringWidth(bar), 40, "tab bar padded to width");
}

{
  // Single tab
  const bar = tabBar([{ label: "Only", active: true }], 20);
  assert(bar.includes("Only"), "single tab works");
}

// ── tabbedPanel ──────────────────────────────────────────────────────────

section("tabbedPanel");

{
  const panel = tabbedPanel(
    [
      { label: "Tab A", active: true },
      { label: "Tab B", active: false },
    ],
    ["Content here", "More content"],
    30,
  );
  // Structure: top border, tab bar, separator, 2 content lines, bottom border
  assertEq(panel.length, 6, "correct panel structure");
  assert(panel[0].includes("╭"), "top border");
  assert(panel[1].includes("Tab A"), "tab bar");
  assert(panel[2].includes("├"), "separator");
  assert(panel[3].includes("Content here"), "content line 1");
  assert(panel[5].includes("╰"), "bottom border");
}

// ── toastBox / toastLines ────────────────────────────────────────────────

section("toastBox / toastLines");

{
  const toast = toastBox("Hello!", 40);
  assert(toast.includes("Hello!"), "toast contains message");
  assert(toast.includes("╭"), "toast has top border");
  assert(toast.includes("╰"), "toast has bottom border");
}

{
  const lines = toastLines("Test message", 30);
  assertEq(lines.length, 3, "toast is 3 lines");
  assert(lines[1].includes("Test message"), "toast content line");
}

{
  // Long message is truncated
  const lines = toastLines("A very long toast message that exceeds the max width", 20);
  for (const line of lines) {
    assert(stringWidth(line) <= 22, `toast line fits: ${stringWidth(line)} <= 22`);
  }
}

// ── toastOverlay ─────────────────────────────────────────────────────────

section("toastOverlay");

{
  const base = Array(5).fill("A".repeat(40));
  const result = toastOverlay(base, "Notice!", 40, 30);
  assertEq(result.length, 5, "preserves base height");
  // Toast should be near the top-right
  assert(result[1].includes("Notice!") || result[2].includes("Notice!"), "toast visible");
}

// ── pipOverlay ───────────────────────────────────────────────────────────

section("pipOverlay");

{
  const base = Array(20).fill("X".repeat(60));
  const content = ["Progress: 50%", "12/24 files"];
  const result = pipOverlay(base, content, 25, "bottom-right", 60, 20);

  assertEq(result.length, 20, "preserves screen height");
  // PiP should be in the bottom-right area
  const hasContent = result.some((line) => line.includes("Progress: 50%"));
  assert(hasContent, "PiP content visible");
}

{
  const base = Array(20).fill("X".repeat(60));
  const content = ["Top left"];
  const result = pipOverlay(base, content, 20, "top-left", 60, 20);

  const hasContent = result.some((line) => line.includes("Top left"));
  assert(hasContent, "top-left PiP visible");
}

{
  const base = Array(20).fill("X".repeat(60));
  const content = ["Info"];
  const result = pipOverlay(base, content, 15, "top-right", 60, 20, "Status");

  const hasTitle = result.some((line) => line.includes("Status"));
  assert(hasTitle, "PiP with title visible");
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
