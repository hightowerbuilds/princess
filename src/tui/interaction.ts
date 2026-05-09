/**
 * interaction.ts — Input enrichment primitives for terminal UI
 *
 * Pure functions and state machines for advanced user interaction:
 * fuzzy search, keyboard chords, inline editing, undo/redo,
 * context menus, bulk selection, and jump-to-index labels.
 *
 * Sections:
 *   Fuzzy search       — scoring, filtering, and match highlighting
 *   Keyboard chords    — multi-key command sequences with timeout
 *   Inline editor      — text input state machine with cursor
 *   Undo/redo stack    — generic state history
 *   Context menu       — floating menu rendering
 *   Bulk selection     — range and pattern selection
 *   Jump labels        — index labels for quick navigation
 */

import { stringWidth } from "./typeset.ts";
import { truncateEnd } from "./typeset-compose.ts";
import { padToWidth } from "./compositor.ts";
import { bold, dim, cyan, inverse, yellow } from "./colors.ts";

// ── Fuzzy Search ─────────────────────────────────────────────────────────

export interface FuzzyResult {
  /** Match score (higher = better). -1 if no match. */
  score: number;
  /** Indices of matched characters in the target string. */
  matchedIndices: number[];
}

/**
 * Score a fuzzy match of `query` against `target`.
 *
 * Returns -1 if the query doesn't match. Otherwise returns a
 * positive score based on:
 *   - Consecutive character matches (2x bonus per consecutive)
 *   - Word-boundary matches (5pt bonus for start-of-segment)
 *   - Position (earlier matches score higher)
 *
 * ```ts
 * fuzzyScore("sc", "src-components")  // high score (start-of-word match)
 * fuzzyScore("xyz", "src-components") // -1 (no match)
 * ```
 */
export function fuzzyScore(query: string, target: string): number {
  return fuzzyMatch(query, target).score;
}

