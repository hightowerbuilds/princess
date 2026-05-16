# Roadmap: Code Quality Pass + HTML Prompt Builder

Created: 2026-05-15
Status: Active

This roadmap captures two adjacent workstreams:

1. **Phase 1 — Code Quality Pass.** A focused cleanup of bugs and rough edges discovered in a full read-through of the current codebase. The goal is to land on a clean baseline before adding new product surface.
2. **Phase 2 — HTML Prompt Builder.** A new authoring surface that lets users (and agents) compose prompts using HTML structure rather than only plain Markdown bodies.

Phase 1 should be completed (or at least merged in a known state) before Phase 2 work begins, so that the new feature is not built on top of latent runtime bugs.

After Phase 1 landed, a structural review surfaced a third workstream that belongs in the middle: **Phase 1.5 — Imperative → Reactive Port.** The behavior layer in `src/tui/app.ts` is ~1,000 lines of imperative code running on top of a SolidJS runtime that could be doing most of that work. Phase 1.5 ports the layer to reactive idioms (store-ified state, `state.screen()`-driven dispatch, `createEffect`-based save loop, `createMemo` for derived data) so Phase 2 lands on the right substrate.

---

## Phase 1 — Code Quality Pass

### 1.1 Bugs (must-fix)

These are real defects confirmed by `bunx tsc --noEmit` and by static reading. They block confidence in the existing feature set.

All four landed on 2026-05-15 in a single pass. `bunx tsc --noEmit` is clean and all 12 test suites pass (788 tests).

- **B1. ✅ Done (2026-05-15).** Missing import in `src/tui/app.ts`. Added `sanitizePromptTitle` to the `../prompts.ts` import.
- **B2. ✅ Done (2026-05-15).** Revision signal type in `src/tui/state.ts` is now `PromptRevision[]` (imported from `../revisions.ts`), so the `added` / `removed` deltas render again.
- **B3. ✅ Done (2026-05-15).** Removed the unreachable trailing `if (key.name === "s" && key.ctrl)` block in the editor key handler.
- **B4. ✅ Done (2026-05-15).** `isHelpHotkey` now matches `?` (no modifiers) and `ctrl+/` explicitly, instead of relying on the unreachable `"/" && shift` path.

### 1.2 Quality issues (should-fix)

These are not crashes, but they make the code fragile, ambiguous, or hard to extend safely.

- **Q1. → Subsumed by Phase 1.5/P2.** `src/tui/app.ts` is ~1000 lines with a single module-level `activeKeyResolver`. Every `waitForX` reassigns it; "resume" handlers stash and restore it manually. This is the source of subtle screen-transition bugs. *Originally:* split each screen's wait function into its own file. *Now:* delete the resolver entirely and drive dispatch off `state.screen()` per Phase 1.5/P2.

- **Q2. Usage text duplicated between `--help` and the unknown-command default in `src/cli/index.ts`.**
  About 15 identical lines printed twice.
  *Action:* Extract a single `printUsage()`.

- **Q3. `createClaudeMd` in `src/cli/index.ts:222` is non-atomic and loose on dedupe.**
  Reads then writes without `atomicWriteFile`; dedupe check `includes("## Princess") || includes("Princess")` matches any incidental mention.
  *Action:* Use `atomicWriteFile`; tighten the dedupe sentinel to the section header only.

- **Q4. `calculateDeltas` in `src/revisions.ts:50–68` uses `Set`-based counts.**
  Duplicate lines collapse, so deleting one of two identical lines reports `0 removed`.
  *Action:* Switch to multiset counts or a proper LCS-based diff summary.

- **Q5. External-file revision dir collides on basename in `src/revisions.ts:21`.**
  Two files named `foo.md` under different parents share `revisions/external/foo.md`.
  *Action:* Hash the full source path, or refuse to record revisions for external files.

- **Q6. `src/tui/input.ts:142–151` silently drops non-ASCII bytes.**
  A Markdown editor that cannot accept `—`, curly quotes, accented characters, or emoji is a meaningful limitation.
  *Action:* Buffer UTF-8 multi-byte sequences and emit a single `KeyEvent` per code point.

- **Q7. `src/tui/input.ts:161` only detects `shift` for letters.**
  Symbol shift state is never reported, which feeds B4 and any future shift-aware logic.
  *Action:* Derive `shift` from the raw byte / scancode.

