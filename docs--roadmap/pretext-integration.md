# Project Princess: Terminal Typesetting Roadmap

This roadmap outlines the strategy for transforming the Princess TUI into a high-end, reactive terminal interface by combining a **Pretext-inspired layout engine** (for layout math) and **Solid.js** (for reactive state).

> **Architectural note:** Pretext.js (`@chenglou/pretext`) is a browser-side library that depends on Canvas `measureText()` for its preparation phase. It solves proportional font layout — a problem that doesn't exist in monospace terminals where every character is exactly 1 column (or 2 for CJK/emoji). However, Pretext's *architecture* — two-phase prepare/layout separation, variable-width line iteration, rich inline segmentation, shrink-wrap search — is genuinely translatable. This roadmap adopts those patterns for a monospace + ANSI context.

---

## Phase 0: The Engine — Terminal-Native Layout Core

*Goal: Build a Pretext-inspired two-phase layout engine tuned for monospace grids and ANSI escape codes. This replaces the current ad-hoc utilities in `layout.ts` with a principled foundation everything else builds on.*

- [x] **Segment Preparation (`prepare`):** Parse text into segments (words, whitespace, ANSI escape sequences) in a single pass. Cache segment metadata (visible width, break opportunities, escape code pairs). This is the "prepare" phase — done once per text block, reused across reflows.
- [x] **Layout Pass (`layout`):** Pure arithmetic over cached segments. Given a max width, compute line breaks, line widths, and total height without allocating output strings. This is the hot path — must stay under 0.1ms for typical dossier text.
- [x] **Materialization (`materialize`):** Convert layout results into actual output strings only when rendering. Separate from layout so the renderer can decide what's visible before paying string-building costs.
- [x] **ANSI-Aware Cursors:** Port Pretext's `LayoutCursor` concept (segment index + grapheme offset) so line ranges can be described without string slicing. This enables windowed rendering — only materialize lines inside the viewport.
- [x] **Rich Inline Segments:** Support mixed-style inline runs (bold word inside dim sentence) as first-class layout items, analogous to Pretext's `RichInlineItem`. Each segment carries its own ANSI open/close codes. The layout engine wraps correctly across style boundaries without breaking escape sequences.
- [x] **Whitespace Modes:** Support `normal` (collapse + wrap), `pre-wrap` (preserve + wrap), and `pre` (preserve + no wrap) — matching Pretext's `whiteSpace` option but for terminal output.
- [x] **Double-Width Character Handling:** Detect CJK unified ideographs, fullwidth forms, and emoji via Unicode category. Count as 2 columns in all width calculations. Never break a double-width character across a line boundary.
- [x] **Reactive Integration:** Expose layout as a Solid.js `createMemo` — re-derives line breaks only when terminal `columns()` or source text changes. Layout results are signals themselves, so downstream rendering effects fire only on actual layout changes, not on every frame tick.

---

## Phase 1: The Layout Foundation (Core Display)

*Goal: Use the layout engine to gain character-perfect control over text before it hits the screen.*

