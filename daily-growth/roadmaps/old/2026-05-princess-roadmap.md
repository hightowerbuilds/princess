# Princess Roadmap
**Date:** May 2026
**Scope:** Product direction, TUI relevance, and guardrails for a coding-agent prompt inbox

## Goal

Princess should be the fastest reliable place for a coding agent to deposit, refine, and reuse prompts. The app wins when it turns chat output into durable, inspectable files with enough structure that humans and agents can act on them later.

The terminal UI should feel current in 2026 by being dense, confident, and operational rather than decorative. It should look like a serious command surface for prompt work, not a retro demo or a generic note app.

## What The App Should Be

Princess should be:

- A local prompt inbox with plain-file storage.
- A lightweight editor and browser for prompt assets.
- A review surface for agents and humans to inspect prompt history.
- A place where prompts become reusable artifacts, not chat leftovers.

Princess should not become:

- A general-purpose note app.
- A full database-backed knowledge system.
- A chat UI replacement.
- A terminal toy that spends more effort looking clever than being useful.

## What Is Missing Today

The current app is strong at storage and basic editing, but weak at workflow context. The next useful layer is not more UI polish alone. It is metadata, retrieval, and trust.

Missing capabilities:

- Prompt metadata such as purpose, source, model, date, status, and tags.
- Search and filtering across prompts and categories.
- Prompt versioning or at least a change trail.
- Diffing between revisions.
- A way to mark prompts as tested, approved, stale, or failed.
- Better handling for prompt templates and reusable fragments.
- A simple evaluation loop for agent-facing prompts.
- Safer file editing with explicit save semantics or durable atomic writes.
- Stronger TUI test coverage for inbox navigation and editor behavior.

## Product Roadmap

### Tier 1: Must-Have For Agent Usefulness

These changes make Princess meaningfully better for coding agents.

1. Add frontmatter to prompt files.
   - Store title, category, source, model, created-at, updated-at, and status.
   - Keep Markdown as the payload, but give agents structured fields to read.

2. Add inbox search.
   - Search by title, content, tags, and category.
   - Support prefix filtering and quick narrowing from the TUI.

3. Add prompt history.
   - Preserve revisions or snapshots instead of overwriting context blindly.
   - Surface when a prompt changed and why.

4. Add prompt state markers.
   - Track `draft`, `ready`, `used`, `stale`, and `rejected`.
   - Let agents and humans know whether a prompt is still trustworthy.

5. Add basic diffing.
   - Show what changed between versions.
   - Make it easy to answer “what was edited?” and “what worked?”

6. Add a structured prompt creation flow.
   - Allow new prompts to start with optional metadata and template type.
   - Keep CLI defaults simple.

### Tier 2: Should-Have For 2026 Relevance

These changes make the TUI feel current instead of merely functional.

1. Replace the mascot-first inbox header with an information-first layout.
   - Keep branding, but make the top region convey state, not just identity.
   - Prioritize current folder, selected item, status, and shortcuts.

2. Add a persistent command/status rail.
   - Show mode, path, filter state, and save state.
   - Reserve the bottom line for action feedback and errors.

3. Add metadata chips.
   - Display category, status, timestamp, and model in compact pills.
   - Keep them monochrome or low-saturation unless focused.

4. Improve empty states.
   - Empty inboxes should explain the next useful action.
   - Empty search results should suggest the closest filter or folder.

5. Use motion sparingly and intentionally.
   - Prefer subtle focus transitions, staged reveal on load, and fast feedback.
   - Avoid “animation for animation’s sake.”

6. Make selection and focus more explicit.
   - Stronger cursor treatment.
   - Clear separation between list focus, editor focus, and command feedback.

7. Improve typography and spacing discipline.
   - Use hierarchy through weight, density, and alignment.
   - Avoid a logo-heavy or banner-heavy layout that wastes vertical space.

### Tier 3: Nice-To-Have, If The Core Is Stable

These are valuable, but only after the workflow is trusted.

- Prompt templates and fragments.
- Smart categories or saved views.
- Batch operations on selected prompts.
- Clipboard history integration.
- Export/import bundles.
- Cross-device sync, if it ever becomes necessary.
- Agent usage analytics, if privacy and local-first guarantees can be preserved.

## TUI Direction For 2026

The TUI should lean into a modern operator-console aesthetic:

- High information density without clutter.
- Strong contrast and restrained color.
- Clear mode boundaries between browse, edit, search, and review.
- Short, trustworthy feedback loops.
- Minimal ornament, maximal legibility.

Visual cues should communicate:

- What folder or prompt is active.
- Whether the file is saved, dirty, or failed.
- Whether the user is in inbox, editor, or search.
- Which action is the primary next step.

Good visual references are not retro command-line nostalgia. They are modern dev tools, dashboards, and command surfaces that use the terminal as a focused work environment.

## Paths To Avoid

1. Avoid turning Princess into a generic second brain.
   - That direction dilutes the agent-use case and invites scope creep.

2. Avoid building a heavy sync layer too early.
   - Sync solves distribution, not usefulness.
   - The current problem is local workflow quality.

3. Avoid a database-first rewrite.
   - Plain files are the right default for trust, portability, and inspection.

4. Avoid decorative terminal gimmicks.
   - Big logos, excessive gradients, and novelty motion do not make the tool more relevant.

5. Avoid a mouse-first workflow.
   - The app should feel efficient from the keyboard and robust in raw terminals.

6. Avoid overfitting to the current TUI implementation.
   - The view layer can change.
   - The product contract should stay centered on prompt lifecycle and retrieval.

7. Avoid “everything saves instantly on every keystroke” as a design principle.
   - It is simple, but it is not the most trustworthy long-term editing model.

## Execution Order

1. Tighten the prompt data model.
2. Add search and history.
3. Rework the TUI into a clearer command surface.
4. Add TUI-level tests for navigation, selection, editing, and rendering states.
5. Only then expand optional workflow features.

## Success Criteria

Princess is in a good place when:

- A coding agent can save a prompt with metadata in one pass.
- A human can find, inspect, and revise that prompt in seconds.
- The UI feels fast, current, and unambiguous in a terminal.
- Prompt files remain plain Markdown and remain portable.
- The app has tests for both filesystem behavior and TUI interactions.