- **Q8. Dead initial-frame fallback in `src/tui/renderer.ts:64–80`.**
  `createEffect` runs synchronously on creation and flips `firstFrame` to `false` already; the second `if (firstFrame)` block never executes.
  *Action:* Remove the block.

- **Q9. CRLF frontmatter parse off by one in `src/prompts.ts:97`.**
  `frontmatterBlock = content.slice(content.indexOf("\n") + 1, endIdx)` discards a `\r` for CRLF input. There is also no escaping when writing frontmatter — a title containing `:\n` produces malformed metadata.
  *Action:* Normalize line endings before slicing; escape `:` and newlines on write or quote the value.

- **Q10. `create-prompt` is a UX dead end on collision in `src/cli/index.ts:143`.**
  `wx` flag produces "already exists" with no fallback.
  *Action:* Auto-suffix `-2.md`, or add `--overwrite` and `--force` flags.

- **Q11. ✅ Done (2026-05-15).** Removed during the Phase 1.5/P1 port.

- **Q12. Stale `AGENT_INSTRUCTIONS.md` at repo root.**
  Canonical version is now generated by `getAgentInstructions(inboxDir)`.
  *Action:* Delete the root file, or convert it into the template source that `getAgentInstructions` reads.

- **Q13. `package.json` test script chains 12 commands with `&&`.**
  First failure short-circuits the rest; runs serially; no shared harness.
  *Action:* Consolidate behind `bun test` or a single test runner script.

- **Q14. Magic numbers in `src/tui/app.ts` and `src/tui/renderer.ts`.**
  Save debounce 1200 ms, frame budget 16 ms, list-height overhead offsets, breathing periods.
  *Action:* Promote to named constants in a small `constants.ts`.

- **Q15. ⏸ Halted (2026-05-15).** Intra-file pruning of the remaining toolkit is on hold pending Phase 1.5. The decision was that `motion.ts` / `aesthetics.ts` exports are not "dead code" — they are the *vocabulary* a properly reactive UI would actually use. Prune only after Phase 1.5 has rewritten the imperative layer and the kept-set has stabilized.

### 1.3 Architectural decisions (gate Phase 2)

- **A1. ✅ Step 1 done (2026-05-15).** Deleted eight orphan source files plus four orphan test files (`compositor`, `interaction`, `accessibility`, `visualize`, `typeset-reactive`, `layout`, `stages`, `progress`) — roughly 4,400 lines. Removed the dead `gradientText` import from `src/tui/views/inbox.ts`. Updated `tsconfig.json` to drop the `exclude` key. Updated `package.json` to drop four test scripts from the chain. Remaining eight test suites (472 tests) still pass.

  *Step 2 deferred → tracked as Q15 below:* intra-file pruning of `motion.ts` (only `createBreathingPulse` used), `aesthetics.ts` (only `dropShadow`, `gradientTextMulti`), `typeset.ts` (only `prepare`, `layout`, `materializeToStrings`, `stringWidth`), and `typeset-compose.ts` (only `truncateEnd`, `box`).

- **A2. ✅ Done (2026-05-15).** `stages.ts` and `progress.ts` deleted as part of A1; `exclude` key removed from `tsconfig.json`.

- **A3. ✅ Decided (2026-05-15).** `activeKeyResolver` will be deleted entirely, not refactored in place. The replacement is `state.screen()` as the dispatch axis with per-screen pure key handlers. This decision is now Phase 1.5 below.

### 1.4 Suggested execution order

1. ✅ Land all four bugs (B1–B4) plus the type fix together as a single small change. *(Done 2026-05-15.)*
2. ✅ Decide A1 and A2; act on them. *(Step 1 done 2026-05-15. Step 2 = Q15 now halted pending Phase 1.5.)*
3. ▶ Execute Phase 1.5 — the imperative→reactive port (see below).
4. Revisit Q15 with concrete keep/drop reasoning informed by Phase 1.5.
5. Tackle remaining quality items Q2–Q14 opportunistically.
6. Gate Phase 2 on Phase 1.5 being complete.

### 1.5 Definition of done for Phase 1

- `bunx tsc --noEmit` is clean.
- All four bugs are fixed and there is at least one test covering each.
- Either A1 has been executed or a written decision exists in this roadmap to defer it.
- `package.json` test script runs all suites to completion regardless of individual failures.

---

## Phase 1.5 — Imperative → Reactive Port

### 1.5.1 Why this exists

