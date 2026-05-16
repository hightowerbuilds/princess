# Roadmap: Princess Showcase and Stress Tests

Created: 2026-05-16
Status: Active

This roadmap is for proving Princess in public-facing, agent-facing, and failure-prone workflows. The goal is not only to show that Princess is useful, but also to expose the places where the current product needs stronger behavior, clearer guidance, or better ergonomics.

## Guiding Question

Can a human and an agent use Princess as the default local prompt inbox for real work without losing context, guessing file paths, or hand-editing structured prompt packages?

## Current Readiness

The code quality and HTML prompt builder roadmap is complete. Princess now has:

- Markdown prompt creation, editing, copying, revision snapshots, and TUI browsing.
- HTML prompt workspaces with `prompt.html`, `manifest.json`, local `assets/`, `sources/`, `partials/`, and `dist/`.
- CLI section operations for HTML prompts: `set-section`, `list-sections`, `get-section`, `move-section`, and `remove-section`.
- HTML resource operations: `add-source`, `add-asset`, `import-table`, `list`, `remove-resource`, `lint`, and `compile`.
- A root-level default prompt: `A LETTER TO YOUR AGENT FROM PRINCESS`.
- A local install linked from `~/.bun/bin/princess` to this checkout.

Known non-blocking areas to watch during testing:

- Read-only HTML workspace viewing blocks edits correctly, but typing is silent rather than visibly explaining that the file is read-only.
- README limitations need a polish pass; it still describes some older constraints too broadly.

## How to Run a Test

For each project below, record four things:

- **Setup:** What files, assets, or source material were used.
- **Agent transcript:** What the human asked the agent to do and what commands the agent ran.
- **Princess artifact:** The exact prompt file or HTML workspace created.
- **Findings:** What felt excellent, what was confusing, what broke, and what should change.

Every test should end with:

```bash
princess list --json
princess tui
```

For HTML workspaces, also end with:

```bash
princess html lint "<workspace-ref>"
princess html compile "<workspace-ref>" --target markdown
princess html compile "<workspace-ref>" --target json
```

## Baseline Acceptance Checks

- `princess` launches the TUI from a clean shell.
- `princess init` refreshes `AGENT.md` and seeds the root agent letter without duplicating examples.
- `princess list --json` prints the inbox path and prompt entries.
- The root TUI view shows `a-letter-to-your-agent-from-princess.md` as the first visible item.
- `bunx tsc --noEmit` passes.
- `bun run test` passes.
- `git diff --check` passes.

## Showcase Projects

### 1. Agent Onboarding Trial

**Purpose:** Prove that a new agent can understand Princess from the default letter without extra explanation.

**Task:** Start a fresh agent session and ask it: "Please read my Princess instructions and save a reusable prompt for planning a design review."

**Success criteria:**

- The agent finds the inbox with `princess list --json`.
- The agent creates a Markdown prompt in the inbox, not just chat output.
- The saved file has useful frontmatter and a clear title.
- The agent reports the saved path and suggests `princess tui`.

**Stress signals:**

- Agent asks where the inbox is after reading the letter.
- Agent writes into `examples/` instead of the root or requested folder.
- Agent claims a prompt is saved without actually writing a file.

### 2. Markdown Prompt Daily Use — Completed 2026-05-16

**Purpose:** Show the core prompt inbox is fast for ordinary prompt work.

**Task:** Create five realistic Markdown prompts: code review, product critique, bug report triage, visual design QA, and release-note drafting.

**Success criteria:**

- Prompt creation is collision-safe (`-2`, `-3`, etc.).
- Categories keep the inbox tidy.
- TUI search finds prompts by title, body, status, and category.
- Copying from the TUI puts the expected prompt on the clipboard.

**Stress signals:**

- Search misses obvious terms.
- Long prompt bodies make navigation feel sluggish.
- Category paths are hard for agents to reason about.

### 3. HTML Landing Page Brief — Completed 2026-05-16

**Purpose:** Demonstrate the HTML prompt builder for a real frontend build request.

**Task:** Build an HTML prompt workspace for a landing page project with sections for `instructions`, `context`, `constraints`, `examples`, and `output-format`.

**Required commands:**

```bash
princess create-prompt "Landing Page Build Brief" --format html --category "showcase"
princess html set-section "showcase/html prompts/landing-page-build-brief" instructions --text "..."
princess html set-section "showcase/html prompts/landing-page-build-brief" context --from ./context.md
princess html set-section "showcase/html prompts/landing-page-build-brief" constraints --text "..."
princess html move-section "showcase/html prompts/landing-page-build-brief" output-format --after examples
princess html lint "showcase/html prompts/landing-page-build-brief"
princess html compile "showcase/html prompts/landing-page-build-brief" --target json
```

