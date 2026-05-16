# Princess

Princess is a local prompt inbox for humans and coding agents.

It stores prompts as ordinary Markdown files and provides a small CLI plus a terminal UI for creating, browsing, copying, and editing them.

The goal is simple: when an agent drafts a useful prompt, it can deposit that prompt somewhere durable and human-readable instead of leaving it buried in chat history.

## What It Does

- **Dynamic Storage**: Uses XDG-compliant global paths by default, but supports project-local inboxes in `.princess/`.
- **First-Run Onboarding**: Automatically initializes your environment and seeds example prompts on first launch.
- **Agent Integration**: Writes a standard `AGENT.md` contract to guide AI agents in using your inbox.
- **TUI Inbox**: A fast, terminal-based browser for your prompts and category folders.
- **Minimal Editor**: A focused text editor with auto-save, atomic writes, and full revision history.
- **Atomic Persistence**: Prevents data loss with write-to-temp-then-rename updates and stale file cleanup.
- **Clipboard Support**: Copy prompts or revisions to your system clipboard instantly.

## Install

Princess currently targets Bun.

To install it globally from this repo on a machine where `~/.bun/bin` is on your `PATH`:

```bash
bun install
ln -sf "$(pwd)/bin/princess" ~/.bun/bin/princess
```

After linking, the `princess` command should be available in your shell as a global link to this checkout.

You can also run it directly:

```bash
./bin/princess
```

## CLI

Princess features a guided first-run experience. Simply run:

```bash
princess
```

...and follow the prompts to initialize your global inbox.

### Local Workspaces

To create a project-specific inbox in your current directory:

```bash
princess init --local
```

### Prompt Management

Create a prompt:

```bash
princess create-prompt "Title of the Prompt"
```

Create a prompt inside a category folder:

```bash
princess create-prompt "Title of the Prompt" --category "frontend"
```

Create an HTML prompt workspace:

```bash
princess create-prompt "Landing Page Build" --format html --category "frontend"
```

An HTML workspace is a folder-backed prompt package:

```text
landing-page-build/
  prompt.html
  manifest.json
  assets/
  sources/
  partials/
  dist/
```

Add local resources for an agent-readable prompt package:

```bash
princess html add-source frontend/landing-page-build ./requirements.md --name requirements --trust trusted
princess html add-asset frontend/landing-page-build ./wireframe.png --name wireframe --alt "Mobile wireframe"
princess html import-table frontend/landing-page-build ./pricing.csv --name pricing --trust untrusted
princess html set-section frontend/landing-page-build constraints --text "Use existing project patterns."
princess html set-section frontend/landing-page-build output-format --from ./handoff.md --heading "Output Format"
princess html list frontend/landing-page-build
princess html remove-resource frontend/landing-page-build pricing --delete-file
princess html lint frontend/landing-page-build
princess html compile frontend/landing-page-build --target html
princess html compile frontend/landing-page-build --target markdown
princess html compile frontend/landing-page-build --target json
```

HTML prompts use `prompt.html` as the structured authoring surface and `manifest.json` as the local resource index. Compilation expands local text/table resources into `dist/compiled.html`, `dist/compiled.md`, or `dist/compiled.json`; image assets remain explicit attachments because model APIs generally require typed file inputs.

List prompts:

```bash
princess list
princess list --category "frontend"
```

Open the TUI:

```bash
princess tui
```

Running `princess` with no command opens the TUI.

## TUI Controls

From the inbox:

- `Enter` opens the selected file or folder
- `j` / `k` or arrow keys move selection
- `PgUp` / `PgDn` scroll
- `/` enters live search mode over prompt title, category, status, body, and path
- `c` copies the selected prompt
- `d` deletes the selected file or empty folder
- `q`, `Esc`, or `Ctrl+C` quits

From the editor:

- Type to edit the current prompt
- Arrow keys move the cursor
- `PgUp` / `PgDn` scroll
- `Ctrl+U` / `Ctrl+D` half-page scroll
- `Backspace` deletes text
- `Enter` inserts a newline
- `Ctrl+S` saves a revision snapshot
- `Ctrl+R` opens a diff against the latest saved revision
- `Ctrl+C` copies the current prompt
- `Esc` returns to the inbox

Edits are debounced to disk, and saved versions are stored as plain-file revision history under the Princess data directory.

## Agent Workflow

Princess is meant to be easy for agents to use without opening the TUI.

When a user asks an agent to save a prompt in Princess, the intended flow is:

1. **Create**: `princess create-prompt "Prompt Title"`
2. **Write**: The agent writes the Markdown content directly to the newly created file.
3. **Handoff**: The agent notifies the user: *"I have saved the prompt to your inbox. Run `princess tui` to view and edit it."*

The dynamic path to your inbox is stored in `AGENT.md` within your Princess config directory.

## Project Layout

- `src/cli/index.ts` - command parsing and inbox file creation/listing
- `src/html-prompts.ts` - folder-backed HTML prompt workspaces, resources, linting, and compilation
- `src/tui/tui.ts` - terminal setup, raw mode, render/input lifecycle
- `src/tui/app.ts` - inbox/editor behavior
- `src/tui/views/` - rendered inbox and editor screens
- `src/tui/state.ts` - Solid signal state for the TUI
- `src/tui/input.ts` - key parsing
- `src/tui/terminal.ts` - terminal capability and cleanup helpers
- `src/tui/typeset*.ts`, `motion.ts`, `aesthetics.ts` - reusable terminal UI utilities

## Development

Run the TUI:

```bash
bun --conditions=browser run src/cli/index.ts tui
```

Run tests:

```bash
bun run test
```

Typecheck:

```bash
bunx tsc --noEmit
```

## Current Limitations

Princess is still small and local-only.

- There is no sync, search, tagging, or database.
- The editor is intentionally minimal.
- Clipboard support depends on platform tools such as `pbcopy`, `clip`, or `xclip`.
- Deleting directories currently only works for empty folders.
- Some reusable TUI utility modules are broader than the current app needs.

That is intentional for now. The stable core is a plain Markdown prompt inbox with a CLI and terminal UI.
