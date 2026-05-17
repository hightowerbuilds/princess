# Roadmap: Browser and Simultaneity

Created: 2026-05-16
Status: Active

This roadmap begins the next Princess workstream after the code-quality pass, HTML prompt builder, and showcase stress tests. The goal is to connect Princess to browser-based work without turning Princess into a hosted web app, while also making the system safer when multiple processes, agents, and user surfaces touch the same prompt inbox.

## Guiding Question

Can Princess become the local prompt inbox that connects cleanly to browser workflows and remains trustworthy when work happens simultaneously from the TUI, CLI, agents, and browser-adjacent tools?

## Pillars

### Connecting with the Browser

Princess should be able to collect, inspect, and package browser-context work:

- Save useful browser context into Princess prompts.
- Attach browser-originated assets, screenshots, links, selections, and notes to HTML prompt workspaces.
- Open or preview Princess artifacts in a browser when that is the right surface.
- Keep all durable data local on disk.
- Avoid requiring a hosted account, remote sync, or cloud database.

### Simultaneity

Princess should behave predictably when more than one actor works at once:

- A human edits in the TUI while an agent creates or updates prompts.
- Two agents create prompts with similar names.
- Multiple CLI commands modify the same HTML workspace resources.
- A browser capture tool saves context while the inbox view is open.
- The TUI refreshes without losing the user's place or hiding external changes.

The ambitious version of this pillar is one user directing many agents, potentially up to ten, to build one serious prompt package together. The likely center of gravity is an HTML prompt workspace for a large migration, enterprise application redesign, 3D production workflow, robotics project, or another project where the final prompt needs many kinds of context. Princess should let separate agents contribute sections, sources, tables, assets, notes, and revisions to one shared prompt without making them overwrite each other or forcing the human to manually reconcile chaos.

## Current Readiness

Princess already has:

- Markdown prompt files with metadata and revision snapshots.
- HTML prompt workspaces with `prompt.html`, `manifest.json`, `assets/`, `sources/`, `partials/`, and `dist/`.
- CLI authoring commands for HTML sections and resources.
- TUI browsing, search, read-only HTML viewing, local/global inbox awareness, and copy behavior.
- Collision-safe Markdown and HTML prompt creation.
- Atomic file writes in several key paths.

Known gaps this roadmap needs to address:

- Concurrent HTML resource writes can lose manifest updates.
- `create-prompt` lacks structured output for agents.
- `princess list` order is not stable enough for duplicate-heavy review.
- Missing workspace errors are correct but could be more helpful.
- The TUI does not yet refresh gracefully around external changes.
- There is no first-class browser capture or browser preview story.

## Product Boundaries

Do:

- Prefer local-first browser integration.
- Treat browser capture as a way to deposit context into Princess, not as a replacement for the TUI.
- Keep prompt artifacts inspectable as ordinary files.
- Make concurrent writes explicit, serialized, or conflict-safe.
- Build small testable surfaces before adding broad browser features.

Do not:

- Turn Princess into a remote SaaS product.
- Build a general bookmark manager.
- Store browser history wholesale.
- Depend on a browser extension before a simpler local bridge is proven.
- Hide conflicts by silently overwriting files.

## Phase 1: Simultaneity Substrate

**Purpose:** Make the existing local file model safe enough for multiple actors before adding browser inputs.

### S1. Structured Creation Output

Add `--json` to `princess create-prompt`.

Success criteria:

- Returns created path, inbox-relative ref, title, format, category, and whether a collision suffix was used.
- Works for Markdown and HTML prompts.
- Agents can parse the output without scraping human text.

### S2. Stable Listing

Sort `princess list` output consistently with TUI display ordering.

Success criteria:

- Directories, Markdown files, HTML workspaces, image assets, and table files display predictably.
- Duplicate names are easier to scan.
- `--json` output remains machine-friendly.

### S3. Resource Write Safety

Serialize or lock HTML manifest/resource writes.

Success criteria:

- Parallel `add-source`, `add-asset`, and `import-table` commands cannot lose manifest resources.
- Failed writes leave the workspace in the last valid state.
- Tests cover concurrent resource writes.

### S4. External Change Awareness

Improve TUI behavior when files change outside the current session.

Success criteria:

- Inbox refresh notices new prompts without forcing a restart.
- Editor can detect when the on-disk prompt changed after it was opened.
- The user is warned before saving over external changes.