**Success criteria:**

- Sections are easy to inspect and reorder.
- Compiled Markdown is readable enough to paste into a plain chat.
- Compiled JSON gives a useful model-ready package.
- TUI shows the workspace with an `[html]` badge and opens `prompt.html` read-only.

**Stress signals:**

- Workspace refs are hard to remember.
- Section command errors are unclear.
- Read-only behavior feels like a bug instead of a deliberate guardrail.

### 4. Asset-Heavy Prompt Package — Completed 2026-05-16

**Purpose:** Prove Princess can organize prompt context that includes screenshots, sketches, or reference files.

**Task:** Create an HTML prompt for reviewing a UI screenshot and implementation notes.

**Required commands:**

```bash
princess html add-source "<workspace-ref>" ./notes.md --name notes --trust trusted
princess html add-asset "<workspace-ref>" ./screenshot.png --name screenshot --alt "Screenshot of the current UI state"
princess html compile "<workspace-ref>" --target json
```

**Success criteria:**

- The JSON output names asset attachments clearly.
- Alt text is carried into the prompt package.
- The compiled text does not falsely imply binary assets are embedded.

**Stress signals:**

- Agent forgets `--alt`.
- Asset paths are confusing after compile.
- Manifest/resource state drifts after manual file edits.

### 5. Data and Table Import — Completed 2026-05-16

**Purpose:** Show that Princess can turn small structured datasets into prompt context.

**Task:** Create an HTML prompt that imports a CSV feature matrix and asks an agent to produce a prioritization recommendation.

**Required commands:**

```bash
princess html import-table "<workspace-ref>" ./features.csv --name features --trust untrusted
princess html lint "<workspace-ref>"
princess html compile "<workspace-ref>" --target markdown
```

**Success criteria:**

- CSV and TSV import both work.
- The generated table is readable in compiled Markdown.
- Trust labels make source ownership clear.

**Stress signals:**

- Large tables produce unwieldy prompts.
- Special characters or quoted CSV cells render incorrectly.
- The lint output does not help fix malformed input.

### 6. Existing Project Handoff — Completed 2026-05-16

**Purpose:** Test Princess in the situation it is meant for: an agent working inside a real codebase.

**Task:** Ask an agent to inspect a small app, write a prompt for a future refactor, and save it into Princess.

**Success criteria:**

- Agent summarizes real repo context in the prompt.
- Prompt points to relevant files without copying too much code.
- Agent uses categories to keep the inbox organized.

**Stress signals:**

- Prompt becomes too generic to be useful later.
- Agent copies excessive source text into the prompt.
- Saved path is hard to find in the TUI.

### 7. Revision and Recovery Drill — Completed 2026-05-16

**Purpose:** Prove that human editing in the TUI is safe.

**Task:** Open a Markdown prompt in the TUI, make several edits, save snapshots with `Ctrl+S`, view the diff with `Ctrl+R`, browse revisions with `Ctrl+P`, and copy an old revision.

**Success criteria:**

- Autosave is predictable.
- Forced snapshots are visible.
- Diffs are understandable.
- Revision copy works.

**Stress signals:**

- User cannot tell whether changes are saved.
- Diff view is hard to read for long prompts.
- Revision list lacks enough metadata.

### 8. Local Workspace Trial — Completed 2026-05-16

**Purpose:** Prove project-local Princess works independently from the global inbox.

**Task:** In a temporary project, run `princess init --local`, create Markdown and HTML prompts, then compare `princess list --json` inside and outside the project.

**Success criteria:**

- Local `.princess/inbox` is preferred inside the project.
- Global inbox is still used outside the project.
- Agent instructions point to the correct local inbox.

**Stress signals:**

- Agents accidentally write to global when local was intended.
- TUI does not make local/global context obvious enough.

### 9. Collision and Naming Trial — Completed 2026-05-16

**Purpose:** Ensure repeated agent use does not overwrite previous prompt work.

**Task:** Ask an agent to create the same Markdown prompt title three times and the same HTML prompt title three times.

**Success criteria:**

- Markdown files suffix cleanly.
- HTML workspace folders suffix cleanly.
- Agent notices and reports the exact created path.

**Stress signals:**

- Agent writes to the first path after Princess created a suffixed path.
- TUI ordering makes duplicates hard to distinguish.

### 10. Broken Input and Lint Trial — Completed 2026-05-16

**Purpose:** Find unclear error messages before users do.

**Task:** Deliberately run bad commands: missing workspace, invalid role, protected resources move/remove, missing asset file, malformed CSV, and invalid compile target.

**Success criteria:**

- Errors name the failing workspace/file/role.
- Protected `resources` behavior is explicit.
- Lint catches problems before compile.

**Stress signals:**

