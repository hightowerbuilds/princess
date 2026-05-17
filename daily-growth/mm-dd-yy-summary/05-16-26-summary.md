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

### S3 landed — Resource write safety via per-workspace file lock

Picked S3 next per the same-day pivot note. The Trial 4 finding captured the exact failure mode: parallel `add-source` + `add-asset` both succeed but only one resource lands in `manifest.json`, then lint fails with `unknown-include` because `prompt.html` references a manifest entry that no longer exists. Root cause is a read-modify-write race — both invocations read the same baseline manifest, mutate independently, and the second `atomicWriteFile` wins.

Considered three approaches: in-process serialization (insufficient — Trial 4 was two shell processes), filesystem advisory lock (cross-process, no extra services), and compare-and-swap (schema change). Picked the file lock: minimum surface area, solves the actual reported failure, no manifest format change.

- **New `src/file-lock.ts`** — general-purpose `withFileLock(lockPath, work, options)`. Try to create the lock with `O_EXCL` (`wx` flag); on `EEXIST`, attempt stale-recovery (dead PID on same host, or `acquiredAt` older than `staleAfterMs`) and retry; otherwise back off with jittered exponential polling up to `timeoutMs`. Lock payload (`{ pid, hostname, acquiredAt }`) is written into the file itself so stale-recovery can decide intelligently rather than guess from age alone. Always released in `finally`, even when `work()` throws.
- **`src/html-prompts.ts`** — added a `withWorkspaceLock(workspaceDir, work)` wrapper using `.princess.lock` inside each workspace dir, and wrapped all seven write entry points: `addHtmlPromptSource`, `addHtmlPromptAsset`, `importHtmlPromptTable`, `upsertHtmlPromptSection`, `removeHtmlPromptSection`, `moveHtmlPromptSection`, `removeHtmlPromptResource`. ENOENT on lock acquisition (i.e., the workspace dir itself doesn't exist) is translated to the standard "HTML prompt workspace not found" error so users see a clean message rather than a lock-file path.
- **Intentionally not locked:** `compileHtmlPromptWorkspace` is read-mostly and only writes to `dist/`, so concurrent writes can produce a stale output but never corrupt source. If we want compile to see a consistent snapshot later we'd take a shared/read lock — the current exclusive helper isn't the right shape for that. The lock is per-workspace, not global, so unrelated workspaces never block.
- **Tests:**
  - `src/file-lock.test.ts` (new) — 14 assertions covering serialization of overlapping callers, release after `work()` throws, dead-PID stale recovery, age-based stale recovery, timeout when the holder stays alive, and lock-payload contents.
  - `src/html-prompts.test.ts` extended — new `parallel resource writes preserve every resource` section fires `addHtmlPromptSource × 2 + addHtmlPromptAsset + importHtmlPromptTable` in parallel against one workspace, then asserts the manifest has all four resources, `prompt.html` has all four snippets, and `lint` returns no issues.
- **Test runner** — registered the new `file-lock` suite.

### Verification (S3)

- `bunx tsc --noEmit` clean.
- All 13 suites green (was 12; `file-lock` is the new suite). CLI suite unchanged at 68; html-prompts went 58 → 64 with the parallel-write test.
- **Live smoke reproducing the Trial 4 failure mode:** three real `princess` CLI processes (`add-source`, `add-asset`, `import-table`) launched in parallel against the same workspace via shell `&`. All three reported success; `princess html list --json` showed all three resources; `princess html lint` passed (no `unknown-include`); `.princess.lock` was cleaned up. The exact regression Trial 4 captured is now fixed at the binary level, not just inside the test process.

### S4 landed — TUI external-change awareness

Went straight from S3 into S4 to close out Phase 1 substrate. Picked lazy detection at save time (rather than eager polling of the open file): the conflict only matters at write time anyway, and lazy detection keeps editing flow uninterrupted.

**Editor-side conflict detection:**

- Extended `EditorSaveState` with a `"conflict"` variant.
- `createEditorSaveLoop` now tracks `baselineMtimeMs` alongside the content baseline. `resetBaseline` is async — it reads the on-disk mtime when a file is opened. After every successful save, the new post-write mtime is captured as the new baseline.
- `save(forceSnapshot, overwriteExternal = false)` re-stats the file before writing. If on-disk mtime differs from baseline AND `overwriteExternal` is false, it sets `saveState = "conflict"` and aborts without touching disk.
- Ctrl+S in conflict state calls `save(true, true)` — explicit overwrite. The pre-overwrite read still routes through the normal revision-snapshot path, so **the external version is preserved as a revision** before being overwritten. Status message: `"Overwrote external changes."` Esc in conflict state returns to inbox without auto-saving (discards in-memory edits).
- The debounced autosave effect short-circuits while `saveState === "conflict"`, so it doesn't ping-pong every 1.2s. The keystroke handler preserves `"conflict"` instead of downgrading to `"dirty"` on typing, so the conflict indicator doesn't flicker.
- Editor view shows `[external change]` (yellow) in the header and a yellow replacement footer banner: *"File changed on disk.  [Ctrl+S] Overwrite  [Esc] Discard your edits  Ln X, Col Y"*.

**Inbox auto-refresh:**

- `loadInboxFiles` was upgraded to preserve cursor by **name**, not index. Captures the currently-selected entry's name before reloading; after the new list is set, looks up that name in the new entries and moves the cursor to the new index. Falls back to clamping only if the name disappeared.
- Added a 2-second `setInterval` in `runApp`'s `createRoot` block that re-walks the current inbox directory when (a) screen is `"inbox"`, (b) no input modal is open, and (c) no delete confirmation is pending. Cleaned up via `onCleanup`.
- New constant `INBOX_REFRESH_INTERVAL_MS = 2000` in `tui/constants.ts`.

**Testability nits along the way:**

- Exported `createEditorSaveLoop` and `loadInboxFiles` from `tui/app.ts` so the new tests can exercise them directly without spinning up `runApp`.
- The S3 file-lock timeout test was racy at the FS level (both concurrent `withFileLock` calls could win the initial `O_EXCL` write). Replaced the holder with a deterministic pre-existing-lock setup — a manual `writeFile(lockPath, ..., { flag: "wx" })` before the second caller runs. No more race.

### Verification (S4)

- `bunx tsc --noEmit` clean.
- Full suite green: 13/13. app: 9 → 19 (+10 — two new sections covering the conflict cycle and cursor preservation); views: 41 → 45 (+4 — new `renderEditor conflict state` section); file-lock: 14 (deterministic).
- The conflict test exercises the real race: write `v1` → open it → externally write `external edit` + bump mtime via `utimes` → user-edit in memory → `save(false)` aborts to `"conflict"` (on-disk still `"external edit"`) → `save(true, true)` overwrites (on-disk now `"user edit"`). All four file-content + state assertions pass.
- The cursor-preservation test covers prepend (file `00-prepended.md` added → cursor still on `bravo.md` at new index 2) and external delete (selected entry removed → cursor stays in bounds).

### Roadmap status after today

- **Phase 1 Substrate: 4/4 complete.** S1 ✅ S2 ✅ S3 ✅ S4 ✅. The stated Phase 1 goal — making the local file model safe for multiple actors — is met end-to-end: agents can parse `create-prompt` output, listings are stable, concurrent writes can't lose resources, and the TUI doesn't pretend the disk is frozen while it's not.
- Phase 2 Browser Bridge: B3 partial (browser-open from yesterday). B1 (capture contract) is the natural next item.
- Phases 3–5 untouched.

## Phase 4 close-out — Multi-Actor Coordination

Audited Phase 4 against what S3/S4 already shipped. M1 was already met by the S3 file lock (per-workspace, cross-process safe, no extra services); two of M2's three criteria and two of M3's three criteria were already met by S3+S4. Only three small slivers remained, and they were independent enough to parallelize.

Dispatched three worktree-isolated agents in parallel:

- **M2 remainder — friendlier CLI lock-timeout error.** `withWorkspaceLock` is now exported with an optional `{ timeoutMs?, staleAfterMs? }` options bag and catches the `"Timed out after "` error from `withFileLock`, translating it to `Another writer is updating workspace "<ref>". Try again in a moment.` Workspace ref is derived via `path.relative(getPaths().inboxDir, workspaceDir)` with separator normalization. New `workspaceRefFor` helper. Public HTML write APIs unchanged.
- **M3 remainder — revision list shows time, not just date.** New exported `formatRevisionTimestamp(createdAt)` in `src/revisions.ts` produces `YYYY-MM-DD HH:MM:SS` from either filename-style (`2026-05-16T18-14-14-450Z`) or raw-ISO timestamps via UTC string slicing — no locale, no timezone conversion, deterministic. The TUI revision list (`views/revisions.ts`) calls it where it previously did `.slice(0, 10)`.
- **Trial 7 finding — refresh frontmatter `updatedAt` on TUI save.** New `refreshFrontmatterUpdatedAt(file, content)` helper at module level in `tui/app.ts`. The save loop now distinguishes `rawContent` (what's in the editor) from `content` (what gets written): for `.md` files with frontmatter that has an `updatedAt` line, the helper surgically replaces the value with `new Date().toISOString()` inside the frontmatter block only. Works for both normal and `overwriteExternal` paths. The in-memory `state.editor.content` and `baseline` are both updated to the rewritten content so the next save is correctly a no-op when nothing else changed.

### Integration

Each agent worked in an isolated worktree, ran `bunx tsc --noEmit` + `bun run test` locally, and reported back with diffs. I applied the three diffs to the main worktree (mostly clean Edit calls; test files were copy-overs since they were append-only) and re-ran the unified suite.

### Verification

- `bunx tsc --noEmit` clean.
- All 13 suites green: html-prompts 64 → 68 (+4 lock-timeout assertions), revisions 9 → 11 (+2 formatter unit tests), views 45 → 48 (+3 revision-list time test), app 19 → 25 (+6 updatedAt save test). Net +15 assertions across the run.

### Phase 4 status after today

- **M1 ✅ M2 ✅ M3 ✅ — Phase 4 complete.** The "make simultaneous human/agent/CLI/browser activity boring" goal is now met to the extent the substrate supports: locks are recoverable, conflicts have actionable UX in both surfaces, revisions preserve external versions and are timestamped precisely enough to recover from.
- Phase 5 (Many-Agent Prompt Building) is the natural next chunk if we want to keep cashing in the substrate. It builds on Phase 4 directly with contribution slots, an agent-contribution command, and a review/merge flow.
- Phase 2 (Browser Bridge) deferred — see the earlier honest discussion about waiting until a real browser workflow naturally surfaces.

## Phase 5 — Reconsidered and dropped (G1 schema kept)

Started Phase 5 (Many-Agent Prompt Building) by landing G1: optional `agent?` field on `HtmlPromptResource` and `HtmlPromptSection`. The existing `addHtmlPromptSource` / `addHtmlPromptAsset` / `importHtmlPromptTable` / `upsertHtmlPromptSection` functions all accept an `agent` option that gets persisted to the manifest (resources) or rendered as `data-princess-agent` on the section open tag. `listHtmlPromptSections` exposes the agent value. Round-trip tested in `src/html-prompts.test.ts` (suite went 68 → 78, +10 assertions covering source/asset/table/section agent persistence, snippet rendering, and the absent-agent case).

Then dispatched G2 (`princess html contribute` command) and G3 (`princess html contributions` listing command) to two parallel worktree-isolated agents. Both landed clean implementations with extensive test coverage (~30 assertions each). When I merged them into the main worktree, hit a Bun edge case where the ballooned ~800-line `src/cli/index.test.ts` started silently skipping a section.

Stepped back at that point and re-examined what the test infrastructure was actually proving. Honest assessment: Princess is a personal prompt inbox with one user; the "ten agents contributing to one workspace" framing was aspirational, not a real near-term workflow. Building a dedicated `contribute` CLI with collision-error UX plus a separate listing/filter command plus an integration stress trial was significant surface area for a hypothetical use case. The fact that we got stuck on a Bun bug in *test infrastructure* (not in the substrate, not in the product) was a clean signal we were over-investing.

**Decision: keep G1 (the schema is tiny and gives us a hook for later); drop G2 + G3 + G4.** Reverted `src/cli/index.ts` and `src/cli/index.test.ts` to their Phase 4 close-out state via `git checkout`. Roadmap updated to mark G2/G3/G4 as dropped with rationale and leave a clear path forward if a real multi-agent workflow ever surfaces.

### Verification (post-revert)

- `bunx tsc --noEmit` clean.
- All 13 suites green. CLI back to 68 (Phase 4 baseline); html-prompts at 78 (G1 round-trip tests preserved, +10 over pre-G1 baseline of 68).

### Net Phase 5 outcome

- **G1 ✅** — schema and rendering substrate in place, fully tested.
- **G2 / G3 / G4 — dropped.** Documented in the roadmap as a deliberate scope reduction, not an oversight. If we ever do want them, they'd be straightforward thin wrappers around the existing add/upsert functions (which already accept `agent`).

The honest meta-lesson: when an agent dispatched with "at minimum 7 scenarios" of test coverage comes back having written 30 assertions for a thin CLI wrapper, that's a signal the brief over-specified — not a signal to bloat the test file. Easier to right-scope the prompt than to merge generously-tested-but-overbuilt code back into a personal-tool codebase.

## Phase 3 — Closed out via audit

Circled back to Phase 3 (Browser Assets and Screenshots) and audited each success criterion against current code. Found that nearly all of it was already met by the generic HTML asset substrate that shipped earlier:

- **A1 — Screenshot Intake:** assets-folder placement ✅ and JSON compile attachments ✅ already worked. The one real gap was alt text: `addHtmlPromptAsset` silently defaulted `alt` to the filename when omitted, which is useless for a model. Trial 4 had flagged this with "Agent forgets `--alt`" as a stress signal. Fixed: `addHtmlPromptAsset` now throws `--alt is required for add-asset so the model has a description of the image. Pass --alt "<short description>".` when alt is missing or whitespace-only. CLI propagates as a clean one-line `error: ...` and exit 1. Smoke-tested both error and success paths against the actual `princess` binary.
- **A2 — Page Context Sources:** all three criteria already met. `addHtmlPromptSource` handles any local file; `normalizeTrust(undefined)` already returns `"untrusted"`; compile expansion verified in Trial 3.
- **A3 — Asset Library Surfacing:** all three criteria already met. `princess list` shows assets with the `🖼️` icon; TUI uses `[asset]` badge; image rendering is intentionally not attempted.
- The browser-specific framing ("captured screenshots", "captured page text") remains deferred with Phase 2 — there's nothing to build there without a capture pipeline first.

Tests: `src/html-prompts.test.ts` grew 78 → 81 (+3 — the missing-alt error, the whitespace-only-alt rejection, and one assertion on the error message text). All 13 suites green. `bunx tsc --noEmit` clean.

### Roadmap status after today

| Phase | Status |
|---|---|
| Phase 1 Substrate (S1–S4) | ✅ Complete |
| Phase 2 Browser Bridge | ⏸ Deferred (B3 only — `princess html open`) |
| Phase 3 Browser Assets (A1–A3) | ✅ Complete (A1 alt-required added; A2/A3 were already met) |
| Phase 4 Multi-Actor Coordination (M1–M3) | ✅ Complete |
| Phase 5 Many-Agent Prompt Building | 🟡 G1 schema kept; G2–G4 dropped |

The active roadmap is now fully resolved — every phase is either complete or deliberately deferred, with rationale recorded.
