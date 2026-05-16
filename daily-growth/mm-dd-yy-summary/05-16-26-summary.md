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

## TUI Aesthetic Pass (same day, post-push)

User asked for a focused effort on making the TUI feel more "energized" without being over-the-top. Initial audit found that `motion.ts` (16 primitives, 1335 lines) and `aesthetics.ts` (501 lines) were almost entirely unused — only `createBreathingPulse` (on the logo), `dropShadow`, and `gradientTextMulti` were wired in. So the work is **integration**, not new infrastructure.

Roadmap agreed for the aesthetic pass:

1. ~~Smooth cursor scroll~~ — deferred. Direct integration of `createSmoothScroll` creates a regression: when `j` at the bottom of the viewport bumps `scrollOffset` by 1, the cursor row falls off-screen for ~150ms during the spring transit. Highlight disappears. Will revisit with a `snap-on-small-delta` wrapper later.
2. Cursor trail
3. Staggered reveal on directory change
4. Focus depth dimming
5. Crossfade between screens
6. Footer hint gentle glow

### Pass #1 landed — Cursor trail in inbox list

- `state.ts` exposes a new `inboxCursorTrail = createCursorTrail(() => state.inbox.cursor, { fadeFrames: 6, maxTrail: 2 })`. Trail fades over ~288ms (16ms × 3 × 6 frames).
- `views/inbox.ts` adds a `trailMarker(opacity)` helper that renders a `›` in fading 256-color grayscale (shades 234–250). The non-cursor render branch now checks `state.inboxCursorTrail(i)`; rows with trail opacity > 0 get the gray `›` prefix instead of three spaces.
- Visual effect: pressing `j`/`k` leaves a faint glowing trail of `›` markers on the two previous cursor positions, fading out over ~300ms. Gives kinetic feel without touching scroll, layout, or content.
- `bunx tsc --noEmit` clean. Full test suite passes (all 81 in views.test.ts plus the rest).
- No new tests added — visual effect doesn't have a clean substring assertion, and the existing inbox tests still pass without modification (the trail is invisible at construction time because no cursor moves have occurred).

### Pass #2 landed — Staggered reveal on directory entry / first paint

- `motion.ts`: `StaggerConfig` gains an optional `triggerKey?: Accessor<unknown>` so the reveal can re-fire when a key (e.g., current directory) changes even if the visible item count stays the same. Additive — existing `createStaggeredReveal` usage and its motion.test.ts case untouched. New `lastKey` / `keyInitialized` tracking inside the effect avoids a phantom first-paint fire when `triggerKey` is supplied but its initial value matches.
- `state.ts` exposes `inboxReveal = createStaggeredReveal(() => state.inbox.files.length, { delay: 22, fadeDuration: 140, triggerKey: () => state.inbox.directory })`.
- `views/inbox.ts` row loop now wraps its push: row line is built into a `lineToPush` local, then `revealOpacity = state.inboxReveal(i - offset)` controls what's actually pushed — `""` when opacity is 0 (item not yet visible, preserves layout slot via box content padding), `dim(line)` while fading in, plain line at opacity 1.
- Visual effect: opening Princess (or entering a subdirectory) cascades the prompt rows in over ~250ms — first row at t=0, each subsequent row 22ms later, each fading in over 140ms. Subtle but conveys "fresh list arriving" rather than "list popping."
- Race-condition aware: directory mutation in `app.ts` precedes the async `loadInboxFiles`. Reveal fires once on directory change (key) and again when files actually load (count) — the second fire wins visually, no visible jank.
- `bunx tsc --noEmit` clean. All 81 view tests + full suite pass.

### Pass #3 landed — Focus depth dimming around the cursor

- `views/inbox.ts` imports `focusDimLine` from `aesthetics.ts` and applies it to fully-revealed rows: `focusDimLine(lineToPush, i, cursor, 8)`. Cursor row passes through unchanged (distance 0 → brightness 1.0 → function returns line as-is). Rows 1–7 away get progressively dimmer fg256 grayscale shades; distance ≥ 8 falls to `dim()`.
- Stacks cleanly with pass #2 — focus dim is only applied when reveal opacity = 1, so the cascade-in path still uses the reveal's own dim, and we don't double-dim during the intro animation.
- ANSI nesting note: explicit color escapes inside the line (trail markers, gradient text on directories, status chips) keep their own colors — outer `fg256` only paints the un-styled foreground spans. So the eye-anchoring effect targets neutral text without washing out the deliberate color highlights.
- `bunx tsc --noEmit` clean; tests pass.

### Pass #4 — Crossfade between screens — deferred

- Tried wiring `createCrossfade` over `state.screen` and applying `dim()` to the full frame proportionally to inverse progress. Doesn't work cleanly: our existing color helpers (`dim`, `rgb`, `bgGray`, etc.) emit specific SGR-cancel codes (`\x1b[22m`, `\x1b[39m`, `\x1b[49m`) at the end of each span, which cancel an outer `dim()` wrap before it can paint the rest of the line. Result is patchy, not a fade.
- A true compositing crossfade would require rendering both old and new screens to line buffers and blending — not a 30-line change. Punted to a future pass; the existing instant screen swap is fine for now.

### Pass #5 landed — Footer hint gentle glow