- [x] **Smart Variable Wrapping:** Replace basic string slicing with engine-calculated wrapping for "Reasoning" and "Dossier" text blocks. Wrap at word boundaries, respect ANSI codes, and reflow instantly on terminal resize via cached segments.
- [x] **Dynamic Truncation (Smart Ellipsis):** Use layout arithmetic to place an ellipsis (`...`) at the optimal point in long paths, preserving the most semantic parts of the string. For paths, keep the first segment and last segment, collapse the middle: `src--cli/...ts/pipeline.ts`.
- [x] **Justified Text Blocks:** Implement full-justification for long descriptions by calculating "slack" space per line and distributing it between words for a "printed" aesthetic. Last line of each paragraph left-aligned (standard typographic convention).
- [ ] **Columnar Dossier Views:** Create multi-column layouts where text flows from one column to the next based on calculated heights. Use `walkLineRanges`-style iteration to determine the optimal split point that balances column heights.
- [x] **Hanging Indents for Tree Views:** Render directory trees with continuation lines that wrap with a hanging indent aligned to the content start, not the bullet/connector. The layout engine tracks indent depth per block.
- [x] **Responsive Breakpoints:** Define layout modes based on terminal width — compact (< 60 cols), standard (60-120), wide (> 120). Solid signals on `columns()` drive which layout strategy activates. Compact mode collapses columns to single-column flow; wide mode adds sidebar panels.
- [x] **Box Model Blocks:** Give each text block a box model: padding (inner spacing), margin (outer spacing), and optional border (box-drawing characters). The layout engine subtracts chrome from available width before wrapping content. Nested boxes subtract recursively.
- [x] **Variable-Width Line Iteration:** Port Pretext's `layoutNextLineRange()` concept — each line can have a different available width. This enables text flowing around inset panels, sidebars, or decorative elements where the content area isn't a simple rectangle.
- [x] **Balanced Text (Shrink-Wrap):** For short text blocks (titles, labels), binary-search for the narrowest width that doesn't increase line count. This avoids the "one orphan word on the last line" problem. Use `walkLineRanges`-style speculative measurement without string allocation.
- [ ] **Soft Hyphenation:** Insert soft hyphens (`\u00AD`) at syllable boundaries in long words. The layout engine breaks at these points only when necessary, displaying a visible hyphen at the break.
- [ ] **Ragged-Right Optimization:** For non-justified text, score line-break options by how "ragged" the right edge is (Knuth-Plass style penalty). Pick breaks that minimize variance in line lengths for a calmer visual texture.

---

## Phase 2: Reactive Motion (Animations & Transitions)

*Goal: Use Solid.js signals to drive frame-by-frame updates of layout-calculated positions.*

- [x] **"The Typewriter Sweep":** Animate text reveals word-by-word or line-by-line using segment indices and Solid.js timers. A `revealCursor` signal advances through prepared segments; the renderer materializes only segments up to the cursor. ANSI codes for unrevealed text render as dim placeholders.
- [ ] **Smooth Vertical Scrolling:** Implement a "Virtual Viewport" that uses layout to calculate total scrollable height and renders only the visible lines (windowing). A `scrollOffset` signal drives which line range to materialize. Sub-line scrolling simulated via partial-line clipping at top/bottom edges.
- [x] **Folding/Unfolding Sections:** Animate the opening of folder details with a smooth "push down" effect as the layout engine recalculates subsequent item positions in real-time. A `foldProgress` signal (0.0 to 1.0) interpolates between collapsed (1 line) and expanded (N lines) heights.
- [ ] **Progressive Detail Loading:** Transition from a single-line summary to a full dossier using height signals to animate container growth. Three tiers: name-only, name + confidence, full dossier with reasoning. (Uses `createFold` primitive.)
- [x] **Spring Physics for Signal Interpolation:** Wrap numeric signals in a `createSpring(signal, config)` utility that produces a smoothly interpolated output signal. Use for scroll position, fold progress, panel widths — anything that shouldn't jump instantly.
- [x] **Staggered List Animations:** When a list of proposals appears, reveal items with a per-item delay (e.g., 30ms stagger). Each item's `opacity` signal transitions from dim to full. The layout engine pre-calculates all positions so items don't shift as they appear.
- [x] **Crossfade Screen Transitions:** When switching between screens (home -> scanning -> review), crossfade by rendering both screens simultaneously, applying dim to the outgoing screen and brightening the incoming screen over ~200ms.
- [x] **Elastic Overscroll:** When scrolling past the top or bottom of a list, allow a brief "bounce" effect (2-3 lines of overscroll that spring back). Driven by a spring signal on scroll offset.
- [x] **Cursor Trail:** When moving through the review list, leave a brief dim highlight on the previous position that fades over 2-3 frames. Creates a sense of motion direction.
- [ ] **Resize Reflow Animation:** When the terminal is resized, don't snap to the new layout instantly. Animate the transition as lines reflow — text slides to new positions over ~150ms. Possible because cached segments make re-layout nearly free.
- [x] **"Breathing" Idle Animation:** When the TUI is idle (waiting for user input), subtly pulse the border or header brightness on a slow sinusoidal cycle. Signals life without being distracting.