A read of `src/tui/app.ts` against the rest of the codebase revealed a structural mismatch: the project depends on SolidJS, but only `state.ts` and `renderer.ts` actually use it. The behavior layer (`app.ts`) is roughly 1,000 lines of imperative code — module-level mutable state, promise-chain screen transitions, hand-rolled debounce, manual `batch()` calls — sitting on top of a reactive runtime that could be doing most of that work for free.

This is also the root cause of several Phase 1 items: B3 and B4 both came out of the `activeKeyResolver` global; Q1 is the same observation framed as a refactor; Q14's magic-numbers cluster lives in the same code; A3 was an explicit decision gate on this question.

The goal of Phase 1.5 is to **port the imperative layer to reactive idioms before adding any new feature surface.** HTML prompt building (Phase 2) would otherwise inherit the same patterns.

### 1.5.2 The four ports

- **P1. ✅ Done (2026-05-15).** `state.ts` is a single `createStore<TuiStore>` with grouped slices (`terminal`, `inbox`, `editor`, `diff`, `revisions`, `error`, `hardwareCursor`, `screen`). All readers (`renderer.ts`, the six view modules, `app.ts`, `tui.ts`, `views.test.ts`) migrated from `state.foo()` to `state.state.foo` reads and from `state.setFoo(x)` to `state.setState("group", "field", x)` writes. The motion pulses (`idlePulse`, `logoPulse`) stay as standalone primitives next to the store. `bunx tsc --noEmit` clean; all 9 test suites (506 tests including the parallel-built HTML prompt suite) pass. Q11 (unused `os` import in `app.ts`) cleaned up incidentally.

