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

## Phase 2 V-Walkthrough and First Pass

Following Phase 1.5, the user and I walked through V1–V6:
- **V1 storage:** Substrate-decided — directory-per-prompt workspace with `manifest.json` + `prompt.html` + attached resources.
- **V2 render:** Raw source. TUI shows the literal tags, not a visual approximation.
- **V3 authoring:** CLI-only. The TUI is a viewing surface; the CLI is the editing surface. Terminology stays "section" (HTML semantics) rather than "tag."
- **V4 export:** Substrate-decided — `html | markdown | json` compile targets already implemented.
- **V5 coexistence:** Substrate-decided — Markdown and HTML prompts live side by side.
- **V6 agent-writable:** Yes on day one. Agents get add/edit/reorder/delete/list/read of sections.

## Phase 2 Pass 1 (later same day)

- **Four section operations added to `src/html-prompts.ts`:**
  - `listHtmlPromptSections(workspaceRef)` — returns all top-level `<section data-princess-role>` blocks with role + heading + html.
  - `getHtmlPromptSection(workspaceRef, role)` — returns a specific section or null.
  - `removeHtmlPromptSection(workspaceRef, role)` — deletes by role.
  - `moveHtmlPromptSection(workspaceRef, role, { before | after | to })` — reorders by role or numeric index.
  - The auto-managed `resources` section is protected: move/remove refuse it with a clear error.
  - Implementation uses a small depth-counting HTML scanner (handles nested resource-snippet sections inside the resources block correctly).
- **CLI subcommands wired:** `html list-sections`, `html get-section`, `html remove-section`, `html move-section --before|--after|--to`. Added `--before`, `--after`, `--to` flags to the parser.
- **TUI integration (read-only viewer):**
  - `InboxEntry` gained `isHtmlWorkspace?: boolean`. `loadInboxFiles` probes each subdirectory for `manifest.json` and tags it.
  - HTML workspaces show with a dim `[html]` badge in the inbox listing.
  - `EditorState` gained `readOnly: boolean`. `openEditorFile(state, filepath, { readOnly })` sets it.
  - Pressing Enter on an HTML workspace loads `prompt.html` in the editor with `readOnly=true`.
  - The editor handler short-circuits mutations, `Ctrl+S`, `Ctrl+R`, and `Ctrl+P` in read-only mode. `Ctrl+C` (copy), `Esc` (back to inbox), and all navigation keys are allowed.
  - The editor view shows `[read-only]` in the header and a trimmed footer hint (just `[Esc] Inbox [Ctrl+C] Copy [Ctrl+/] Help`).
- **Agent contract updated.** `getAgentInstructions` now has a "1c. Editing HTML Prompt Sections" section documenting the full section vocabulary.
- **Tests.** `src/html-prompts.test.ts` grew from 36 to 54 tests covering list/get/move (before/after/to)/remove/reserved-protection. Total: 528 across 9 suites, all green. `bunx tsc --noEmit` clean. Manual CLI smoke verified: create → set-section → list-sections → move-section → remove-section → resources-section-protected.

## Later Same-Day Showcase and Stress Tests

After Phase 2 pass 1, the work shifted from implementation to proving Princess through realistic agent and human workflows. The new roadmap is `daily-growth/roadmaps/2026-05-princess-showcase-and-stress-tests.md`.

- **Roadmap transition.** The code quality and HTML prompt builder roadmap is now complete and archived under `daily-growth/roadmaps/old/`. The active roadmap is now the Princess showcase and stress-test plan.
- **Default agent letter.** Added the root-level default prompt `A LETTER TO YOUR AGENT FROM PRINCESS`, with an all-uppercase title. It is seeded into the Princess root inbox, not examples, so new users see it immediately. The letter explains how agents should use Princess, including the HTML prompt builder workflow.
- **Installed local Princess.** The local checkout remains linked through the installed `princess` command, so the active command uses this repository's current code.
- **HTML prompt discoverability.** HTML workspace content is now indexed by TUI search, including `prompt.html`, manifest/resource metadata, readable source files, and imported table partials. HTML workspaces appear as one prompt result instead of exposing internal files.
- **Showcase organization.** Created `showcase/html prompts/` with shared `assets/` and `tables/` folders. Image assets and CSV/TSV table files are listed by filename in the TUI/CLI without rendering their contents.
- **TUI location cue.** The inbox home view now shows `You are here:` with the active Princess inbox path, and project-local workspaces show a `PROJECT LOCAL` cue.

