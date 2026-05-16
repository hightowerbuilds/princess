# Princess Prompt Stacker: Agent Instructions

You are reading this because the user has asked you to interact with **Princess**, their Prompt Stacker. Princess is a terminal-based inbox and text editor designed specifically for managing complex prompts.

Whenever the user asks you to "draft a prompt," "save this to my inbox," or "put this in Princess," you should follow these protocols.

## The Inbox Location
Princess stores prompts in an inbox directory. Standard prompts are Markdown (`.md`) files; structured HTML prompts are directory workspaces containing `prompt.html`, `manifest.json`, and local resource folders. The inbox may be global (XDG-compliant) or project-local (`.princess/inbox/`).

**To find the current inbox path, check the environment variables or the specific `AGENT.md` file in the user's config directory.**

## How to Interact with Princess

### 1. Depositing a New Prompt
Do not just output the prompt in the chat. Instead, deposit it directly into the inbox.

1. **Create the entry:** Run the CLI command:
   ```bash
   princess create-prompt "Title of the Prompt"
   ```
   *This will create a new, sanitized markdown file with frontmatter and the title pre-filled.*

2. **Write the content:** Use your standard file writing/editing tools to overwrite or append the actual prompt content to that newly created file in the inbox directory.

### 2. Viewing the Inbox
To see what prompts currently exist in the user's inbox, run:
```bash
princess list
```
Or read the contents of the inbox directory.

### 2b. Depositing a Structured HTML Prompt
For prompts that need local assets, source files, tables, or explicit sections, create an HTML workspace:
```bash
princess create-prompt "Title of the Prompt" --format html [--category "optional/subfolder"]
princess html add-source "optional/subfolder/title-of-the-prompt" ./requirements.md --name requirements --trust trusted
princess html add-asset "optional/subfolder/title-of-the-prompt" ./wireframe.png --name wireframe --alt "Description of the image"
princess html import-table "optional/subfolder/title-of-the-prompt" ./data.csv --name data --trust untrusted
princess html set-section "optional/subfolder/title-of-the-prompt" constraints --text "Use existing project patterns."
princess html lint "optional/subfolder/title-of-the-prompt"
princess html compile "optional/subfolder/title-of-the-prompt" --target json
```

HTML prompts are composed of `<section data-princess-role="...">` blocks. Use these commands to inspect and edit sections without rewriting `prompt.html` directly:
```bash
princess html list-sections "optional/subfolder/title-of-the-prompt"
princess html get-section "optional/subfolder/title-of-the-prompt" constraints
princess html set-section "optional/subfolder/title-of-the-prompt" constraints --text "Updated constraint text."
princess html move-section "optional/subfolder/title-of-the-prompt" constraints --before context
princess html move-section "optional/subfolder/title-of-the-prompt" constraints --after output-format
princess html move-section "optional/subfolder/title-of-the-prompt" constraints --to 0
princess html remove-section "optional/subfolder/title-of-the-prompt" constraints
princess html open "optional/subfolder/title-of-the-prompt"
```

The auto-managed `resources` section cannot be moved or removed. Use `princess html open` when the user wants to view `prompt.html` in the operating system's default browser. The TUI shows `prompt.html` as a read-only source viewer; HTML prompt authoring goes through the CLI.

### 3. Editing an Existing Prompt
If the user asks you to update or refine a prompt that is already in Princess:
1. Locate the file in the inbox directory.
2. Read the file to understand its current state.
3. Use your standard file-editing tools (like replace/write) to modify the markdown file directly.

## Human Handoff
Once you have created or edited a prompt in the inbox, simply tell the user:
> *"I have saved the prompt to your inbox. Run `princess tui` to view and edit it."*

The user will use the Princess Terminal User Interface (TUI) to handle it from there.