---

## Phase 3: Information Visualization (Conveying Ideas)

*Goal: Turn raw data into visual patterns directly within the text flow.*

- [x] **Sparkline Integration:** Embed tiny, layout-aligned bar charts inside text blocks (e.g., `[████░░░] 70% TS`). The layout engine treats the sparkline as an atomic inline segment with a fixed column width.
- [x] **Breadcrumb Shrinking:** Progressively collapse parent folders in long paths (e.g., `s/c/s/u/b/Button.tsx`) using layout to determine the exact fit for the current width. Collapse deepest segments first to preserve the most context.
- [x] **Diff-Highlighting:** Animate "pulses" or highlights on specific character offsets when showing renames (e.g., highlighting only the `--pure-ts` suffix). Compute the minimal edit distance between old and new names; highlight only the changed segments.
- [x] **In-Line Search Highlighting:** Use layout cursors to find exact line and character offsets for search matches within wrapped text, allowing the UI to underline or invert matches even when they span a line break.
- [x] **Braille-Resolution Charts:** Use Unicode Braille characters (2x4 dot grid per cell) for high-resolution inline visualizations. A single terminal row can show 4 vertical data points. Render file-type distribution, confidence histograms, or directory depth profiles at 2x the vertical resolution of block characters.
- [x] **Tree Connection Lines:** Draw proper box-drawing connectors (`├──`, `└──`, `│`) for directory tree views. The layout engine tracks depth and sibling position so connectors align perfectly even when content wraps to multiple lines. Last-child detection switches `├` to `└`.
- [x] **Confidence Heat Gradient:** Map confidence scores (0.0-1.0) to a color gradient using 256-color or truecolor ANSI. Low confidence = warm (red/yellow), high confidence = cool (green/cyan). Apply to backgrounds, text, or inline indicator blocks.
- [x] **File-Type Distribution Bars:** For each directory dossier, show a proportional horizontal bar of file types using colored block characters: `████████░░░░` where each color represents .ts, .js, .json, etc. Layout engine ensures the bar fits available width.
- [x] **Unicode Block-Element Heatmaps:** Use block elements (`▁▂▃▄▅▆▇█`) to render compact heatmaps of directory activity, file sizes, or nesting depth. Each character encodes a value in 8 levels within a single cell.
- [x] **Inline Confidence Notches:** Instead of numeric confidence, show a 5-notch gauge using custom characters: `[●●●●○]` for 80%. Layout engine sizes the gauge as an atomic inline block.
- [x] **Side-by-Side Rename Preview:** Show old and new directory names in adjacent columns with diff-highlighted segments. The layout engine calculates column widths dynamically — wider name gets more space, up to 60/40 split.
- [x] **Mini Directory Fingerprints:** Generate a tiny visual "fingerprint" per directory using Braille characters based on its file composition. Directories with similar structures produce visually similar patterns — a glanceable similarity signal.

---

## Phase 4: High-End Aesthetics (Display Polish)

*Goal: Use ANSI colors and shades to simulate depth, focus, and state.*