- Errors are technically correct but not actionable.
- Commands fail silently.
- Agents recover poorly from a failed command.

## Project Ideas for Demos

- **Website redesign prompt package:** screenshot asset, existing copy source, constraints section, output-format section.
- **Code review prompt kit:** source excerpts, risk checklist, severity rubric, final response format.
- **Bug reproduction prompt:** logs, environment notes, observed/expected behavior, investigation constraints.
- **AI agent onboarding bundle:** project rules, repo map, setup commands, known hazards, acceptance checks.
- **Product strategy prompt:** customer notes, feature table, decision criteria, recommendation format.
- **Design QA prompt:** screenshots, brand rules, accessibility checklist, viewport matrix.
- **Release manager prompt:** merged PR list, changelog draft rules, risk callouts, rollout checklist.

## Trial Run Log

### Trial 2 — Markdown Prompt Daily Use

**Date:** 2026-05-16

**Setup:** Created a dedicated category in the installed global inbox: `showcase/markdown-daily-use`.

**Agent transcript summary:**

- Ran `princess create-prompt` for five prompt types: code review, product critique, bug report triage, visual design QA, and release-note drafting.
- Wrote realistic Markdown bodies into each generated file.
- Created one duplicate `Daily Code Review Checklist` prompt to verify collision suffixing, confirmed `daily-code-review-checklist-2.md`, then removed the duplicate cleanup file.
- Queried the same search path used by TUI search for terms from the prompt bodies.
- Opened the TUI, searched `release notes`, copied the selected prompt, and verified the macOS clipboard with `pbpaste`.

**Princess artifacts:**

- `showcase/markdown-daily-use/daily-code-review-checklist.md`
- `showcase/markdown-daily-use/product-critique-brief.md`
- `showcase/markdown-daily-use/bug-report-triage-prompt.md`
- `showcase/markdown-daily-use/visual-design-qa-prompt.md`
- `showcase/markdown-daily-use/release-notes-drafting-prompt.md`

**Checks passed:**

- `princess list --category "showcase/markdown-daily-use"` shows the five prompt files.
- Body-term search found the expected prompt for `pull request`, `workflow fit`, `severity`, `visual quality`, and `release notes`.
- Duplicate prompt creation used `daily-code-review-checklist-2.md` instead of overwriting the original.
- TUI search found `showcase/markdown-daily-use/release-notes-drafting-prompt.md`.
- TUI copy placed the full release-notes prompt on the clipboard.

**Findings:**

- The first sandboxed `create-prompt` attempt exposed a code-quality issue: `ensureInbox()` catches and ignores `mkdir` failures, so the later file write reports `ENOENT` while the command exits successfully. In a real terminal with filesystem access the command works, but Princess should still surface directory-creation failures properly.
- `princess list --category` returns filesystem order, not sorted display order. It works, but the output is less polished than the TUI and makes duplicate/collision checks harder to scan.
- Scripted TUI smoke tests are noisy because the animated render loop continuously writes frames. This is acceptable for human use, but a non-animated smoke-test mode would make future trial automation cleaner.

### Trial 3 — HTML Landing Page Brief

**Date:** 2026-05-16

**Setup:** Created source fixture files under `daily-growth/trial-fixtures/landing-page-build-brief/`:

- `context.md`
- `examples.md`
- `output-format.md`

Created an installed Princess HTML workspace:

- `showcase/html prompts/landing-page-build-brief/`

**Agent transcript summary:**

- Ran `princess create-prompt "Landing Page Build Brief" --format html --category "showcase"`.
- Used `princess html set-section` for `instructions`, `context`, `constraints`, `examples`, and `output-format`.
- Used `--from` for the context, examples, and output-format fixture files.
- Ran `princess html list-sections` and confirmed the order: `instructions`, `context`, `constraints`, `examples`, `output-format`, `resources`.
- Ran `princess html move-section "showcase/landing-page-build-brief" output-format --after examples`.
- Ran `princess html lint` and compiled `html`, `markdown`, and `json` targets.
- Queried the TUI search index for `local-first`; it returned `showcase/html prompts/landing-page-build-brief` as an HTML workspace after the showcase reorganization.
- Render-checked the inbox view with an HTML workspace entry and confirmed the `[html]` badge.
- Render-checked `prompt.html` in editor state and confirmed `[read-only]`.

**Princess artifacts:**

- `showcase/html prompts/landing-page-build-brief/prompt.html`
- `showcase/html prompts/landing-page-build-brief/manifest.json`
- `showcase/html prompts/landing-page-build-brief/dist/compiled.html`
- `showcase/html prompts/landing-page-build-brief/dist/compiled.md`
- `showcase/html prompts/landing-page-build-brief/dist/compiled.json`

**Checks passed:**