- **P2. ✅ Done (2026-05-16).** `activeKeyResolver`, the `KeyResolver` type, and all six `waitForX` promise-wrapping functions are deleted. `handleKey` is now a screen-dispatch router that reads `state.state.screen` and routes to one of six pure per-screen handlers (`handleInboxKey`, `handleEditorKey`, `handleDiffKey`, `handleRevisionsKey`, `handleRevisionPreviewKey`, `handleHelpKey`). Help-hotkey is checked as a pre-handler. Screen transitions are now plain `state.setState("screen", X)` mutations.
  - **State additions.** `running: boolean` (false ends `runApp`). `overlay: { helpReturnTo: AppScreen | null }` captures the screen the help overlay should return to (replaces the old `resumeResolver` stash).
  - **`runApp` restructured.** Was a `while (true)` loop awaiting `waitForX` promises; now a single setup pass that wraps two long-lived effects in a `createRoot`: (a) the editor save loop (P3 logic, moved out of `waitForEditor`), and (b) a `createEffect` that watches `(screen, inbox.directory)` and calls `loadInboxFiles` whenever the user returns to the inbox or changes directory. The function then awaits a single Promise that resolves when `running` flips false.
  - **Save loop lifecycle.** Was per-session (created inside `waitForEditor`'s Promise body). Now app-lifetime, with an explicit `resetBaseline()` called by `openEditorFile` so re-opening the same file path still primes a fresh baseline. Save effect short-circuits when `screen !== "editor"`, so navigating to diff/revisions doesn't trigger autosaves.
  - **Stash/restore eliminated.** The old `resumeEditor = activeKeyResolver` / `... activeKeyResolver = resumeEditor` pattern (used in three places — diff entry, revision-browser entry, help overlay) is replaced by simple screen mutations. Diff always returns to editor; revision-preview always returns to revisions; help returns via `overlay.helpReturnTo`.
  - **Net.** `src/tui/app.ts` from ~986 lines to ~896, but the structural improvement is bigger than the diff — six promise wrappers (~300 lines combined) removed, the module-level mutable resolver gone, three stash/restore patterns gone.
  - `bunx tsc --noEmit` clean; all 9 suites (510 tests) pass.

- **P3. ✅ Done (2026-05-16).** Replaced the `saveTimer` / `lastSavedContent` / `saving` / `flushSave` / `scheduleSave` / `cancelSaveTimer` machinery in `waitForEditor` with: (a) a single `save(forceSnapshot)` async helper that serializes via `while (inFlight) await inFlight` (so Ctrl+S now actually honors the force-snapshot intent even mid-debounce, where the old code would drop it), (b) a `createEffect` owned by a per-session `createRoot` that watches `state.state.editor.content` and schedules a debounced save with `onCleanup` clearing the timer on re-run or dispose, (c) an explicit `cancelPending()` for screen transitions and a `disposeSaveEffect()` called on escape. `SAVE_DEBOUNCE_MS` lifted out as a constant (partial Q14). Removed `scheduleSave()` call from the keystroke tail — typing the dirty flag stays; the effect drives the timer. `bunx tsc --noEmit` clean; all 9 suites (510 tests) pass.

- **P4. ✅ Done (2026-05-16).** Two `createMemo`s now live in `createTuiState`:
  - **`editorParsedPrompt`** memoizes `parsePromptDocument(editor.content)`. Previously the editor view re-parsed on *every* render — terminal resize, save state flip, cursor move all triggered a fresh parse. Now it only re-runs when `editor.content` actually changes.
  - **`inboxFilteredSearch`** filters a raw `inbox.searchEntries` list against `inbox.searchQuery` and emits `InboxEntry[] | null`. Returns `null` outside of search (so callers fall back to `inbox.files`).
  - **Search loop restructured.** Added `inbox.searchEntries: PromptSearchEntry[]` to the store plus `loadSearchEntries(state, baseInboxDir)` that does the recursive walk *once* per search session (kicked off when the user presses `/`). Search keystrokes (chars, space, backspace) now mutate `searchQuery` in place — no more `resolve("refresh")` per keystroke, no more recursive disk walk per keystroke. The query-branch of `loadInboxFiles` is gone; `loadInboxFiles` is now strictly "load current directory."
  - **View wiring.** `views/inbox.ts` and `app.ts` (three call sites) read `state.inboxFilteredSearch() ?? state.state.inbox.files`. `views/editor.ts` reads `state.editorParsedPrompt()`.
  - The roadmap's "Net: search/scroll/filter stop touching `loadInboxFiles`" is now true.
  - Revision delta annotations were *not* memoized: they are already pre-computed at load time in `revisions.ts` and never recomputed per render.
  - `bunx tsc --noEmit` clean; all 9 suites (510 tests) pass.

### 1.5.3 What stays imperative

Some pieces should not be ported, and naming them prevents scope creep:

- **Disk I/O.** `readFile`, `writeFile`, `mkdir`, `rename` stay imperative behind async functions. Effects *invoke* them; the I/O itself is not reactive.
- **The terminal escape sequence stream.** Frame writes via `process.stdout.write` are a side effect, not a derivation. The single `createEffect` in `renderer.ts` is the right boundary.
- **Input parsing.** `input.ts` decodes raw bytes to `KeyEvent`s. That is sequential and stateful (escape-sequence buffering); reactive idioms add nothing.

### 1.5.4 Execution order inside Phase 1.5

1. ✅ P1 (store-ify state) first. Everything else builds on it.
2. ✅ P3 (save loop) second — small, self-contained, immediate readability win, validates the pattern.
3. ✅ P4 (derived data via `createMemo`) third — same shape as P3, lower-stakes.
4. ✅ P2 (kill `activeKeyResolver`) last — the largest blast radius, done once P1/P3/P4 had proven the pattern.

Each port lands as its own change with the test suite green at each step.

### 1.5.5 What this unlocks

- **Phase 2 (HTML prompts) gets the right substrate.** A reactive form is a `createMemo` from form state to rendered HTML to flattened-prompt-text. None of that should be hand-coded against a 1,000-line key dispatcher.
- **Q15 (intra-file prune) becomes answerable.** Once the reactive UI exists, the kept-set of `motion.ts` / `aesthetics.ts` / `typeset.ts` is whatever the new code actually imports.
- **B-class bugs in the same family stop recurring.** B3 and B4 were both symptoms of the imperative layer fighting its host runtime.

### 1.5.6 Definition of done for Phase 1.5

- ✅ `src/tui/state.ts` is a single `createStore`, not a bag of signals.
- ✅ `activeKeyResolver` does not exist anywhere in the repo.
- ✅ The save loop in the editor is one `createEffect` plus a `save()` helper, not five interacting closures.
- ✅ At least one filtered/derived list in the inbox is a `createMemo` (`inboxFilteredSearch`; also `editorParsedPrompt`).
- ✅ `bunx tsc --noEmit` is clean; all test suites pass. (Manual TUI verification still pending — recommended before declaring Phase 1.5 fully shipped.)

**Phase 1.5 complete (2026-05-16) modulo manual TUI smoke test.** Phase 2 (HTML prompt builder, V1–V6 walkthrough) is now unblocked.

---

## Phase 2 — HTML Prompt Builder

### 2.1 Vision

Today, Princess stores prompts as Markdown with YAML-ish frontmatter. Markdown is good for human reading but weak for *structured* prompts — sections that need typing (system / user / assistant), nested instructions, variables, references to other prompts, attachments, and conditional blocks.

The goal of Phase 2 is to let users (and agents) compose prompts in HTML, while preserving the "plain file on disk" principle that defines Princess.

### 2.2 Open questions to answer first

These should be settled with the user before any implementation begins. They are listed in the order they need to be decided.

- **V1. What is the storage format?**
  Options: raw `.html` files, `.md` files with embedded HTML islands, a hybrid `.prompt` file with an HTML body and existing frontmatter, or a richer container with separate sections. The choice constrains everything downstream.

- **V2. Is the HTML rendered, or only authored?**
  Does the TUI render the HTML (visual approximation), show the raw HTML source, or both? If rendered, what subset of tags is supported, and how do we handle truly visual elements in a terminal?

- **V3. What is the surface for *building* the HTML?**
  Hand-edited markup, a structured form (e.g., "add a section, pick a type"), a templating DSL that expands to HTML, or a small set of component primitives?

- **V4. What is the surface for *consuming* the HTML?**
  When the user copies a prompt, should the clipboard receive HTML, plain text, Markdown, or model-ready JSON? Should `princess` know how to flatten the HTML into a single prompt string the way an LLM expects it?

- **V5. Should existing Markdown prompts coexist or migrate?**
  Both formats supported indefinitely, or one becomes canonical?

- **V6. Are HTML prompts agent-writable on day one?**
  If yes, the `AGENT.md` contract needs an update; if no, the feature ships as a human-only authoring path first.

### 2.3 Candidate scope (subject to V1–V6)

The list below is illustrative. Treat it as a menu, not a plan, until the open questions are answered.

- **Storage**: a new file extension or a new frontmatter key that signals "this prompt is HTML-bodied". `parsePromptDocument` learns to detect and route.
- **Authoring**: extend the TUI editor with an HTML mode (syntax highlighting, tag-aware editing), or open the file in `$EDITOR` and treat the TUI as the inbox-and-clipboard layer only.
- **Rendering**: a tag-to-ANSI renderer for previewing `<section>`, `<role>`, `<variable>`, `<example>`, code blocks, etc. inside the inbox preview pane.
- **Composition primitives**: a small canonical tag vocabulary (e.g. `<system>`, `<user>`, `<context>`, `<example>`, `<placeholder name="...">`) instead of arbitrary HTML.
- **Flatten/export**: a `princess export <file>` command that emits the HTML flattened into the format a target LLM expects (raw text, message array JSON, OpenAI-style chat completion, etc.).
- **Variable substitution**: define values for `<placeholder>` tags inline or via CLI flags at copy/export time.
- **Validation**: a `princess lint` or `princess doctor` extension that checks HTML prompts for required sections, unclosed tags, undefined placeholders.
- **Agent contract**: update `AGENT.md` and `getAgentInstructions` to describe the HTML deposit flow once V6 is decided.

### 2.4 Anti-goals

Things explicitly *not* intended for Phase 2, to keep scope tight:

- No browser preview; everything stays in the terminal.
- No database or schema migration; files stay plain on disk.
- No mandatory migration of existing Markdown prompts.
- No remote rendering / sync; Phase 2 is local-only, like everything else in Princess so far.
- No HTML-to-Markdown transformation as a primary feature; export targets are model-facing, not human-facing.

### 2.5 Sequencing

0. Confirm Phase 1.5 is complete; the reactive substrate is the foundation Phase 2 builds on.
1. Walk through V1–V6 with the user; capture decisions in this file.
2. Produce a short design doc (likely a follow-up roadmap) that locks the storage format, tag vocabulary, and authoring surface.
3. Implement storage + parsing first, in isolation, with tests.
4. Add an inbox preview path for HTML prompts (read-only).
5. Add the authoring surface chosen in V3.
6. Add export / flatten in the form chosen in V4.
7. Update the agent contract per V6.
8. Update README and `CLAUDE.md` mentions.

### 2.6 Definition of done for Phase 2

- A user can create, edit, preview, copy, and export an HTML prompt entirely from `princess`.
- The format is documented in a single place that an agent can read to deposit a valid HTML prompt without guessing.
- Existing Markdown prompts continue to work without changes.
- The new surface area is covered by tests at the same standard as the rest of `src/`.

---

## Tracking

Open work items will be checked off in place as Phase 1 and Phase 2 progress. When a decision is made on any of the V-questions, record the answer inline under that question with the date.