## Phase 2: Browser Bridge

**Purpose:** Establish the smallest useful browser-to-Princess connection.

### B1. Local Capture Contract

Define a local input format for browser-captured context.

Candidate fields:

- `title`
- `url`
- `selection`
- `notes`
- `capturedAt`
- `assets`
- `suggestedCategory`
- `targetFormat`

Success criteria:

- Browser context can become a Markdown prompt or an HTML prompt workspace.
- Captured URLs and selections are clearly labeled.
- Assets remain separate files and are not falsely embedded.

### B2. CLI Capture Command

Add a command such as:

```bash
princess capture browser --from capture.json
```

Success criteria:

- Creates a prompt from a structured browser-capture payload.
- Supports Markdown output for simple captures.
- Supports HTML workspace output when assets or longer context are present.
- Returns structured output for agents.

### B3. Browser Preview Command - Initial CLI/TUI Open Done 2026-05-16

Add a way to open a Princess artifact in the browser when useful.

First command:

```bash
princess html open <workspace-ref>
```

Success criteria:

- HTML prompt workspaces can open `prompt.html` in the operating system's default browser.
- The TUI read-only HTML viewer offers a browser-open shortcut that uses the same behavior.
- Preview does not mutate prompt state.
- The command reports exactly what file was opened.

Initial implementation:

- `princess html open <workspace-ref>` opens workspace `prompt.html` with the operating system's default browser.
- TUI inbox `o` opens the selected HTML workspace in the default browser.
- TUI read-only HTML viewer `o` opens the current `prompt.html` in the default browser.

Later possible commands:

```bash
princess open <prompt-ref>
princess html preview <workspace-ref>
```

These can wait until Markdown rendering or compiled-preview behavior is clearly needed.

### B4. Capture Helper

Prototype the simplest browser-side helper after the CLI capture contract is stable.

Candidate forms:

- Bookmarklet that copies structured JSON to clipboard.
- Small local HTML capture page.
- Browser extension only if the simpler helpers are not enough.

Success criteria:

- A user can capture page title, URL, selected text, and notes into Princess with minimal friction.
- The helper does not require a remote service.
- Failure modes are visible and recoverable.

## Phase 3: Browser Assets and Screenshots

**Status (2026-05-16): Closed out via audit.** Almost every Phase 3 criterion was already met by the generic HTML asset substrate that shipped earlier (`addHtmlPromptAsset`, `addHtmlPromptSource`, `princess list` icons, TUI `[asset]` badge). The only real remaining gap was A1's alt-text requirement, which is now enforced. The browser-specific framing ("captured screenshots", "captured page text") remains deferred with Phase 2 — there's nothing to build there without a capture pipeline first.

**Purpose (original):** Make browser-originated visual context useful for HTML prompt packages.

### A1. Screenshot Intake — DONE

Support browser screenshots as Princess assets.

Success criteria:

- Screenshot files land in the correct workspace `assets/` folder. ✅ Already done by `addHtmlPromptAsset` — copies file into `<workspace>/assets/<id>.<ext>`, records resource in manifest with media type.
- Alt text is required or strongly prompted. ✅ **2026-05-16:** `addHtmlPromptAsset` now throws if `alt` is missing or whitespace-only. CLI surfaces a clean one-line error: `error: --alt is required for add-asset so the model has a description of the image. Pass --alt "<short description>".` Trial 4's "Agent forgets `--alt`" stress signal is now a hard guardrail.
- Compiled JSON lists the screenshot as an attachment. ✅ Already done (verified in Trial 4).

### A2. Page Context Sources — DONE (already met)

Support saved page excerpts as trusted or untrusted sources.

Success criteria:

- Captured page text can be saved as a source file. ✅ `addHtmlPromptSource` already does this for any local file.
- Trust label defaults to `untrusted`. ✅ Verified — `normalizeTrust(undefined)` returns `"untrusted"`.
- HTML prompt compile expands the source clearly. ✅ Verified in Trial 3.

### A3. Asset Library Surfacing — DONE (already met)

Make shared `showcase/html prompts/assets/` style folders useful beyond demos.

Success criteria:

- Users can see asset filenames from the TUI/CLI. ✅ `princess list` shows them with `🖼️` icon; TUI shows `[asset]` badge.
- Agents can copy files into shared or workspace assets intentionally. ✅ Standard `cp` + `princess html add-asset` works; the shared `showcase/html prompts/assets/` pattern is documented in trial logs.
- Princess does not try to render images inside the TUI. ✅ Intentional — assets are listed by filename only.

## Phase 4: Multi-Actor Coordination

**Purpose:** Make simultaneous human, agent, CLI, and browser activity boring.

### M1. Lock or Lease Metadata

Decide whether Princess needs lock files, short-lived leases, or compare-and-swap style writes.

Success criteria:

- The chosen strategy protects high-risk writes without making simple prompt creation annoying.
- Stale locks are recoverable.
- The strategy works on macOS without extra services.

### M2. Conflict UX

Define what users and agents see when conflicts happen.

Success criteria:

- CLI commands explain whether to retry, refresh, or choose a different path.
- TUI editor warns before overwriting external changes.
- Conflicts can be resolved without manually inspecting hidden metadata.

### M3. Revision Integration

Use revision history to make conflict recovery safer.

Success criteria:

- External overwrite risks can create a revision snapshot before writing.
- Revision metadata is specific enough to distinguish same-day events.
- Copying an old revision remains straightforward.

## Phase 5: Many-Agent Prompt Building

**Status (2026-05-16): Reconsidered and dropped, except for the G1 schema bit.**

Started Phase 5 by landing G1's schema additions (optional `agent?` field on `HtmlPromptResource` and `HtmlPromptSection`, rendered as `data-princess-agent` in `prompt.html`). The existing `addHtmlPromptSource` / `addHtmlPromptAsset` / `importHtmlPromptTable` / `upsertHtmlPromptSection` functions all optionally accept an `agent` parameter; round-trip coverage lives in `src/html-prompts.test.ts`.

Then paused before building G2 (the `princess html contribute` command) and G3 (the `princess html contributions` listing) after realising the agent-stamping UX is overkill for Princess's actual scope. Princess is a personal prompt inbox — there is one user. The "ten agents contributing to one workspace" framing was aspirational, not a real near-term workflow. Building a dedicated `contribute` CLI with collision-error UX, plus a separate listing/filter command, plus an integration stress trial, would have added significant surface area for a hypothetical use case.

The G1 schema is small enough that keeping it costs nothing and gives us a hook if a real multi-agent workflow surfaces later. If we ever want G2/G3, they remain straightforward thin wrappers around the existing add/upsert functions.

**Purpose (original):** Support one user coordinating several agents that all contribute to a single large HTML prompt package.

This may sound ambitious, but the practical core is simple: treat the HTML workspace as the shared artifact and make every contribution addressable, appendable, reviewable, and conflict-safe.

### G1. Contribution Slots — DONE (schema only)

Decision: rather than introduce new directories like `contributions/`, reuse the existing `sources/`, `assets/`, `partials/`, and section commands. Added an optional `agent?: string` field to `HtmlPromptResource` (persisted in `manifest.json`) and an optional `agent` option to `upsertHtmlPromptSection` (persisted as `data-princess-agent` on the `<section>` open tag). `listHtmlPromptSections` exposes the agent value. Round-trip tested.

### G2. Agent Contribution Command — DROPPED

Consider a command that lets agents add context without hand-editing `prompt.html`.

Candidate command:

```bash
princess html contribute <workspace-ref> --agent <name> --role <role> --from <file>
```

Success criteria:

- Contributions are append-only or conflict-safe by default.
- The command returns structured output for agents.
- The human can list contributions before accepting them into the final prompt.

### G3. Review and Merge Flow — DROPPED

Give the human a clear way to inspect many contributions and decide what enters the prompt.

Success criteria:

- Contributions can be listed by agent, type, trust, and timestamp.
- A contribution can be promoted into a section or resource.
- Rejected or stale contributions remain recoverable until explicitly deleted.

### G4. Stress Trial: Ten Agents, One Prompt — DROPPED

Simulate ten agents contributing to one HTML workspace for a large migration or 3D/robotics project.

Pass:

- All ten contributions are preserved.
- No manifest or prompt section is lost.
- The human can identify who contributed what.
- Lint and compile pass after the final merge.

## Trial Plan

### 1. Browser Capture Smoke Trial

Capture a page title, URL, selected text, and notes into a Markdown prompt.

Pass:

- Prompt is created in the intended category.
- Source URL and capture timestamp are preserved.
- Agent can report the exact created path.

### 2. Browser Asset Trial

Capture a screenshot and page notes into an HTML prompt workspace.

Pass:

- Screenshot is stored as an asset with alt text.
- Notes are stored as a source with trust metadata.
- JSON compile lists the asset as an attachment.

### 3. Preview Trial

Open a Markdown prompt and an HTML workspace in browser preview mode.

Pass:

- Preview opens the expected artifact.
- No prompt files are mutated.
- The command reports the opened path or URL.

### 4. Parallel Resource Write Trial

Run several resource-add commands against one HTML workspace at the same time.

Pass:

- Manifest preserves every resource.
- `prompt.html` contains matching resource snippets.
- Lint passes after the run.

### 5. TUI External Change Trial

Open a prompt in the TUI, modify it externally, then attempt to save from the TUI.

Pass:

- TUI notices the external change.
- User gets a clear conflict state.
- No change is silently lost.

### 6. Agent and Browser Simultaneity Trial

Have an agent create a prompt while browser capture writes another prompt and the TUI is open.

Pass:

- Both prompts appear after refresh.
- Active selection does not jump unpredictably.
- No prompt or resource is overwritten.

### 7. Ten-Agent HTML Prompt Trial

Ask ten simulated agents to contribute separate material to one HTML workspace for a large project prompt.

Pass:

- Each agent contribution lands in a distinct addressable place.
- The final HTML prompt can include selected contributions.
- Lint and compile pass after the merge.
- The human can audit contribution ownership and timestamps.

## Findings Backlog

Add findings here as this roadmap runs.

- [ ] Decide the first browser bridge shape: capture JSON, bookmarklet, extension, or local page.
- [x] Add `princess html open <workspace-ref>` for opening `prompt.html` in the default browser.
- [x] Add `create-prompt --json` (2026-05-16: returns `path`, `ref`, `title`, `format`, `category`, `collision`; failures now throw so the top-level `error: ...` handler exits non-zero).
- [x] Sort `princess list` output consistently (2026-05-16: shares `compareInboxEntriesForDisplay` with the TUI — agent letter pinned at root, directories before files, alphabetical within; JSON entries enriched with `isDirectory`, `isHtmlWorkspace`, `isAsset`, `isTableData`; non-visible files like `.DS_Store` filtered from both surfaces).
- [ ] Make missing workspace errors suggest `princess list`.
- [x] Protect concurrent HTML resource writes (2026-05-16: per-workspace `.princess.lock` file via new `src/file-lock.ts`; in-process and cross-process safe; PID + age-based stale recovery; wraps all seven HTML write entry points).
- [x] Decide lock/lease strategy for simultaneous writes (2026-05-16: ratified the S3 file-lock approach as M1's answer — per-workspace `.princess.lock`, PID + age-based stale recovery, cross-process safe, no extra services).
- [x] Add external-change detection to the TUI editor (2026-05-16: editor records on-disk mtime at open + after save; save aborts and flips to `conflict` state when on-disk mtime diverges from the baseline; Ctrl+S in conflict state explicitly overwrites; Esc discards in-memory edits; conflict banner replaces the normal footer hints. Inbox view auto-refreshes every 2s with cursor preserved by name).
- [x] Improve revision timestamps for same-day recovery (2026-05-16: new `formatRevisionTimestamp` in `src/revisions.ts` produces `YYYY-MM-DD HH:MM:SS`; the TUI revision list uses it so same-day snapshots are distinguishable).
- [ ] Define browser preview command names.
- [ ] Decide whether browser capture should default to Markdown or HTML.
- [ ] Define the many-agent contribution model for one shared HTML prompt workspace.
- [ ] Decide whether contributions are accepted directly into `prompt.html` or staged for human review.
- [ ] Add a ten-agent stress trial fixture for a migration, 3D, or robotics-style prompt.

## Definition of Done

- Princess can ingest browser context into a durable local prompt artifact.
- Princess can preview useful prompt artifacts in the browser without mutating them.
- Concurrent CLI/resource writes do not lose data.
- Multiple agents can contribute to one HTML prompt workspace without overwriting one another.
- The TUI can detect or safely handle external changes.
- The browser workflow is documented in the agent letter or README.
- `bunx tsc --noEmit`, `bun run test`, and `git diff --check` pass after implementation.
