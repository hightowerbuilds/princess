# Daily Summary - May 16, 2026

## Overview
Continuing the Phase 1.5 imperative→reactive port from yesterday. P1 (store-ified state) landed yesterday; today picks up with P3 — collapsing the editor save loop into a single `createEffect`.

## Today's Focus
- **Phase 1.5/P3 — Editor save loop port.** Replace the five interacting closures (`saveTimer` / `lastSavedContent` / `saving` / `flushSave` / `scheduleSave`) in `waitForEditor` (`src/tui/app.ts:497`) with a single `createEffect` that watches `state.state.editor.content` plus an explicit `save({ forceSnapshot })` helper for the Ctrl+S path. `onCleanup` handles debounce cancellation.
- Keep escape-path semantics: a pending debounced save must flush before `waitForEditor` resolves.
- Preserve the revision-snapshot rule (`recordPromptRevision` only when previous on-disk content differs and either the snapshot is forced or this isn't the first save).

## Execution Progress
- **Phase 1.5/P3 landed.** `waitForEditor` in `src/tui/app.ts` no longer carries the five-closure save state (`saveTimer`, `lastSavedContent`, `saving`, `flushSave`, `scheduleSave`, `cancelSaveTimer`). Replaced with:
  - A single `save(forceSnapshot)` async helper. The in-flight guard is now `while (inFlight) await inFlight`, so a Ctrl+S pressed mid-debounce actually honors the snapshot intent instead of being dropped (the old `if (saving) return` quietly swallowed it).
  - A `createEffect` owned by a per-session `createRoot` that watches `state.state.editor.content` and schedules a debounced save. `onCleanup` clears the stale timer on re-run or dispose.
  - An explicit `cancelPending()` for screen transitions (Ctrl+R diff, Ctrl+P revision browser) and a `disposeSaveEffect()` called on escape.
  - `SAVE_DEBOUNCE_MS = 1200` lifted out as a named constant at the top of `app.ts` (partial Q14).
- **Keystroke tail simplified.** The `if (needsSave) { ... scheduleSave() }` block dropped its imperative `scheduleSave` call — typing still sets `saveState='dirty'` for immediate UI feedback; the effect drives the debounce.
- **Verification.** `bunx tsc --noEmit` clean. All 9 test suites (510 tests) pass.

- **Phase 1.5/P4 landed.** Two `createMemo`s added to `createTuiState`:
  - `editorParsedPrompt` memoizes `parsePromptDocument(editor.content)`. Editor view used to re-parse on every render (terminal resize, save state flip, cursor move). Now keyed to content only.
  - `inboxFilteredSearch` filters a raw `inbox.searchEntries` list against `inbox.searchQuery`. Returns `null` when no search is active so callers can fall back to `inbox.files`.
- **Inbox search loop restructured.** Added `inbox.searchEntries` to the store plus a `loadSearchEntries` helper that does the recursive disk walk *once* when the user presses `/`. Search keystrokes (chars, space, backspace) mutate `searchQuery` in place — the old `resolve("refresh")` per keystroke (which re-walked the entire inbox tree from disk on every character) is gone. The query-branch of `loadInboxFiles` is also gone; that function is now strictly "load current directory."
- Revision delta annotations were not memoized — already pre-computed at load time in `revisions.ts`.
- `bunx tsc --noEmit` clean; all 9 suites (510 tests) pass.

- **Phase 1.5/P2 landed — `activeKeyResolver` is gone.** `src/tui/app.ts` was rewritten end-to-end. The module-level `activeKeyResolver`, the `KeyResolver` type, all six `waitForX` promise-wrapping functions (~300 lines combined), and the three stash/restore patterns (`resumeEditor`, `resumeRevisions`, `resumeResolver`) are deleted.
  - `handleKey` is now a screen-dispatch router that reads `state.state.screen` and routes to one of six pure per-screen handlers. Help-hotkey is checked as a pre-handler. Screen transitions are plain `setState("screen", X)` mutations.
  - **State additions.** `running: boolean` ends `runApp` when flipped false (the new "quit" path). `overlay.helpReturnTo: AppScreen | null` records where the help overlay returns to, replacing the old resolver stash.
  - **`runApp` restructured.** Was a `while (true)` loop awaiting `waitForX` promises. Now a setup pass that wraps two long-lived effects in a `createRoot`: (a) the editor save loop (the P3 work, lifted out of `waitForEditor` and made app-lifetime), and (b) a `createEffect` that watches `(screen, inbox.directory)` and reloads the inbox whenever the user returns to it or changes directory. The function then awaits a single Promise that resolves when `running` flips false.
  - **Save loop lifecycle.** Was per-session (inside `waitForEditor`'s body); now app-lifetime, with an explicit `resetBaseline()` called by `openEditorFile` so re-opening the same file primes a fresh baseline. The save effect short-circuits when `screen !== "editor"`, so navigating to diff/revisions doesn't trigger autosaves.
  - `src/tui/app.ts` went from ~986 to ~896 lines, but the structural improvement is bigger than the diff suggests — the imperative state-machine glue is gone.
  - `bunx tsc --noEmit` clean; all 9 suites (510 tests) pass.

**Phase 1.5 complete in one day:** P1 (store-ified state) landed yesterday; P3 (reactive save loop), P4 (`createMemo` for derived data + restructured inbox search), and P2 (kill `activeKeyResolver`) all landed today. The imperative→reactive port is done modulo a manual TUI smoke test.

## Tomorrow's Focus
- **Manual TUI smoke test of Phase 1.5.** Walk through every screen transition: inbox → editor (open file), editor → inbox (escape, with and without unsaved edits), editor ↔ diff (Ctrl+R), editor → revisions (Ctrl+P) → revision-preview (Enter) → restore (r), help overlay from each screen, search mode, create-folder, rename, delete. Verify nothing visually regressed.
- **Phase 2 / HTML prompt builder** is unblocked. The next step is the V1–V6 question walkthrough — settle the storage format, authoring surface, and consumption surface before any code. The parallel HTML prompts substrate (`src/html-prompts.ts`, 775 lines, 36 tests) is already landed and ready to plug into.