- [x] **Focus Dimming:** Use Solid.js to track the active dossier and apply `dim` ANSI codes to all other layout-calculated blocks, creating visual depth. The focused item renders at full brightness; items further from focus get progressively dimmer.
- [x] **Status "Glow" Pulses:** Animate subtle color pulses for "Low Confidence" warnings that perfectly wrap around specific text boundaries. A sinusoidal signal modulates the foreground color between the base and a brighter variant.
- [x] **Skeleton Loading States:** Display "Skeleton" lines (blocks of `░░░`) that match the exact layout of expected dossiers to prevent layout jank during inference. Skeleton dimensions come from `measureLineStats`-style pre-calculation with placeholder text.
- [x] **Marquee Overflows:** For folder names that cannot fit even with shrinking, use Solid signals to "scroll" the text back and forth within its layout boundary. A `marqueeOffset` signal oscillates; the renderer applies a sliding window over the prepared text.
- [x] **Truecolor Gradient Text:** Render titles and headers with smooth RGB gradients across characters. Compute per-character `rgb(r,g,b)` ANSI codes that interpolate between two or three key colors. Degrade gracefully to 256-color or plain on unsupported terminals.
- [x] **Box-Drawing Panel Frames:** Wrap content sections in box-drawing character frames (`╭─╮│╰─╯` for rounded, `┌─┐│└─┘` for sharp). The layout engine reserves border columns and rows; content wraps within the inner dimensions. Double-line variants (`╔═╗║╚═╝`) for emphasized panels. *(Implemented in Phase 1 via `box()` in typeset-compose.ts.)*
- [x] **Drop Shadow Simulation:** Render a 1-character shadow on the right and bottom edges of panels using dim block characters (`░` or spaces with dark background). Creates a floating-panel illusion. The layout engine accounts for shadow width in positioning.
- [x] **Depth-of-Field Blur:** Combine `dim` + desaturated colors (gray instead of colored) for background elements. Foreground panel is sharp and vibrant; panels behind it are dim and monochrome. Driven by a `zIndex` signal per panel.
- [x] **Contextual Color Theming:** Different pipeline stages get distinct color palettes — scanning is blue/cyan, inference is purple/magenta, review is yellow/amber, applying is green. Transition between palettes on stage change using crossfade signals.
- [x] **ASCII Art Header:** Render the Princess title in a small ASCII art font on the home screen. Precompute the layout as a fixed block; the layout engine treats it as a multi-line atomic element. *(Implemented in initial TUI build — LOGO arrays in home.ts/welcome.ts.)*
- [x] **Subtle Noise Texture:** On wide empty backgrounds, add a very subtle pattern of alternating `·` and ` ` (or dim Braille dots) to break up blank space. The pattern is deterministic (seeded by position) so it doesn't flicker on rerender.
- [x] **Status Bar with Live Metrics:** A persistent bottom-of-screen status bar showing elapsed time, memory usage, directory count, and current operation. Rendered as a separate layout region with its own width calculation, independent of the main content scroll.

---

## Phase 5: Advanced Composition (Panels & Layering)

*Goal: Move beyond single-stream rendering to composited, multi-region layouts.*

- [ ] **Z-Layer Compositing:** Render the TUI as a stack of layers (background, content, overlay, modal). Each layer is a separate layout pass. Compose them top-down, with upper layers overwriting lower layers cell-by-cell. Transparent cells (null) pass through.
- [ ] **Floating Detail Panels:** On review screen, pressing a key on a proposal opens a floating panel beside or over the list showing the full dossier, reasoning, and file samples. The panel is a separate layout region with its own scroll state, positioned relative to the cursor.
- [ ] **Modal Dialogs with Backdrop:** Confirmation prompts ("Apply 12 renames?") render as centered modal boxes with a dimmed backdrop. The backdrop is the previous screen rendered through a dim filter. Modal captures all input until dismissed.
- [ ] **Split-Pane Layouts:** On wide terminals (> 120 cols), show the proposal list on the left and the detail panel on the right simultaneously. A `splitRatio` signal controls the divider position. The layout engine gives each pane its own width for independent text wrapping.
- [ ] **Picture-in-Picture Progress:** During the apply phase, show a small inset panel in the corner with the overall progress summary while the main area shows per-file detail. The inset is a separate layout region composited onto the main frame.
- [ ] **Tabbed Content Regions:** Within the detail panel, support tabs (Dossier | Files | Reasoning | Diff) that switch the panel content without affecting the outer layout. Each tab is a pre-laid-out block; switching is a signal change with crossfade.
- [ ] **Resizable Panels:** Allow the user to resize split panes with keyboard shortcuts (e.g., `[` and `]`). The `splitRatio` signal animates via spring interpolation to the new value. Both panes reflow simultaneously using cached segments.
- [ ] **Toast Notifications:** Non-blocking notifications ("Scan complete", "3 low-confidence proposals") that slide in from the top-right, persist for 3 seconds, then fade out. Each toast is a composited overlay with its own lifecycle signals.

