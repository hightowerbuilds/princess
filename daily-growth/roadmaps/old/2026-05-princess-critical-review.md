# Critical Review: Princess
**Status:** Promising, not yet distributable
**Date:** May 2026

This review supersedes the older architecture critique. The goal here is not to dunk on the implementation. It is to evaluate Princess as a product with real potential and identify what would move it from a strong local tool to something people can install, trust, and keep using.

## Executive Summary

Princess has a credible wedge: it is a local prompt inbox for humans and coding agents, backed by plain Markdown files and a terminal UI that understands prompt lifecycle instead of treating prompts as disposable chat output. That is a real product idea, not a hobby feature.

The codebase now proves the idea. It has metadata-backed prompt creation, inbox search, revision snapshots, and a diff view. The remaining problem is not “does the app exist?” It is “can someone trust it, discover it, and adopt it without hand-holding?”

Right now, Princess feels like an excellent prototype that has started to become a tool. It is not yet a distributable application because the persistence model, onboarding, and release packaging are still below the level expected of software people keep on their machine.

## What Is Strong

1. The core data model is sane.
   - Prompts live as Markdown files.
   - Metadata is embedded directly in the file.
   - Revision history is still file-based, so the system remains inspectable and portable.

2. The app solves a specific workflow.
   - Agents can write prompts into the inbox instead of leaving them in chat.
   - Humans can inspect and revise those prompts later.
   - Search and revision history make the inbox useful once it grows.

3. The TUI has a real interaction contract.
   - Inbox browsing, live search, editing, copying, and diffing are all discoverable through the UI.
   - The app no longer reads like a collection of disconnected terminal experiments.

4. The test story is materially better than the older version of the project.
   - CLI behavior is covered.
   - Prompt parsing and revisions are covered.
   - The TUI rendering path has tests.

## What Still Blocks A Distributable Release

### 1. Save semantics are not yet strong enough

Princess now debounces saves and records revisions, which is a good step. But the write path still depends on direct `writeFile` calls in the editor flow. That is fine for a prototype, but not yet ideal for a tool people trust with real prompt work.

What is missing:
- Atomic writes via temp-file rename.
- A clear recovery story if the process crashes mid-edit.
- Explicit save state in the UI, including “dirty,” “saved,” and “failed.”

Why this matters:
- Distributable tools need predictable persistence behavior.
- Users forgive rough edges in UI faster than they forgive losing work.

### 2. The interaction model is still too custom

The app works, but it is still built around a homegrown control-flow loop in [`src/tui/app.ts`](/Users/lukehightower/Desktop/websites/princess/src/tui/app.ts:23) and a global resolver pattern. That is acceptable for a small TUI, but it limits clarity as features grow.

What is missing:
- A clearer command model for inbox, editor, and diff.
- More explicit state transitions.
- A better separation between input handling, persistence, and rendering.

Why this matters:
- As the product grows, hidden control flow becomes maintenance debt.
- Distribution means other people will extend the tool, not just use it once.

### 3. Onboarding is still lighter than the product deserves

Princess has better docs than before, but distribution requires more than a README.

What is missing:
- A first-run experience that clearly explains local versus global setup.
- A way to create a realistic starter inbox.
- A command reference that matches the actual keyboard contract.
- A short “why this exists” story that is product-oriented, not architecture-oriented.

Why this matters:
- People do not install terminal tools for the code quality alone.
- They install them when the workflow is immediately legible.

### 4. The UI is functional, but not yet obviously “2026”

The current TUI has improved layout and status surfacing, but it still reads as a classic terminal utility. It needs stronger visual hierarchy and a more intentional command-surface feel.

What is missing:
- A clearer distinction between browse, search, edit, and diff modes.
- Better empty states and success states.
- Stronger typography and spacing discipline.
- More restrained, purposeful motion.

Why this matters:
- Distributable tools compete on perceived polish.
- Users decide quickly whether an app feels current or merely competent.

### 5. The product story is incomplete

Princess now has prompts, metadata, search, and revisions. The next question is not “what else can it render?” It is “what is the repeated job this app owns?”

What is missing:
- A stable prompt template/story.
- Categories or collections that become a real workflow, not just a folder hack.
- A way to mark prompts as used, stale, or preferred.
- A review loop that helps agents and humans know which prompts to reuse.

Why this matters:
- Without a reusable workflow, the inbox becomes a storage bin.
- With a workflow, the inbox becomes a system of record.

## What Comes Next

If the goal is to get Princess to a distributable point, the next work should be ordered like this:

1. Harden file persistence.
   - Atomic writes.
   - Crash safety.
   - Save-state visibility.

2. Make revision history first-class.
   - List revisions.
   - Open diffs from the UI.
   - Add a way to restore or copy from a revision.

3. Finish the onboarding story.
   - First-run setup.
   - Better help text.
   - Clear examples of agent use.

4. Polish the command surface.
   - Stronger mode indicators.
   - Better search UI.
   - Better diff UI.
   - More obvious keyboard affordances.

5. Package it for distribution.
   - Decide how people install it.
   - Decide what “local-only” means in practice.
   - Decide how upgrades and migration are handled.

## Distribution Readiness Checklist

Princess is close to distributable when these are true:

- A user can install it in one obvious step.
- The first run creates a usable inbox with no confusion.
- Editing cannot silently lose data.
- Search and revisions are easy to discover.
- The UI clearly communicates mode and state.
- The docs match the actual keyboard contract.
- The project has enough tests that refactors are not terrifying.

## Risk Assessment

The main risk is not technical impossibility. The risk is drift. Princess can easily become either:

- A generic note app with prompt-shaped branding, or
- A terminal toy that is visually interesting but operationally shallow.

The better path is narrower:

- Own prompt lifecycle.
- Make revision and retrieval the core loop.
- Keep storage plain-file and inspectable.
- Make the TUI feel like a serious workspace, not an experiment.

## Bottom Line

Princess has real potential because it solves a real problem for a real class of users: coding agents and humans need a durable, reviewable prompt inbox.

It becomes distributable when the app stops feeling like “a clever local tool” and starts feeling like “the obvious place to put prompts.” That transition depends less on new features than on trust, polish, and packaging.

