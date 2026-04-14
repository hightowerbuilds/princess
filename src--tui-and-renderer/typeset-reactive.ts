/**
 * typeset-reactive.ts — SolidJS integration for the typesetting engine.
 *
 * Wraps prepare/layout/materialize in a reactive memo chain:
 *
 *   text changes   → re-prepare (re-segment, most expensive)
 *   width changes  → re-layout  (arithmetic only, cheap)
 *   layout changes → re-materialize (string building, per visible line)
 *
 * Each phase only recomputes when its specific inputs change.
 */

import { createMemo, type Accessor } from "solid-js";
import {
  prepare,
  layout,
  materializeToStrings,
  measureLineStats,
  balancedWidth,
  type PrepareOptions,
  type PreparedText,
  type LayoutResult,
  type LineStats,
} from "./typeset.ts";

/** A fully reactive text layout bound to signals. */
export interface ReactiveLayout {
  /** Cached prepared text — recomputes only when source text changes. */
  prepared: Accessor<PreparedText>;
  /** Layout result — recomputes when prepared text or width changes. */
  result: Accessor<LayoutResult>;
  /** Materialized output lines — recomputes when layout changes. */
  lines: Accessor<string[]>;
  /** Number of laid-out lines. */
  lineCount: Accessor<number>;
  /** Width of the widest line. */
  maxLineWidth: Accessor<number>;
}

/**
 * Create a reactive layout that automatically reflows when text or
 * terminal width changes.
 *
 * ```ts
 * const [text, setText] = createSignal("hello world");
 * const cols = () => state.columns();
 *
 * const { lines, lineCount } = createLayout(text, cols);
 *
 * // In a renderer effect:
 * createEffect(() => {
 *   for (const line of lines()) {
 *     // render line
 *   }
 * });
 * ```
 */
export function createLayout(
  text: Accessor<string>,
  maxWidth: Accessor<number>,
  options?: PrepareOptions,
): ReactiveLayout {
  // Phase 1: prepare (re-runs only when text changes)
  const prepared = createMemo(() => prepare(text(), options));

  // Phase 2: layout (re-runs when prepared text OR width changes)
  const result = createMemo(() => layout(prepared(), maxWidth()));

  // Phase 3: materialize (re-runs when layout changes)
  const lines = createMemo(() => materializeToStrings(prepared(), result()));

  // Derived accessors (free — just read from result memo)
  const lineCount = createMemo(() => result().lineCount);
  const maxLineWidth = createMemo(() => result().maxLineWidth);

  return { prepared, result, lines, lineCount, maxLineWidth };
}

/**
 * Create a reactive layout that auto-balances line widths to avoid
 * orphan words on the last line.
 *
 * Uses binary search to find the narrowest width that preserves the
 * line count at maxWidth.
 */
export function createBalancedLayout(
  text: Accessor<string>,
  maxWidth: Accessor<number>,
  options?: PrepareOptions,
): ReactiveLayout {
  const prepared = createMemo(() => prepare(text(), options));

  // Find optimal width, then lay out at that width
  const optimalWidth = createMemo(() => balancedWidth(prepared(), maxWidth()));
  const result = createMemo(() => layout(prepared(), optimalWidth()));
  const lines = createMemo(() => materializeToStrings(prepared(), result()));
  const lineCount = createMemo(() => result().lineCount);
  const maxLineWidth = createMemo(() => result().maxLineWidth);

  return { prepared, result, lines, lineCount, maxLineWidth };
}

/**
 * Reactive line stats without full materialization.
 * Useful for calculating heights before deciding what to render.
 */
export function createLineStats(
  text: Accessor<string>,
  maxWidth: Accessor<number>,
  options?: PrepareOptions,
): Accessor<LineStats> {
  const prepared = createMemo(() => prepare(text(), options));
  return createMemo(() => measureLineStats(prepared(), maxWidth()));
}