---

## Phase 6: Interaction & Input Enrichment

*Goal: Make the TUI feel responsive and tactile beyond basic key handling.*

- [ ] **Fuzzy Search with Live Layout:** Add a `/` search mode that filters proposals in real-time. The layout engine reflows the visible list as items are filtered, with non-matching items collapsing out (animated via fold signals). Matched substrings highlighted inline.
- [ ] **Keyboard Chord Sequences:** Support multi-key commands (e.g., `g g` to jump to top, `g e` to jump to end, like Vim). A `pendingChord` signal shows the partial chord in the status bar and times out after 500ms.
- [ ] **Inline Editing of Names:** Allow the user to press `e` on a proposal to edit the suggested name directly in the list. The layout engine switches that row from display mode to an input field with cursor, selection, and ANSI-highlighted text.
- [ ] **Bulk Selection Patterns:** Select ranges with Shift+arrow, regex-select with `:select /pattern/`, invert selection with `!`. Selection state is a per-item signal; the layout engine renders selected items with an inverted or highlighted background.
- [ ] **Context Menus:** On a selected proposal, pressing `m` opens a small floating menu (Approve / Reject / Edit / Show Reasoning / Compare). Rendered as a composited overlay anchored to the cursor position.
- [ ] **Undo/Redo Stack:** Each approval, rejection, or edit pushes to an undo stack. `u` undoes, `Ctrl+r` redoes. The layout engine handles item re-insertion with fold-in animation.
- [ ] **Hover Preview on Cursor Move:** When the cursor moves to a new proposal, start a delayed (200ms) preview expansion that shows the first 3 lines of reasoning. If the cursor moves away before 200ms, cancel. Driven by a debounced signal.
- [ ] **Jump-to-Index:** Press a number (1-9) or letter (a-z) to jump directly to that item in the visible list. Show the index labels in the left gutter when a jump-prefix key is held.

---

## Phase 7: Accessibility & Resilience

*Goal: Ensure the TUI is usable in every terminal environment and for every user.*

- [ ] **Graceful Capability Degradation:** Detect terminal capabilities at startup (truecolor, 256-color, 16-color, no color; Unicode, ASCII-only; alternate screen support). Every visual feature has a fallback chain. Braille charts fall back to `#` bars; box-drawing falls back to `+-|`; gradients fall back to bold/dim.
- [ ] **Screen Reader Announcements:** When the terminal is detected as non-interactive or when a `--accessible` flag is passed, output semantic plain-text descriptions instead of ANSI art. "Scanning directory 4 of 12: src/components" instead of a spinner and progress bar.
- [ ] **High-Contrast Mode:** A `--high-contrast` flag that disables dim text, replaces gradients with solid colors, and uses bold + underline instead of color for emphasis. Test against WCAG AAA contrast ratios on both light and dark backgrounds.
- [ ] **Reduced-Motion Mode:** Respect `REDUCE_MOTION=1` env var or `--no-animation` flag. All springs resolve instantly, all transitions snap, all pulses/marquees are static. The layout is identical; only temporal behavior changes.
- [ ] **Piped Output Mode:** When stdout is not a TTY, output structured plain text (or JSON with `--json`) instead of ANSI. The layout engine still runs but materializes without escape codes. This makes Princess composable in shell pipelines.
- [ ] **Terminal Size Floor:** Define a minimum viable terminal size (e.g., 40x12). If the terminal is smaller, show a centered message asking to resize rather than rendering a broken layout. The layout engine refuses to reflow below the floor.
- [ ] **Color Scheme Detection:** Detect whether the terminal background is light or dark (via `COLORFGBG` env var, OSC 11 query, or `--light`/`--dark` flag). Adjust the color palette so text remains legible on both backgrounds.
