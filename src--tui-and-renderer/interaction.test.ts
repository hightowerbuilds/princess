/**
 * interaction.test.ts — Tests for input enrichment primitives.
 */
import {
  fuzzyScore,
  fuzzyMatch,
  fuzzyFilter,
  fuzzyHighlight,
  matchChord,
  formatPendingChord,
  createEditorState,
  handleEditorKey,
  renderEditor,
  createUndoStack,
  renderContextMenu,
  contextMenuWidth,
  selectRange,
  toggleSelection,
  invertSelection,
  selectByPattern,
  jumpLabels,
  resolveJumpLabel,
  renderWithJumpLabels,
} from "./interaction.ts";
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

// ── Fuzzy Search ─────────────────────────────────────────────────────────

section("fuzzyScore");

{
  assert(fuzzyScore("", "anything") === 0, "empty query matches everything with score 0");
  assert(fuzzyScore("sc", "src-components") > 0, "partial match scores positive");
  assert(fuzzyScore("xyz", "src-components") === -1, "no match returns -1");
  assert(fuzzyScore("src", "src-components") > 0, "prefix match scores positive");

  // Word-boundary matches score higher
  const boundaryScore = fuzzyScore("sc", "src-components");
  const midScore = fuzzyScore("rc", "src-components");
  assert(boundaryScore > midScore, "word-boundary match scores higher than mid-word");
}

section("fuzzyMatch");

{
  const m = fuzzyMatch("cmp", "components");
  assert(m.score > 0, "cmp matches components");
  assertEq(m.matchedIndices.length, 3, "3 characters matched");
  assert(m.matchedIndices[0] === 0, "first match at index 0 (c)");
}

{
  const m = fuzzyMatch("xyz", "hello");
  assertEq(m.score, -1, "no match returns -1");
  assertEq(m.matchedIndices.length, 0, "no matched indices");
}

section("fuzzyFilter");

{
  const items = ["apple", "application", "banana", "pineapple"];
  const results = fuzzyFilter("app", items, (x) => x);
  assert(results.length === 3, "3 items match 'app'");
  assertEq(results[0].item, "apple", "best match first");
}

{
  const results = fuzzyFilter("", ["a", "b", "c"], (x) => x);
  assertEq(results.length, 3, "empty query returns all items");
}

{
  const results = fuzzyFilter("zzz", ["hello", "world"], (x) => x);
  assertEq(results.length, 0, "no matches returns empty");
}

section("fuzzyHighlight");

{
  const h = fuzzyHighlight("hello", [0, 2], (s) => `[${s}]`);
  assertEq(h, "[h]e[l]lo", "highlights matched indices");
}

{
  const h = fuzzyHighlight("test", [], (s) => `[${s}]`);
  assertEq(h, "test", "no indices = no highlighting");
}

// ── Keyboard Chords ──────────────────────────────────────────────────────

section("matchChord");

{
  const chords = [
    { keys: ["g", "g"], action: "jumpTop" },
    { keys: ["g", "e"], action: "jumpEnd" },
    { keys: ["d", "d"], action: "delete" },
  ];

  // First key of a chord → pending
  let state = matchChord([], "g", chords);
  assertEq(state.pending, ["g"], "first key accumulates");
  assertEq(state.matched, null, "not yet matched");

  // Complete the chord
  state = matchChord(state.pending, "g", chords);
  assertEq(state.pending, [], "chord completed, pending cleared");
  assertEq(state.matched, "jumpTop", "matched jumpTop");

  // Different completion
  state = matchChord(["g"], "e", chords);
  assertEq(state.matched, "jumpEnd", "matched jumpEnd");

  // No match → reset
  state = matchChord([], "x", chords);
  assertEq(state.pending, [], "unrecognized key → empty pending");
  assertEq(state.matched, null, "unrecognized key → no match");

  // Partial match then wrong key
  state = matchChord(["g"], "x", chords);
  assertEq(state.pending, [], "wrong continuation resets");
  assertEq(state.matched, null, "wrong continuation → no match");
}