- Section creation, list, and move commands worked.
- Lint passed.
- Compile targets were written under `dist/`.
- TUI search index finds the HTML workspace from section content.
- TUI rendering supports `[html]` badge and `[read-only]` editor state for the workspace.

**Findings:**

- The create command prints the absolute workspace path, but follow-up `princess html` commands expect an inbox-relative workspace ref such as `showcase/html prompts/landing-page-build-brief`. This is manageable but creates friction for agents and new users.
- `set-section --from some.md` treats Markdown as plain text paragraphs by default. The compiled output preserves Markdown headings/bullets as literal text inside HTML paragraphs rather than converting them into semantic HTML.
- `compile --target markdown` currently wraps the preserved HTML document in a fenced code block. This preserves structure, but it is less paste-ready for a plain chat than the agent letter implies.
- Empty `resources` output is structurally correct, but the generated `resources` section formatting is slightly cramped after the previous section in compiled output.

### Trial 4 — Asset-Heavy Prompt Package

**Date:** 2026-05-16

**Setup:** Created repeatable fixture assets under `daily-growth/trial-fixtures/asset-heavy-prompt-package/`:

- `notes.md`
- `wireframe.svg`

Created an installed Princess HTML workspace:

- `showcase/html prompts/ui-screenshot-review-package/`

**Agent transcript summary:**

- Ran `princess create-prompt "UI Screenshot Review Package" --format html --category "showcase"`.
- Added `instructions`, `constraints`, and `output-format` sections.
- Ran `princess html add-source "showcase/ui-screenshot-review-package" daily-growth/trial-fixtures/asset-heavy-prompt-package/notes.md --name notes --trust trusted`.
- Ran `princess html add-asset "showcase/ui-screenshot-review-package" daily-growth/trial-fixtures/asset-heavy-prompt-package/wireframe.svg --name wireframe --alt "Wireframe of the Princess TUI showing sidebar folders, prompt list, read-only HTML detail panel, and copy action"`.
- Initially ran the source and asset adds in parallel, which exposed a manifest write race. Repaired the workspace by re-adding resources sequentially.
- Reorganized showcase HTML prompts under `showcase/html prompts/`, added `showcase/html prompts/assets/`, copied `wireframe.svg` into that shared assets folder for browsing, and recompiled moved workspaces.
- Ran `princess html list`, `lint`, and compiled `json`, `markdown`, and `html`.
- Queried the TUI search index for `wireframe`, `read-only html workspaces`, and `state cues`; the workspace was returned as an HTML workspace.

**Princess artifacts:**

- `showcase/html prompts/assets/wireframe.svg`
- `showcase/html prompts/ui-screenshot-review-package/prompt.html`
- `showcase/html prompts/ui-screenshot-review-package/manifest.json`
- `showcase/html prompts/ui-screenshot-review-package/assets/wireframe.svg`
- `showcase/html prompts/ui-screenshot-review-package/sources/notes.md`
- `showcase/html prompts/ui-screenshot-review-package/dist/compiled.html`
- `showcase/html prompts/ui-screenshot-review-package/dist/compiled.md`
- `showcase/html prompts/ui-screenshot-review-package/dist/compiled.json`

**Checks passed:**

- Resource list shows `wireframe` as an asset with alt text and `notes` as a trusted source.
- Lint passes after sequential resource repair.
- JSON compile includes an `attachments` entry for `wireframe` with absolute path, `image/svg+xml`, and the supplied alt text.
- JSON compile includes both manifest resources, preserving source trust metadata.
- Markdown compile includes an `Asset Attachments` section and the warning that asset files must be attached separately.
- TUI search index finds the workspace from both asset metadata and source-note content.
- `princess list --category "showcase/html prompts/assets"` shows `wireframe.svg` as an image asset filename. Assets are listed by name; Princess does not attempt to render the image in the TUI.

**Findings:**

- Concurrent resource writes can lose manifest updates. `add-source` and `add-asset` both reported success when run in parallel, but only one resource remained in `manifest.json`, causing lint to fail with `unknown-include`.
- Re-adding the source after the race produced a duplicate source snippet in `prompt.html`. `remove-resource` plus a single sequential `add-source` repaired it.
- Lint catches unknown includes, but it did not flag duplicate resource snippets with the same `data-princess-id`.
- Resource snippets are functionally correct, but formatting/indentation around appended resource blocks is cramped.
- The JSON attachment output is clear and useful for agents. The Markdown output also clearly says assets remain separate attachments.

### Trial 5 — Data and Table Import

**Date:** 2026-05-16

**Setup:** Created repeatable table fixtures under `daily-growth/trial-fixtures/data-table-import/`:

- `features.csv`
- `scoring.tsv`

Created shared installed Princess table staging files:

- `showcase/html prompts/tables/features.csv`
- `showcase/html prompts/tables/scoring.tsv`

Created an installed Princess HTML workspace:

- `showcase/html prompts/feature-prioritization-matrix/`

**Agent transcript summary:**

- Ran `princess create-prompt "Feature Prioritization Matrix" --format html --category "showcase/html prompts"`.
- Added `instructions`, `constraints`, and `output-format` sections.
- Created `showcase/html prompts/tables/` as a shared place for users or agents to drop CSV/TSV files before import.
- Copied fixture `features.csv` and `scoring.tsv` into that shared tables folder.
- Imported `features.csv` as an untrusted table and `scoring.tsv` as a trusted table.
- Ran `princess html list`, `lint`, and compiled `html`, `markdown`, and `json`.
- Updated Princess listing behavior so CSV/TSV files in the inbox are visible by filename as table items instead of being hidden.
- Added regression coverage for CLI table-file listing, TUI table-file rendering, and TUI search indexing of imported table partial text.

**Princess artifacts:**

- `showcase/html prompts/tables/features.csv`
- `showcase/html prompts/tables/scoring.tsv`
- `showcase/html prompts/feature-prioritization-matrix/prompt.html`
- `showcase/html prompts/feature-prioritization-matrix/manifest.json`
- `showcase/html prompts/feature-prioritization-matrix/partials/features.table.html`
- `showcase/html prompts/feature-prioritization-matrix/partials/scoring.table.html`
- `showcase/html prompts/feature-prioritization-matrix/dist/compiled.html`
- `showcase/html prompts/feature-prioritization-matrix/dist/compiled.md`
- `showcase/html prompts/feature-prioritization-matrix/dist/compiled.json`

**Checks passed:**

- CSV and TSV import both work.
- `features` is preserved as an untrusted resource and `scoring` is preserved as a trusted resource.
- CSV quoted commas, `<tags>`, and `&` render safely in generated table HTML.
- TSV rows import into the generated table correctly.
- `princess list --category "showcase/html prompts/tables"` shows `features.csv` and `scoring.tsv` as table filenames.
- TUI search indexing includes imported table partial content such as `User impact`.
- Lint passes and all compile targets write output under `dist/`.

**Findings:**

- The shared `tables/` folder is useful enough to keep next to `assets/`: it gives humans and agents a visible staging place for CSV/TSV data before importing it into a workspace.
- Table files should be listed by name only, like image assets. Princess now treats `.csv` and `.tsv` files as visible reference files without rendering their contents in the TUI.
- `compile --target markdown` is readable, but it still wraps raw HTML in a fenced block. Imported tables are present, but the result is not a clean Markdown table.
- Resource snippets around imported tables are functionally correct but visually cramped, especially when several resources are appended.

### Trial 6 — Existing Project Handoff

**Date:** 2026-05-16

**Setup:** Used the Princess repository itself as the existing project under review.

Created an installed Princess prompt category:

- `showcase/project-handoffs/`

Created an installed Princess Markdown prompt:

- `showcase/project-handoffs/princess-cli-refactor-handoff.md`

**Agent transcript summary:**

- Inspected the active Trial 6 requirements and the current repo structure.
- Read public project context from `README.md` and package scripts from `package.json`.
- Inspected the main CLI, HTML workspace, path, storage, prompt, and inbox-file policy modules.
- Identified `src/cli/index.ts` as the best future-refactor target because it currently owns argument parsing, first-run setup, prompt creation, list output, Claude note wiring, and HTML subcommand dispatch.
- Ran `princess create-prompt "Princess CLI Refactor Handoff" --category "showcase/project-handoffs"`.
- Wrote a compact handoff prompt with project context, relevant file paths, refactor goal, constraints, suggested implementation path, verification commands, and expected output.
- Verified that the category lists correctly and that the TUI search index finds the prompt by body text.

**Princess artifacts:**

- `showcase/project-handoffs/princess-cli-refactor-handoff.md`

**Checks passed:**

- Prompt summarizes real Princess repo context instead of generic advice.
- Prompt references relevant files by path without copying large code sections.
- Category organization keeps project handoffs separate from HTML prompt showcases.
- `princess list --category "showcase/project-handoffs"` shows the saved prompt.
- TUI search indexing finds the prompt for `HTML subcommand dispatcher`.

**Findings:**

- The existing agent workflow works for this trial: create the prompt, then write the full Markdown body directly into the created file.
- For agents, `create-prompt` would be easier to automate with a `--json` option that returns the created path and whether a collision suffix was used.
- Prompt metadata such as `status` and `updatedAt` must be maintained manually when an agent overwrites a newly created Markdown prompt.
- The prompt stayed useful because it named concrete files and a specific refactor target. A more generic "refactor Princess" prompt would not have met the trial goal.

