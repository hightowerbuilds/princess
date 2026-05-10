# Princess Path to the Castle
**Status:** Execution plan
**Date:** May 2026

This plan turns the critical review into a concrete path toward a distributable Princess release. The focus is not on adding features for their own sake. The focus is on making the app trustworthy, legible, and easy to adopt.

## 1. Make Persistence Trustworthy

- [x] Replace direct editor writes with atomic file updates.
  - [x] Write to a temporary file first.
  - [x] Rename into place only after the write succeeds.
  - [x] Preserve the original file if a write fails.

- [x] Make save state visible in the UI.
  - [x] Show when a file is dirty.
  - [x] Show when a save is pending.
  - [x] Show when a save fails.

- [x] Add recovery-safe behavior.
  - [x] Ensure the app can restart after a crash without corrupting prompt files.
  - [x] Keep revision snapshots separate from the live file.

- [x] Confirm revision snapshots are created only when useful.
  - [x] Avoid snapshot spam for trivial no-op saves.
  - [x] Keep the revision store inspectable and predictable.

## 2. Make Revision History First-Class

- [x] Add revision browsing in the TUI.
  - [x] List recent revisions for the current prompt.
  - [x] Show timestamps and concise change summaries where possible.

- [x] Add revision restore.
  - [x] Restore a prior revision into the editor.
  - [x] Preserve the current state before restoring.

- [x] Add revision copy/export.
  - [x] Copy a selected revision to the clipboard.
  - [x] Allow saving a revision as a fresh prompt or variant.

- [x] Improve the diff view.
  - [x] Clarify what changed at a glance.
  - [x] Make line additions/removals more obvious.
  - [x] Keep the screen readable on small terminals.

## 3. Improve Onboarding

- [x] Add a first-run path.
  - [x] Explain local versus global setup.
  - [x] Create a usable inbox automatically.
  - [x] Make the agent contract obvious.

- [x] Make the CLI help feel intentional.
  - [x] Show the most common flows first.
  - [x] Keep keyboard-driven and agent-driven usage easy to discover.

- [x] Add starter content or templates.
  - [x] Seed a small example prompt or two.
  - [x] Show a model for good metadata and prompt structure.

- [x] Reduce documentation mismatch.
  - [x] Keep README keyboard bindings in sync with the TUI.
  - [x] Keep agent instructions in sync with prompt creation behavior.

## 4. Polish The Command Surface

- [x] Strengthen mode boundaries.
  - [x] Make inbox, search, editor, and diff feel distinct.
  - [x] Show mode in the footer or header consistently.

- [x] Improve status and feedback.
  - [x] Show what action just happened.
  - [x] Show when search is active and what it is filtering.
  - [x] Show when a prompt is saved, copied, or restored.

- [x] Improve empty and error states.
  - [x] Empty inbox should explain the next action.
  - [x] Empty search should explain how to clear or refine the query.
  - [x] Errors should be short, visible, and recoverable.

- [ ] Tighten typography and spacing.
  - [ ] Reduce wasted vertical space.
  - [ ] Make metadata feel structured rather than decorative.
  - [ ] Keep the UI dense without becoming noisy.

- [x] Use motion only where it helps.
  - [x] Keep feedback fast.
  - [x] Avoid motion that does not communicate state or transition.

## 5. Make The Product Story Clear

- [ ] Define the repeated job Princess owns.
  - Store prompts for later reuse.
  - Help agents create prompts with metadata.
  - Help humans review and refine them.

- [ ] Add a prompt lifecycle.
  - Draft
  - Ready
  - Used
  - Stale
  - Rejected

- [ ] Make categories feel intentional.
  - Support folders as organization, not just path prefixes.
  - Consider saved views or common categories.

- [ ] Add a stable prompt template story.
  - Make it obvious how to create new reusable prompt types.
  - Keep the file format plain and portable.

## 6. Package For Distribution

- [ ] Decide the installation story.
  - One obvious install path.
  - Clear versioning.
  - Clear update path.

- [ ] Decide what local-first means in practice.
  - Document global home behavior.
  - Document project-local behavior.
  - Document migration behavior.

- [ ] Make release quality visible.
  - Keep tests green.
  - Add integration coverage for critical flows.
  - Verify the app works in both interactive and non-interactive shells where relevant.

- [ ] Create a distributable checklist.
  - Fresh install works.
  - First launch works.
  - Search works.
  - Save works.
  - Diff works.
  - Restore works.

## 7. Suggested Order

1. Harden atomic saves and recovery.
2. Finish revision browsing and restore.
3. Polish onboarding and docs.
4. Tighten the visual command surface.
5. Choose the packaging and installation path.

## 8. Definition Of Done

Princess is ready for broader distribution when:

- [ ] A new user can install it without asking for help.
- [x] A prompt can be created, edited, saved, searched, and diffed without ambiguity.
- [x] A crash or failed write does not destroy trust in the inbox.
- [x] The UI clearly signals mode, state, and next action.
- [x] The app remains plain-file based and easy to inspect.
- [x] The docs, keyboard bindings, and actual behavior match.

## 9. Immediate Next Milestone

- [x] Implement atomic saves and a visible dirty/saved state.
- [x] Add revision browsing and restore for the current prompt.
- [x] Add a first-run onboarding flow that introduces the inbox and agent contract.