section("formatPendingChord");

{
  assertEq(formatPendingChord([]), "", "empty pending = empty string");
  const f = formatPendingChord(["g"]);
  assert(f.includes("g"), "shows pending key");
}

// ── Inline Editor ────────────────────────────────────────────────────────

section("handleEditorKey");

{
  let s = createEditorState("hello", 2);
  assertEq(s.text, "hello", "initial text");
  assertEq(s.cursor, 2, "initial cursor");

  // Movement
  s = handleEditorKey(s, "left");
  assertEq(s.cursor, 1, "left moves cursor");
  s = handleEditorKey(s, "right");
  assertEq(s.cursor, 2, "right moves cursor");
  s = handleEditorKey(s, "home");
  assertEq(s.cursor, 0, "home goes to start");
  s = handleEditorKey(s, "end");
  assertEq(s.cursor, 5, "end goes to end");

  // Boundaries
  s = createEditorState("hi", 0);
  s = handleEditorKey(s, "left");
  assertEq(s.cursor, 0, "left at start stays at 0");
  s = createEditorState("hi", 2);
  s = handleEditorKey(s, "right");
  assertEq(s.cursor, 2, "right at end stays at end");
}

{
  // Insertion
  let s = createEditorState("hllo", 1);
  s = handleEditorKey(s, "e");
  assertEq(s.text, "hello", "character inserted");
  assertEq(s.cursor, 2, "cursor advances after insert");
}

{
  // Backspace
  let s = createEditorState("helllo", 4);
  s = handleEditorKey(s, "backspace");
  assertEq(s.text, "hello", "backspace deletes before cursor");
  assertEq(s.cursor, 3, "cursor moves back after backspace");

  // Backspace at start
  s = createEditorState("hi", 0);
  s = handleEditorKey(s, "backspace");
  assertEq(s.text, "hi", "backspace at start does nothing");
}

{
  // Delete
  let s = createEditorState("helllo", 3);
  s = handleEditorKey(s, "delete");
  assertEq(s.text, "hello", "delete removes at cursor");
  assertEq(s.cursor, 3, "cursor stays after delete");

  // Delete at end
  s = createEditorState("hi", 2);
  s = handleEditorKey(s, "delete");
  assertEq(s.text, "hi", "delete at end does nothing");
}

section("renderEditor");

{
  const r = renderEditor({ text: "hello", cursor: 2 }, 10);
  assert(r.includes("l"), "contains cursor char");
  assertEq(stringWidth(r), 10, "padded to width");
}

// ── Undo/Redo Stack ──────────────────────────────────────────────────────

section("createUndoStack");

{
  const stack = createUndoStack<number>(0);
  assertEq(stack.current(), 0, "initial state");
  assert(!stack.canUndo(), "can't undo at start");
  assert(!stack.canRedo(), "can't redo at start");

  stack.push(1);
  assertEq(stack.current(), 1, "after push");
  assert(stack.canUndo(), "can undo after push");

  stack.push(2);
  assertEq(stack.current(), 2, "after second push");
  assertEq(stack.undoDepth(), 2, "undo depth is 2");

  const undone = stack.undo();
  assertEq(undone, 1, "undo returns previous");
  assertEq(stack.current(), 1, "current after undo");
  assert(stack.canRedo(), "can redo after undo");

  const redone = stack.redo();
  assertEq(redone, 2, "redo returns next");
  assertEq(stack.current(), 2, "current after redo");
  assert(!stack.canRedo(), "can't redo after redo");

  // Undo then push clears redo
  stack.undo();
  stack.push(3);
  assert(!stack.canRedo(), "push clears redo history");
  assertEq(stack.current(), 3, "current is new push");
}