- `state.ts` adds `hintGlow = createGlowPulse({ period: 5200, baseColor: [88,88,88], glowColor: [185,185,185] })`. Slow, narrow grayscale band — fully present but easy to miss until you settle.
- **Lifecycle fix:** initially called `hintGlow.start()` at construction in `state.ts`, which broke the test runner — pulses with running `setInterval` keep the bun process alive after tests finish, so `test-runner.ts` hung indefinitely. Moved the `.start()` call to `app.ts` alongside `idlePulse.start()` / `logoPulse.start()`, matching the existing dormant-at-construction convention. Tests are pulse-creation safe but not pulse-running.
- `views/inbox.ts` adds a `footerWithHelpGlow(state, full)` helper that splits the footer string around the `[Ctrl+/] Help` token and re-composes it as `dim(before) + rgb(...glow, marker) + dim(after)` — so the marker glows in truecolor while the surrounding hints stay dim. Three footer branches (default, search-mode, residual-query) all use the helper.
- Visual effect: every ~5s, the `[Ctrl+/] Help` token in the footer brightens from charcoal to soft gray and back. Almost subliminal; gives the screen a heartbeat without demanding attention.
- `bunx tsc --noEmit` clean; full suite passes (81 view tests + the rest).

### Summary of the aesthetic pass

Three primitives wired in, one deferred, one (smooth scroll) deferred upstream. The "energized but restrained" feel comes from layering small motions:

- Static idle: hint-glow heartbeat every ~5s, logo gradient pulse
- Selection: cursor trail (300ms fade), focus-depth dim around cursor
- Navigation: staggered reveal on directory change (250ms cascade)

All five visible effects are signal-driven and auto-stop on convergence (or are bounded pulses), so the renderer wakes only when something's actually moving. No new dependencies; no new infrastructure. Every effect is using a primitive that already existed in `motion.ts` / `aesthetics.ts` — the work was integration, not invention.

## Browser and Simultaneity Roadmap — Phase 1 Substrate (S1 + S2)

Picked up the Browser and Simultaneity roadmap. Verified the roadmap's stated state against the code: only B3 (browser-open) had shipped; S1–S4 of the Phase 1 substrate were untouched. Started from the lowest-friction items.

### S1 landed — `princess create-prompt --json`

- `createPrompt` was rewritten to **return** a structured `CreatePromptResult` instead of `console.log`-ing and swallowing errors. Shape: `{ path, ref, title, format, category, collision }`.
  - `ref` is inbox-relative with no extension for both formats (e.g., `showcase/release-notes-2` for Markdown, `web/landing-brief-2` for HTML) — matches what `princess html <subcommand> <ref>` already takes.
  - `collision` is `true` whenever the slug ended up with a `-2`/`-3`/… suffix because of a name clash.
- Failures now **throw**; the top-level `error: <msg>` handler exits 1. The previous behavior — catch, print to stderr, exit 0 — was a Trial-2 finding that made `--json` untrustworthy without this fix.
- Dispatcher routes the result to either human output (unchanged) or pretty-printed JSON when `--json` is passed.
- Usage text lists the new flag.
- Tests: new `createPrompt structured result` section in `src/cli/index.test.ts` — 14 assertions covering markdown, collision suffix, root-category, HTML, and HTML-collision cases.

### S2 landed — Sorted `princess list` output

- The TUI's `compareInboxEntriesForDisplay` was moved out of `src/tui/app.ts` and into the shared `src/inbox-files.ts` (alongside the existing visibility predicates). The CLI and TUI now literally call the same comparator — no drift risk.
- The comparator takes a minimal `{ name; isDirectory }` shape, so the CLI's `ListedInboxEntry` and the TUI's `InboxEntry` both qualify.
- `listPrompts` was rebuilt: `loadListedEntries` filters dirents through `isVisibleInboxFile`, probes each directory for `manifest.json` to detect HTML workspaces (parallel `stat`), sorts with the shared comparator, and returns enriched entries.
- JSON shape upgraded from `{ name, type, path }` to `{ name, path, isDirectory, isHtmlWorkspace?, isAsset?, isTableData? }` — mirrors the TUI's internal `InboxEntry` model so consumers can reason about the same vocabulary across both surfaces.
- Non-visible files (`.DS_Store`, stray `.txt`, etc.) are now filtered from both human and JSON output, matching the TUI's visibility rule.
- Human output adds a `📦 ... [html]` badge for HTML workspaces.
- Removed the now-unused `AGENT_LETTER_FILENAME` import from `src/tui/app.ts`. Updated `src/tui/app.test.ts` to import the comparator from `../inbox-files.ts`.
- Tests: two new sections in `src/cli/index.test.ts` cover root-level sort (agent letter pinned first, directories then files, alphabetical within), HTML workspace detection, hidden-file filtering, the per-file-type flags, and non-root category sort. CLI suite went from 56 → 68 assertions.

### Verification

- `bunx tsc --noEmit` clean.
- `bun run test` — all 9 suites green.
- Live smoke against a temp `PRINCESS_HOME` confirmed: S1 prints correct JSON for first-create, collision-suffix, and HTML cases (and unchanged human output otherwise); S2 sorts agent-letter-first, directories alphabetically before files, tags HTML workspaces in both surfaces, and filters `.DS_Store`.

### Roadmap status after today

- Phase 1 Substrate: 2 of 4 done (S1 ✅, S2 ✅, S3 resource write safety pending, S4 TUI external-change awareness pending).
- Phase 2 Browser Bridge: B3 partial (browser-open from yesterday). B1/B2/B4 pending.
- Phases 3–5 untouched.

S3 (manifest write race fixed in Trial 4) is the natural next item — it's the highest-impact remaining Phase 1 work and unblocks any future multi-agent contribution flow.