### Trial 7 — Revision and Recovery Drill

**Date:** 2026-05-16

**Setup:** Created an installed Princess Markdown prompt category:

- `showcase/revision-recovery-drill/`

Created an installed Princess Markdown prompt:

- `showcase/revision-recovery-drill/revision-recovery-drill.md`

**Agent transcript summary:**

- Ran `princess create-prompt "Revision Recovery Drill" --category "showcase/revision-recovery-drill"`.
- Wrote a controlled baseline prompt for the revision drill.
- Opened the prompt through the TUI search flow.
- Added `tui edit one adds recovery note` in the editor and used `Ctrl+S` to force a revision snapshot.
- Added `tui edit two adds second pass` and used `Ctrl+S` again.
- Used `Ctrl+R` to open the diff view against the latest saved revision.
- Used `Ctrl+P` to browse saved revisions.
- Selected the older revision, opened its preview, and copied it with `c`.
- Verified the clipboard with `pbpaste`.
- Changed the inbox message label from `Error:` to a neutral `Status:` so successful revision-copy notices do not look like failures.

**Princess artifacts:**

- `showcase/revision-recovery-drill/revision-recovery-drill.md`
- `revisions/showcase/revision-recovery-drill/revision-recovery-drill.md/2026-05-16T18-14-14-450Z.md`
- `revisions/showcase/revision-recovery-drill/revision-recovery-drill.md/2026-05-16T18-14-20-903Z.md`

**Checks passed:**

- The final prompt contains both TUI edits.
- Two revision snapshots were created.
- The older revision contains neither TUI edit.
- The newer revision contains the first edit but not the second edit.
- The diff view clearly showed `+ tui edit two adds second pass`.
- The revision list showed two snapshots and line delta metadata for the newest snapshot.
- The old revision copied to the system clipboard successfully.

**Findings:**

- The recovery workflow works end to end when the TUI can write to the installed Princess data directory.
- In this PTY environment, `Ctrl+S` can be intercepted by terminal flow control unless IXON is disabled. Running with `stty -ixon` allowed Princess to receive `Ctrl+S`.
- A sandboxed TUI wrapper failed to save revisions with `EPERM` when it tried to create `/Users/lukehightower/.local/share/princess/revisions/showcase`. The error surfaced clearly, but the failed save left the edit only in memory.
- Revision list metadata is useful, but timestamps only show the date in the visible list. Multiple snapshots from the same day are hard to distinguish without opening previews.
- TUI saves do not refresh the Markdown frontmatter `updatedAt`, so the prompt still displays the pre-drill update timestamp after successful edits.

### Trial 8 — Local Workspace Trial

**Date:** 2026-05-16

**Setup:** Created a fixture project under:

- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/`

Created fixture source files:

- `README.md`
- `src/app.ts`

Initialized a project-local Princess workspace:

- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/`

**Agent transcript summary:**

- Ran `princess init --local` from the fixture project root.
- Verified Princess created `.princess/inbox` and `.princess/AGENT.md` inside the fixture.
- Created a local Markdown prompt with `princess create-prompt "Local Markdown Refactor Note" --category "handoffs"`.
- Created a local HTML workspace with `princess create-prompt "Local HTML Fixture Brief" --format html --category "html"`.
- Added HTML sections for `instructions`, `constraints`, and `output-format`.
- Attached `src/app.ts` as a trusted local source named `sample-app`.
- Ran `princess html lint` and compiled `markdown` and `json` targets.
- Compared `princess list --json` inside the fixture project to `princess list --json` from the main Princess repo root.
- Ran `princess list --json` from the fixture `src/` subdirectory to confirm ancestor `.princess` discovery.
- Rendered the inbox view with the process cwd set to the fixture project and confirmed the `PROJECT LOCAL` banner and local filesystem path appear.

**Princess artifacts:**

- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/AGENT.md`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/a-letter-to-your-agent-from-princess.md`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/handoffs/local-markdown-refactor-note.md`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/html/local-html-fixture-brief/prompt.html`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/html/local-html-fixture-brief/manifest.json`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/html/local-html-fixture-brief/sources/sample-app.ts`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/html/local-html-fixture-brief/dist/compiled.md`
- `daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/html/local-html-fixture-brief/dist/compiled.json`

**Checks passed:**

- Inside the fixture project, `princess list --json` reports the inbox as `sample-project/.princess/inbox`.
- From the main Princess repo root, `princess list --json` still reports the global inbox at `/Users/lukehightower/.local/share/princess/inbox`.
- From `sample-project/src`, `getPaths()` reports `isLocal: true` and uses the ancestor `.princess` directory.
- `.princess/AGENT.md` names the local fixture inbox path, not the global inbox.
- Local Markdown and HTML prompts are both stored under the fixture `.princess/inbox`.
- The local HTML workspace lints and compiles.
- The TUI inbox view shows the `PROJECT LOCAL` badge and `You are here:` path for the local inbox.

**Findings:**

- Project-local discovery works from both the project root and nested subdirectories.
- The local `AGENT.md` gives agents the correct local inbox path, which is the key guardrail against accidentally writing to global Princess.
- The TUI local/global cue is clear because of the `PROJECT LOCAL` badge.
- Very long local inbox paths truncate in the TUI location card at normal terminal widths. The path signal is present, but users may not see the full path without a wider terminal.
- `princess list --json` exposes the correct inbox path but still returns directory entries in filesystem order, so local/global comparison is accurate but not as visually stable as it could be.

### Trial 9 — Collision and Naming Trial

**Date:** 2026-05-16

**Setup:** Created a dedicated category in the installed global inbox:

- `showcase/collision-naming-trial/`

**Agent transcript summary:**

- Confirmed the trial category did not already exist with `princess list --category "showcase/collision-naming-trial"`.
- Ran `princess create-prompt "Collision Naming Drill" --category "showcase/collision-naming-trial"` three times.
- Ran `princess create-prompt "Collision HTML Drill" --format html --category "showcase/collision-naming-trial"` three times.
- Confirmed each `create-prompt` response printed the exact absolute path created under `/Users/lukehightower/.local/share/princess/inbox/showcase/collision-naming-trial/`.
- Wrote unique marker text into each Markdown prompt and each HTML workspace's `instructions` section.
- Ran category listing, JSON listing, marker search, and HTML lint checks.

**Princess artifacts:**

- `showcase/collision-naming-trial/collision-naming-drill.md`
- `showcase/collision-naming-trial/collision-naming-drill-2.md`
- `showcase/collision-naming-trial/collision-naming-drill-3.md`
- `showcase/collision-naming-trial/collision-html-drill/`
- `showcase/collision-naming-trial/collision-html-drill-2/`
- `showcase/collision-naming-trial/collision-html-drill-3/`

**Checks passed:**

- Markdown prompt creation suffixes cleanly: base file, `-2`, and `-3`.
- HTML workspace creation suffixes cleanly: base folder, `-2`, and `-3`.
- No prior prompt or workspace was overwritten.
- Unique Markdown markers stayed in their expected files.
- Unique HTML markers stayed in their expected `prompt.html` files.
- `princess list --category "showcase/collision-naming-trial"` shows all six artifacts.
- `princess html lint` passes for all three HTML workspaces.

**Findings:**

- Collision-safe naming works for both Markdown prompts and HTML workspaces.
- The absolute path printed by `create-prompt` is the most important guardrail for agents; after a collision, agents must use the returned suffixed path instead of reconstructing a slug from the title.
- The initial failed `set-section` command produced an actionable error: `Use exactly one of --text or --from for set-section.`
- `princess list --category` still uses filesystem order, so duplicate groups are not visually clustered. This is not data loss, but it makes collision review harder than it should be.

### Trial 10 — Broken Input and Lint Trial

**Date:** 2026-05-16

**Setup:** Created a repeatable malformed table fixture:

- `daily-growth/trial-fixtures/broken-input-lint-trial/malformed.csv`

Created an installed Princess HTML workspace:

- `showcase/broken-input-lint-trial/broken-input-lint-drill/`

**Agent transcript summary:**

- Ran bad commands for a missing workspace, invalid section role, protected `resources` removal, protected `resources` move, missing asset file, malformed CSV import, and invalid compile target.
- Initial run exposed three real issues: section role `!!!` was accepted as `untitled-prompt`, malformed CSV imported as a one-cell row, and thrown CLI errors printed Bun source frames.
- Updated Princess so CLI errors render as one-line `error: ...` messages.
- Updated HTML section role validation so roles must contain at least one letter or number.
- Updated table import validation so malformed CSV/TSV input fails before writing a partial or manifest resource.
- Replayed the bad-command matrix against the installed `princess` command.
- Removed the accidental pre-fix `untitled-prompt` section and `malformed` table resource from the trial workspace.

**Princess artifacts:**

- `showcase/broken-input-lint-trial/broken-input-lint-drill/prompt.html`
- `showcase/broken-input-lint-trial/broken-input-lint-drill/manifest.json`

**Code artifacts:**

- `src/cli/index.ts`
- `src/cli/index.test.ts`
- `src/html-prompts.ts`
- `src/html-prompts.test.ts`

**Checks passed:**

- Missing workspace fails with `error: HTML prompt workspace manifest not found: .../missing-workspace/manifest.json`.
- Invalid role fails with `error: Invalid section role "!!!". Use at least one letter or number.`
- Protected remove fails with `error: Section "resources" is auto-managed and cannot be removed.`
- Protected move fails with `error: Section "resources" is auto-managed and cannot be moved.`
- Missing asset fails with `error: Source file not found: .../missing.png`.
- Invalid compile target fails with `error: Invalid compile target "pdf". Use "html", "markdown", or "json".`
- Malformed CSV import fails with `error: Failed to import table ".../malformed.csv": Malformed table source: unterminated quoted field.`
- The cleaned trial workspace has only `instructions` and `resources` sections, no attached resources, and passes `princess html lint`.

**Findings:**

- This trial exposed product issues that were worth fixing immediately because they affected agent recovery.
- One-line CLI errors are much easier for agents and humans to act on than source-frame stack traces.
- Rejecting invalid section roles protects users from accidental `untitled-prompt` sections.
- Malformed table input now fails before modifying the workspace, which is stronger than relying on lint after a bad import.
- Missing workspace errors are correct and name the manifest path, but they could still be friendlier by echoing the workspace ref and suggesting `princess list`.

## Findings Backlog

Add findings here as tests run. Keep each item small and actionable.

- [x] HTML workspace search: TUI search now indexes each HTML workspace as one result using `prompt.html`, manifest/resource metadata, readable source files, and table partials. It does not index internal workspace files as separate prompt results.
- [x] CLI error formatting: top-level command failures now print one-line `error: ...` messages instead of Bun source frames.
- [x] HTML section role validation: reject roles that sanitize to an empty value instead of creating `untitled-prompt` sections.
- [x] HTML table import validation: reject malformed CSV/TSV before writing partials or manifest resources.
- [ ] Read-only TUI feedback: show a short status message when typing or saving is blocked in an HTML workspace viewer.
- [ ] README polish: update stale limitations and add section-operation examples.
- [ ] Workspace ref ergonomics: decide whether commands should accept absolute workspace paths in addition to inbox-relative refs.
- [ ] Missing workspace ergonomics: echo the requested workspace ref and suggest `princess list` when an HTML workspace cannot be found.
- [ ] Compile ergonomics: decide whether `compile --target json` should print the dist path more prominently for agents.
- [ ] Demo assets: create a small fixture folder with screenshot, notes, and CSV files for repeatable showcase runs.
- [ ] CLI reliability: stop swallowing `mkdir` failures in `ensureInbox()` and make failed `create-prompt` commands exit non-zero.
- [ ] CLI list polish: sort `princess list` output consistently with TUI display ordering.
- [ ] TUI duplicate disambiguation: make same-title prompts easier to distinguish by showing collision suffixes, timestamps, or full relative paths more prominently.
- [ ] TUI testability: add a non-animated or low-frame-rate mode for scripted smoke tests.
- [ ] HTML authoring ergonomics: decide whether `set-section --from *.md` should support Markdown-to-HTML conversion or make plain-text treatment explicit.
- [ ] Markdown compile target: decide whether `--target markdown` should emit cleaner plain Markdown instead of fenced raw HTML.
- [ ] HTML formatter polish: keep the auto-managed `resources` section visually separated after section moves and compiles.
- [ ] HTML resource write safety: serialize or lock manifest updates so concurrent `add-source` / `add-asset` commands cannot lose resources.
- [ ] HTML lint coverage: flag duplicate resource snippets with the same `data-princess-id` and resource type.
- [ ] HTML table compile polish: emit cleaner Markdown tables for imported CSV/TSV data when compiling with `--target markdown`.
- [ ] HTML resource formatter: normalize indentation and spacing for table, source, and asset snippets.
- [ ] CLI agent ergonomics: add `--json` output to `create-prompt` so agents can reliably capture the created path and collision suffix.
- [ ] Prompt metadata ergonomics: provide an agent-friendly way to mark a prompt ready and refresh `updatedAt` after direct file edits.
- [ ] TUI terminal compatibility: handle or document `Ctrl+S` terminal flow-control conflicts, or disable IXON when entering raw mode where supported.
- [ ] TUI revision list polish: show time as well as date so same-day revision snapshots are distinguishable.
- [ ] TUI save metadata: refresh prompt frontmatter `updatedAt` when Markdown prompts are saved from the editor.
- [ ] TUI path display: provide a way to view or copy the full active inbox path when it is too long for the location card.

## Definition of Done

- At least ten trials above have been run once by an agent and once by a human.
- Every trial has a saved artifact in Princess or a recorded failure explaining why not.
- The findings backlog has been triaged into must-fix, should-fix, and nice-to-have.
- A short demo script exists for the best three showcase projects.
- `bunx tsc --noEmit`, `bun run test`, and `git diff --check` pass after any fixes that come out of the trials.