## Trials Completed

- **Trial 2 — Markdown Prompt Daily Use.** Created five practical Markdown prompts, verified duplicate suffixing, TUI search, and clipboard copy.
- **Trial 3 — HTML Landing Page Brief.** Built a structured HTML prompt package and verified section operations, compile targets, TUI `[html]` badge, and read-only `prompt.html` viewing.
- **Trial 4 — Asset-Heavy Prompt Package.** Verified sources/assets, alt text, JSON attachments, and asset-folder browsing. Found a concurrent resource-write race for the backlog.
- **Trial 5 — Data and Table Import.** Imported CSV and TSV tables, added the shared `tables/` folder, and made table files visible/searchable by name and content where appropriate.
- **Trial 6 — Existing Project Handoff.** Used this repo as the real project and saved a future refactor handoff prompt into Princess.
- **Trial 7 — Revision and Recovery Drill.** Verified TUI edits, forced snapshots, diff view, revision browser, and copying an old revision. Changed successful revision-copy messages from `Error:` to neutral `Status:`.
- **Trial 8 — Local Workspace Trial.** Verified `princess init --local`, local `.princess/inbox` discovery from root and nested directories, local `AGENT.md`, local HTML compile, and TUI local/global cues.
- **Trial 9 — Collision and Naming Trial.** Created the same Markdown and HTML titles three times each. Markdown files and HTML workspace folders suffix cleanly with `-2` and `-3`, and unique content stayed in the correct artifacts.
- **Trial 10 — Broken Input and Lint Trial.** Ran bad commands for missing workspaces, invalid roles, protected `resources`, missing assets, malformed CSV, and invalid compile targets. Fixed the important gaps immediately.

## Fixes From The Trials

- `src/cli/index.ts` now formats top-level failures as one-line `error: ...` messages instead of Bun source-frame stack traces.
- `src/html-prompts.ts` now rejects section roles that sanitize to nothing, so inputs like `!!!` cannot create accidental `untitled-prompt` sections.
- Table import now rejects malformed CSV/TSV before writing partials or manifest resources.
- Missing workspace and missing source-file failures now name the relevant path more clearly.
- Added regression tests for CLI error formatting, invalid section roles, malformed table import, table-file listing, HTML workspace search, read-only/status rendering, and local workspace behavior.

## Validation

- `bunx tsc --noEmit` passed.
- `bun run test` passed across all suites.
- `git diff --check` passed.
- Trial workspaces were linted with `princess html lint` where applicable.

## Next Focus

- Trial 1 remains intentionally skipped for a fresh user/agent onboarding run.
- Triage the findings backlog into must-fix, should-fix, and nice-to-have.
- Build a short demo script for the strongest three showcase flows.
- Likely next product polish: `create-prompt --json`, sorted `princess list` output, friendlier missing-workspace suggestions, and clearer duplicate disambiguation in the TUI.

## Browser and Simultaneity Roadmap Started

- Created `daily-growth/roadmaps/2026-05-browser-and-simultaneity.md`.
- Defined two pillars: `Connecting with the Browser` and `Simultaneity`.
- Clarified that simultaneity means more than safe concurrent file writes: the ambitious target is one user coordinating up to ten agents contributing to one large HTML prompt package for enterprise migration, 3D production, robotics, or similarly complex projects.
- Added an initial browser-open implementation: `princess html open <workspace-ref>` launches `prompt.html` in the operating system's default browser, and the TUI now exposes `o` for HTML workspaces/read-only HTML prompts.

## End-of-Day Push Prep

- Rechecked the active roadmap and daily summary after adding browser-open support and the expanded simultaneity framing.
- Confirmed the working branch is `main` tracking `origin/main`.
- Prepared the full current worktree for a single push to main, including roadmap files, trial fixtures, agent instructions, docs, TUI behavior, HTML prompt validation fixes, browser-open support, and regression tests.
