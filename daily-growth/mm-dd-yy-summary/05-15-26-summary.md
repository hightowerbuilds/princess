# Daily Summary - May 15, 2026

## Overview
Today started a new workstream: a code-quality pass over the entire Princess codebase, followed by planning a new HTML-based prompt authoring surface. The session began with a full read-through of the project to build a complete mental model, then a focused review that surfaced concrete defects and rough edges. The findings were turned into an actionable roadmap so the cleanup and the new feature can be sequenced cleanly.

Key achievements:
- **Full Codebase Read-Through**: Walked the entire `src/` tree (CLI, prompts, storage, revisions, paths) and the TUI tree (state, renderer, app loop, input parser, view modules, typesetting and aesthetics utilities). Produced a working summary of the architecture, the agent contract, and the current limitations.
- **Quality Review**: Ran `bunx tsc --noEmit` and read the hot paths. Surfaced four real bugs — a missing import (`sanitizePromptTitle` in `src/tui/app.ts:822`), a revision-signal type that drops `added`/`removed` fields, a dead `Ctrl+S` block, and an unreachable `?` help hotkey — plus a longer list of code-quality and architectural issues.
- **Roadmap Created**: Added `daily-growth/roadmaps/2026-05-code-quality-and-html-prompts.md`. It splits the work into Phase 1 (code quality) and Phase 2 (HTML prompt builder), captures bugs vs. quality items vs. architectural decisions, and lists open questions (V1–V6) that the HTML feature should answer before any code is written.
- **Sequencing Decision**: Agreed to gate Phase 2 on closing the four runtime bugs and resolving the toolkit-prune question, so the new feature is not built on a fragile baseline.

## Key Learnings
- **The `activeKeyResolver` Pattern Is the Common Cause**: Several of the subtler bugs trace back to a single module-level mutable resolver in `src/tui/app.ts`. The pattern works for a few screens but is already the source of fragility; it should be revisited before adding HTML-related modal flows.
- **The Typecheck Has Been Drifting**: `bunx tsc --noEmit` reports six errors in `main` today. Restoring a clean typecheck is the cheapest correctness win available, and it doubles as a regression gate.
- **The TUI Toolkit Is Larger Than the App**: Roughly 5,000 lines of typesetting, motion, compositor, and aesthetics code support a UI that uses a small slice of it. Before adding more UI surface, the toolkit should be pruned or formally extracted.

## Challenges Overcome
- **Distinguishing Bugs From Style**: The first read surfaced many things that *looked* wrong; the second pass with the typechecker confirmed which ones actually break at runtime. The roadmap reflects that distinction explicitly so cleanup work has a clear definition of done.
- **Holding Scope on Phase 2**: HTML prompts could easily sprawl into rendering, templating, validation, and remote sync. The roadmap pins anti-goals up front (no browser preview, no DB, no mandatory migration) so the conversation stays focused.

## Execution Progress (later same day)
- **Phase 1.1 bugs landed (B1–B4):** Added the missing `sanitizePromptTitle` import, re-typed the revision signal as `PromptRevision[]`, deleted the unreachable trailing `Ctrl+S` block, and rewrote `isHelpHotkey` so `?` and `Ctrl+/` both actually open help. `bunx tsc --noEmit` is clean; all 12 test suites (788 tests) pass.
- **Architectural cleanup A1 step 1:** Deleted eight orphan source files plus four orphan test files (`compositor`, `interaction`, `accessibility`, `visualize`, `typeset-reactive`, `layout`, `stages`, `progress`) — roughly 4,400 lines. Removed a dead `gradientText` import in `views/inbox.ts`. Dropped the `exclude` key from `tsconfig.json` and removed four entries from the test chain in `package.json`. Eight remaining test suites (472 tests) still pass.
- **Roadmap updated:** A1 step 2 (intra-file pruning) carved out as a new Q15 item so the remaining toolkit shrink can land one file at a time.

## Phase 1.5 Adopted (later same day)
Walking through Q15 (intra-file prune of `motion.ts`) surfaced a more interesting question: why is the toolkit so verbose, and should we be leaning on Solid more inside the TUI? A short audit confirmed the suspicion — the project depends on SolidJS but only `state.ts` and `renderer.ts` actually use it. The behavior layer (`app.ts`) is ~1,000 lines of imperative code on top of a reactive runtime: a module-level `activeKeyResolver`, hand-rolled debounce, manual `batch()` calls, ad-hoc filtered-list recomputation.

That insight reframes the cleanup work. Three changes landed in the roadmap:
- **New Phase 1.5 added** — an imperative→reactive port covering four ports: store-ify `state.ts` (P1), kill `activeKeyResolver` and drive dispatch off `state.screen()` (P2), collapse the editor save loop into a single `createEffect` (P3), promote derived inbox/editor data to `createMemo` (P4). Anti-goals (disk I/O, terminal stream writes, input parsing) are pinned so scope stays tight.
- **Q15 halted.** The kept-set for `motion.ts` / `aesthetics.ts` cannot be decided until the reactive UI is built — the primitives we'd delete today may be the vocabulary the new code actually uses tomorrow.
- **Q1 and A3 subsumed.** The Q1 refactor and A3 decision are both now part of Phase 1.5/P2.

## Phase 1.5/P1 Landed (later same day)
- **Store-ified `state.ts`.** Replaced the ~25 `createSignal` pairs with a single `createStore<TuiStore>` and explicit type interfaces for each slice (`TerminalState`, `InboxState`, `EditorState`, `DiffState`, `RevisionsState`). The motion pulses (`idlePulse`, `logoPulse`) live alongside the store, not inside it, because their internal signals are owned by their own primitive.
- **Migrated every reader.** `renderer.ts`, all six view modules (`inbox`, `editor`, `diff`, `revisions`, `revision-preview`, `help`), `tui.ts`, `app.ts`, and `views.test.ts` switched from `state.foo()` to `state.state.foo` reads and from `state.setFoo(x)` to `state.setState("group", "field", x)` writes. Roughly 170 call sites changed; most were single-pattern replacements done with `Edit replace_all`.
- **Test suite green at 9 suites / 506 tests.** That includes the new `test:html-prompts` suite the parallel agent landed (32 tests). `bunx tsc --noEmit` clean.
- **Q11 (unused `os` import) cleaned up incidentally**, and the dead initial-frame block in `renderer.ts` (Q8) came out along the way.

## Tomorrow's Focus
- Phase 1.5/P3 — collapse the editor save loop (~50 imperative lines: `saveTimer` / `lastSavedContent` / `saving` / `flushSave` / `scheduleSave`) into a single `createEffect` with `onCleanup` for debounce cancellation. This is the smallest port and the one that most visibly demonstrates the Solid readability win.
- Then P4 (`createMemo` for derived inbox/editor data), then P2 (kill `activeKeyResolver` — the largest blast radius, deliberately last).
- Defer V1–V6 (HTML prompt questions) until Phase 1.5 ships. The parallel HTML prompt work is landing storage + parsing, which is a clean substrate; the UI integration will be much cleaner once the reactive layer is in place.