/**
 * Fuzzy match with matched character indices.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult {
  if (query.length === 0) return { score: 0, matchedIndices: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];

  let score = 0;
  let qi = 0;
  let lastMatchIdx = -2;
  let consecutiveBonus = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      indices.push(ti);

      // Consecutive match bonus
      if (ti === lastMatchIdx + 1) {
        consecutiveBonus++;
        score += consecutiveBonus * 2;
      } else {
        consecutiveBonus = 0;
      }

      // Word-boundary bonus
      if (
        ti === 0 ||
        "-_/. ".includes(t[ti - 1])
      ) {
        score += 5;
      }

      // Prefer earlier matches
      score += Math.max(0, 10 - ti);

      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return { score: -1, matchedIndices: [] };
  return { score, matchedIndices: indices };
}

/**
 * Filter and sort items by fuzzy match score.
 *
 * Returns only matching items, sorted best-match-first.
 *
 * ```ts
 * const results = fuzzyFilter("comp", items, item => item.name);
 * ```
 */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
): Array<{ item: T; score: number; indices: number[] }> {
  if (query.length === 0) {
    return items.map((item) => ({ item, score: 0, indices: [] }));
  }

  const results: Array<{ item: T; score: number; indices: number[] }> = [];

  for (const item of items) {
    const { score, matchedIndices } = fuzzyMatch(query, key(item));
    if (score >= 0) {
      results.push({ item, score, indices: matchedIndices });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Highlight matched characters in a string.
 *
 * Applies `style` to each character at the given indices.
 *
 * ```ts
 * fuzzyHighlight("components", [0, 4])  // bold "c" and "o"
 * ```
 */
export function fuzzyHighlight(
  text: string,
  indices: number[],
  style: (s: string) => string = (s) => bold(yellow(s)),
): string {
  if (indices.length === 0) return text;

  const indexSet = new Set(indices);
  let result = "";

  for (let i = 0; i < text.length; i++) {
    result += indexSet.has(i) ? style(text[i]) : text[i];
  }

  return result;
}

// ── Keyboard Chords ──────────────────────────────────────────────────────

export interface ChordDef {
  /** Key sequence (e.g., ["g", "g"] or ["g", "e"]). */
  keys: string[];
  /** Action name triggered by this chord. */
  action: string;
}

export interface ChordState {
  /** Keys accumulated so far (empty if resolved or rejected). */
  pending: string[];
  /** Matched action name, or null if not yet matched. */
  matched: string | null;
}

/**
 * Process a key press against a set of chord definitions.
 *
 * Returns the new chord state:
 *   - `matched` is set if the key completes a chord
 *   - `pending` accumulates if the key is a valid chord prefix
 *   - Both are empty/null if the key doesn't match anything
 *
 * ```ts
 * const chords = [
 *   { keys: ["g", "g"], action: "jumpTop" },
 *   { keys: ["g", "e"], action: "jumpEnd" },
 * ];
 *
 * let state = matchChord([], "g", chords);
 * // { pending: ["g"], matched: null }
 *
 * state = matchChord(state.pending, "g", chords);
 * // { pending: [], matched: "jumpTop" }
 * ```
 */
export function matchChord(
  pending: string[],
  key: string,
  chords: ChordDef[],
): ChordState {
  const sequence = [...pending, key];

  // Exact match?
  const exact = chords.find(
    (c) =>
      c.keys.length === sequence.length &&
      c.keys.every((k, i) => k === sequence[i]),
  );
  if (exact) return { pending: [], matched: exact.action };

  // Prefix of any chord?
  const isPrefix = chords.some(
    (c) =>
      c.keys.length > sequence.length &&
      sequence.every((k, i) => k === c.keys[i]),
  );
  if (isPrefix) return { pending: sequence, matched: null };

  // No match
  return { pending: [], matched: null };
}

/**
 * Format a pending chord sequence for display in a status bar.
 */
export function formatPendingChord(pending: string[]): string {
  if (pending.length === 0) return "";
  return dim("[") + bold(pending.join(" ")) + dim("]");
}

// ── Inline Editor ────────────────────────────────────────────────────────

export interface EditorState {
  /** Current text content. */
  text: string;
  /** Cursor position (0-based index). */
  cursor: number;
}

/**
 * Create a new editor state.
 */
export function createEditorState(text: string = "", cursor?: number): EditorState {
  return { text, cursor: cursor ?? text.length };
}

/**
 * Process a key press in the inline editor.
 *
 * Returns a new state (immutable update).
 *
 * Supported keys: left, right, home, end, backspace, delete,
 * and any single printable character.
 */
export function handleEditorKey(state: EditorState, key: string): EditorState {
  const { text, cursor } = state;

  switch (key) {
    case "left":
      return { text, cursor: Math.max(0, cursor - 1) };
    case "right":
      return { text, cursor: Math.min(text.length, cursor + 1) };
    case "home":
      return { text, cursor: 0 };
    case "end":
      return { text, cursor: text.length };
    case "backspace":
      if (cursor === 0) return state;
      return {
        text: text.slice(0, cursor - 1) + text.slice(cursor),
        cursor: cursor - 1,
      };
    case "delete":
      if (cursor >= text.length) return state;
      return {
        text: text.slice(0, cursor) + text.slice(cursor + 1),
        cursor,
      };
    default:
      // Single printable character
      if (key.length === 1) {
        return {
          text: text.slice(0, cursor) + key + text.slice(cursor),
          cursor: cursor + 1,
        };
      }
      return state;
  }
}

/**
 * Render the editor field with a visible cursor.
 *
 * The cursor character is rendered with `inverse` styling.
 */
export function renderEditor(state: EditorState, width: number): string {
  const { text, cursor } = state;
  const before = text.slice(0, cursor);
  const cursorChar = cursor < text.length ? text[cursor] : " ";
  const after = cursor < text.length ? text.slice(cursor + 1) : "";

  const rendered = before + inverse(cursorChar) + after;
  return padToWidth(rendered, width);
}

// ── Undo/Redo Stack ──────────────────────────────────────────────────────

export interface UndoStack<T> {
  /** Push a new state, clearing the redo future. */
  push(state: T): void;
  /** Undo: move current to future, restore previous. Returns null if nothing to undo. */
  undo(): T | null;
  /** Redo: move current to past, restore next. Returns null if nothing to redo. */
  redo(): T | null;
  /** Whether undo is available. */
  canUndo(): boolean;
  /** Whether redo is available. */
  canRedo(): boolean;
  /** The current state. */
  current(): T | null;
  /** Number of undo steps available. */
  undoDepth(): number;
  /** Number of redo steps available. */
  redoDepth(): number;
}

/**
 * Create a generic undo/redo stack.
 *
 * ```ts
 * const history = createUndoStack<string[]>(initialItems);
 * history.push(modifiedItems);
 * history.undo(); // returns initialItems
 * history.redo(); // returns modifiedItems
 * ```
 */
export function createUndoStack<T>(initial?: T, maxDepth: number = 50): UndoStack<T> {
  const past: T[] = [];
  const future: T[] = [];
  let current: T | undefined = initial;

  return {
    push(state: T) {
      if (current !== undefined) {
        past.push(current);
        if (past.length > maxDepth) past.shift();
      }
      current = state;
      future.length = 0;
    },
    undo(): T | null {
      if (past.length === 0) return null;
      if (current !== undefined) future.push(current);
      current = past.pop()!;
      return current;
    },
    redo(): T | null {
      if (future.length === 0) return null;
      if (current !== undefined) past.push(current);
      current = future.pop()!;
      return current;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    current: () => current ?? null,
    undoDepth: () => past.length,
    redoDepth: () => future.length,
  };
}

// ── Context Menu ─────────────────────────────────────────────────────────

export interface ContextMenuItem {
  /** Display label. */
  label: string;
  /** Shortcut key hint (e.g., "e", "d"). */
  key: string;
  /** Whether the item is interactive. Default: true. */
  enabled?: boolean;
}

/**
 * Render a floating context menu.
 *
 * Returns bordered lines ready for compositing via `overlayRegion()`.
 * The active item is highlighted with `inverse`.
 *
 * ```ts
 * const menu = renderContextMenu([
 *   { label: "Approve", key: "a" },
 *   { label: "Reject", key: "r" },
 *   { label: "Edit Name", key: "e" },
 * ], 1);
 * ```
 */
export function renderContextMenu(
  items: ContextMenuItem[],
  cursor: number = 0,
): string[] {
  const maxLabel = Math.max(...items.map((i) => stringWidth(i.label)));
  const maxKey = Math.max(...items.map((i) => stringWidth(i.key)));
  const innerWidth = maxLabel + maxKey + 4; // padding + gap

  const lines: string[] = [];
  lines.push("╭" + "─".repeat(innerWidth + 2) + "╮");

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isCursor = i === cursor;
    const enabled = item.enabled !== false;

    const label = padToWidth(item.label, maxLabel);
    const key = padToWidth(item.key, maxKey);

    let content: string;
    if (!enabled) {
      content = dim(label) + "  " + dim(key);
    } else if (isCursor) {
      content = inverse(label) + "  " + dim(key);
    } else {
      content = label + "  " + dim(key);
    }

    lines.push("│ " + content + " │");
  }

  lines.push("╰" + "─".repeat(innerWidth + 2) + "╯");
  return lines;
}

/**
 * Get the total width of a rendered context menu.
 */
export function contextMenuWidth(items: ContextMenuItem[]): number {
  const maxLabel = Math.max(...items.map((i) => stringWidth(i.label)));
  const maxKey = Math.max(...items.map((i) => stringWidth(i.key)));
  return maxLabel + maxKey + 8; // inner padding + border
}

// ── Bulk Selection ───────────────────────────────────────────────────────

/**
 * Select a range of indices (inclusive).
 */
export function selectRange(
  current: Set<number>,
  from: number,
  to: number,
): Set<number> {
  const result = new Set(current);
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  for (let i = start; i <= end; i++) {
    result.add(i);
  }
  return result;
}

/**
 * Toggle a single index in the selection.
 */
export function toggleSelection(current: Set<number>, index: number): Set<number> {
  const result = new Set(current);
  if (result.has(index)) {
    result.delete(index);
  } else {
    result.add(index);
  }
  return result;
}

/**
 * Invert the entire selection within a range.
 */
export function invertSelection(current: Set<number>, totalCount: number): Set<number> {
  const result = new Set<number>();
  for (let i = 0; i < totalCount; i++) {
    if (!current.has(i)) result.add(i);
  }
  return result;
}

/**
 * Select items matching a regex pattern.
 */
export function selectByPattern<T>(
  items: T[],
  pattern: RegExp,
  key: (item: T) => string,
): Set<number> {
  const result = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (pattern.test(key(items[i]))) {
      result.add(i);
    }
  }
  return result;
}

// ── Jump Labels ──────────────────────────────────────────────────────────

/** Character set for jump labels: 1-9, then a-z. */
const JUMP_CHARS = "123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Generate single-character jump labels for visible items.
 *
 * ```ts
 * jumpLabels(5)  // ["1", "2", "3", "4", "5"]
 * jumpLabels(12) // ["1", "2", ..., "9", "a", "b", "c"]
 * ```
 */
export function jumpLabels(count: number): string[] {
  return Array.from(
    { length: Math.min(count, JUMP_CHARS.length) },
    (_, i) => JUMP_CHARS[i],
  );
}

/**
 * Resolve a jump label character to an index.
 * Returns -1 if the character is not a valid label.
 */
export function resolveJumpLabel(char: string): number {
  const index = JUMP_CHARS.indexOf(char);
  return index;
}

/**
 * Prepend jump labels to lines for display.
 *
 * ```ts
 * renderWithJumpLabels(["Item A", "Item B"], ["1", "2"])
 * // ["1  Item A", "2  Item B"]
 * ```
 */
export function renderWithJumpLabels(
  lines: string[],
  labels: string[],
): string[] {
  return lines.map((line, i) => {
    const label = i < labels.length ? cyan(labels[i]) : " ";
    return label + "  " + line;
  });
}
