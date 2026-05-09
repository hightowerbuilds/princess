# Princess

Princess is a local prompt inbox for humans and coding agents.

It stores prompts as ordinary Markdown files in `~/.princess/inbox` and provides a small CLI plus a terminal UI for creating, browsing, copying, and editing them.

The goal is simple: when an agent drafts a useful prompt, it can deposit that prompt somewhere durable and human-readable instead of leaving it buried in chat history.

## What It Does

- Creates a global Princess home at `~/.princess`
- Stores prompts as `.md` files under `~/.princess/inbox`
- Supports optional inbox subfolders with `--category`
- Writes an agent instruction file at `~/.princess/AGENT.md`
- Provides a terminal inbox for navigating prompt files and folders
- Opens prompt files in a simple terminal editor
- Copies prompts to the system clipboard
- Leaves prompt data as plain files, not a database

## Install

Princess currently targets Bun.

From this repo:

```bash
bun install
bun link
```

After linking, the `princess` command should be available in your shell.

You can also run it directly:

```bash
./bin/princess
```

## CLI

Initialize the global inbox and agent instructions:

```bash
princess init
```

Create a prompt:

```bash
princess create-prompt "Title of the Prompt"
```

Create a prompt inside a category folder:

```bash
princess create-prompt "Title of the Prompt" --category "frontend"
```

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
- `Ctrl+C` copies the current prompt
- `Esc` returns to the inbox

Edits are written back to the Markdown file as you type.

## Agent Workflow

Princess is meant to be easy for agents to use without opening the TUI.

When a user asks an agent to save a prompt in Princess, the intended flow is:

```bash
princess create-prompt "Prompt Title"
```

Then the agent writes the full prompt into the created Markdown file under:

```text
~/.princess/inbox/
```

After that, the agent can tell the user:

```text
I have saved the prompt to your inbox. Run `princess tui` to view and edit it.
```

The `princess init` command writes this contract to `~/.princess/AGENT.md`.

## Project Layout

- `src/cli/index.ts` - command parsing and inbox file creation/listing
- `src/tui/tui.ts` - terminal setup, raw mode, render/input lifecycle
- `src/tui/app.ts` - inbox/editor behavior
- `src/tui/views/` - rendered inbox and editor screens
- `src/tui/state.ts` - Solid signal state for the TUI
- `src/tui/input.ts` - key parsing
- `src/tui/terminal.ts` - terminal capability and cleanup helpers
- `src/tui/typeset*.ts`, `compositor.ts`, `motion.ts`, `interaction.ts`, `visualize.ts`, `accessibility.ts` - reusable terminal UI utilities

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