{
  // Max depth
  const stack = createUndoStack<number>(0, 3);
  stack.push(1);
  stack.push(2);
  stack.push(3);
  stack.push(4); // Should evict oldest
  assertEq(stack.undoDepth(), 3, "max depth respected");
}

{
  // Empty stack
  const stack = createUndoStack<string>();
  assertEq(stack.current(), null, "no initial = null");
  assertEq(stack.undo(), null, "undo empty = null");
  assertEq(stack.redo(), null, "redo empty = null");
}

// ── Context Menu ─────────────────────────────────────────────────────────

section("renderContextMenu");

{
  const menu = renderContextMenu([
    { label: "Approve", key: "a" },
    { label: "Reject", key: "r" },
    { label: "Edit", key: "e" },
  ], 1);

  assert(menu.length === 5, "3 items + top/bottom border");
  assert(menu[0].includes("╭"), "top border");
  assert(menu[4].includes("╰"), "bottom border");
  assert(menu[2].includes("Reject"), "cursor item present");
}

{
  const menu = renderContextMenu([
    { label: "Active", key: "a" },
    { label: "Disabled", key: "d", enabled: false },
  ], 0);

  assert(menu.length === 4, "2 items + borders");
}

section("contextMenuWidth");

{
  const w = contextMenuWidth([
    { label: "Hello", key: "h" },
    { label: "World!", key: "w" },
  ]);
  assert(w > 10, `menu width: ${w}`);
}

// ── Bulk Selection ───────────────────────────────────────────────────────

section("selectRange / toggleSelection / invertSelection");

{
  const sel = selectRange(new Set(), 2, 5);
  assertEq(sel.size, 4, "range 2-5 selects 4 items");
  assert(sel.has(2) && sel.has(3) && sel.has(4) && sel.has(5), "all indices in range");
}

{
  const sel = selectRange(new Set(), 5, 2);
  assertEq(sel.size, 4, "reversed range works");
}

{
  let sel = new Set<number>();
  sel = toggleSelection(sel, 3);
  assert(sel.has(3), "toggle adds");
  sel = toggleSelection(sel, 3);
  assert(!sel.has(3), "toggle removes");
}

{
  const sel = invertSelection(new Set([0, 2, 4]), 5);
  assertEq(sel.size, 2, "inversion selects unselected");
  assert(sel.has(1) && sel.has(3), "correct indices inverted");
}

section("selectByPattern");

{
  const items = ["src-components", "src-utils", "test-helpers", "src-hooks"];
  const sel = selectByPattern(items, /^src/, (x) => x);
  assertEq(sel.size, 3, "3 items match /^src/");
  assert(sel.has(0) && sel.has(1) && sel.has(3), "correct items selected");
  assert(!sel.has(2), "test-helpers not selected");
}

// ── Jump Labels ──────────────────────────────────────────────────────────

section("jumpLabels");

{
  const labels = jumpLabels(5);
  assertEq(labels, ["1", "2", "3", "4", "5"], "first 5 labels are 1-5");
}

{
  const labels = jumpLabels(12);
  assertEq(labels[9], "a", "10th label is 'a'");
  assertEq(labels[11], "c", "12th label is 'c'");
}

{
  const labels = jumpLabels(0);
  assertEq(labels.length, 0, "0 count = empty");
}

section("resolveJumpLabel");

{
  assertEq(resolveJumpLabel("1"), 0, "'1' resolves to index 0");
  assertEq(resolveJumpLabel("9"), 8, "'9' resolves to index 8");
  assertEq(resolveJumpLabel("a"), 9, "'a' resolves to index 9");
  assertEq(resolveJumpLabel("z"), 34, "'z' resolves to index 34");
  assertEq(resolveJumpLabel("!"), -1, "invalid char returns -1");
}

section("renderWithJumpLabels");

{
  const lines = renderWithJumpLabels(["Item A", "Item B"], ["1", "2"]);
  assertEq(lines.length, 2, "same number of lines");
  assert(lines[0].includes("Item A"), "content preserved");
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
