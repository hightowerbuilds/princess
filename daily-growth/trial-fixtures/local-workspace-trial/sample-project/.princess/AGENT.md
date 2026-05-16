# Princess Prompt Stacker: Agent Instructions

You are reading this because the user has asked you to interact with **Princess**, their global Prompt Stacker. Princess is a terminal-based inbox and text editor designed specifically for managing complex prompts.

Whenever the user asks you to "draft a prompt," "save this to my inbox," or "put this in Princess," you should follow these protocols.

## The Inbox Location
The Princess inbox is located at:
**`/Users/lukehightower/Desktop/websites/princess/daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox`**
*(Note: This path may be customized via environment variables).*

All prompts are stored as standard Markdown (`.md`) files in this directory, usually with a short frontmatter block for metadata such as title, category, status, and timestamps.

## How to Interact with Princess

### 1. Depositing a New Prompt
Do not just output the prompt in the chat. Instead, deposit it directly into the inbox.

1. **Create the entry:** Run the CLI command:
   ```bash
   princess create-prompt "Title of the Prompt" [--category "optional/subfolder"]
   ```
   *This will create a new, sanitized markdown file (e.g., `/Users/lukehightower/Desktop/websites/princess/daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/optional/subfolder/title-of-the-prompt.md`) with frontmatter and the title pre-filled.*

2. **Write the content:** Use your standard file writing/editing tools to overwrite or append the actual prompt content to that newly created file in the `/Users/lukehightower/Desktop/websites/princess/daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox` directory.

### 1b. Depositing a Structured HTML Prompt
For prompts that need local assets, source files, tables, or richer structure, create an HTML prompt workspace:
```bash
princess create-prompt "Title of the Prompt" --format html [--category "optional/subfolder"]
princess html add-source "optional/subfolder/title-of-the-prompt" ./requirements.md --name requirements --trust trusted
princess html add-asset "optional/subfolder/title-of-the-prompt" ./wireframe.png --name wireframe --alt "Description of the image"
princess html import-table "optional/subfolder/title-of-the-prompt" ./data.csv --name data --trust untrusted
princess html set-section "optional/subfolder/title-of-the-prompt" constraints --text "Use existing project patterns."
princess html list "optional/subfolder/title-of-the-prompt"
princess html lint "optional/subfolder/title-of-the-prompt"
princess html compile "optional/subfolder/title-of-the-prompt" --target json
```
The workspace contains `prompt.html`, `manifest.json`, `assets/`, `sources/`, `partials/`, and `dist/`. Edit `prompt.html` for the final task instructions. Local text and table resources are expanded during compile; image files are listed as attachments in `dist/compiled.json` and should be attached separately when the target model requires typed file inputs.

### 1c. Editing HTML Prompt Sections
HTML prompts are composed of `<section data-princess-role="…">` blocks. The CLI lets you list, read, add, replace, reorder, and delete sections without rewriting `prompt.html` by hand:
```bash
princess html list-sections "optional/subfolder/title-of-the-prompt"
princess html get-section "optional/subfolder/title-of-the-prompt" constraints
princess html set-section "optional/subfolder/title-of-the-prompt" constraints --text "Updated constraint text."
princess html move-section "optional/subfolder/title-of-the-prompt" constraints --before context
princess html move-section "optional/subfolder/title-of-the-prompt" constraints --after output-format
princess html move-section "optional/subfolder/title-of-the-prompt" constraints --to 0
princess html remove-section "optional/subfolder/title-of-the-prompt" constraints
```
`set-section` is upsert — it adds the section if missing, replaces if present. The auto-managed `resources` section cannot be moved or removed. The TUI displays `prompt.html` in a read-only viewer; all authoring goes through these CLI commands.

### 2. Viewing the Inbox
To see what prompts currently exist in the user's inbox, run:
```bash
princess list
```
Or simply read the contents of the `/Users/lukehightower/Desktop/websites/princess/daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox` directory.

### 3. Editing an Existing Prompt
If the user asks you to update or refine a prompt that is already in Princess:
1. Locate the file in `/Users/lukehightower/Desktop/websites/princess/daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox` (e.g., `/Users/lukehightower/Desktop/websites/princess/daily-growth/trial-fixtures/local-workspace-trial/sample-project/.princess/inbox/existing-prompt.md`).
2. Read the file to understand its current state.
3. Use your standard file-editing tools (like replace/write) to modify the markdown file directly.
4. If you need to review prior versions, use Princess's revision history. The TUI can open the latest diff with `Ctrl+R` from the editor.

## Human Handoff
Once you have created or edited a prompt in the inbox, simply tell the user:
> *"I have saved the prompt to your inbox. Run `princess tui` to view and edit it."*

The user will use the Princess Terminal User Interface (TUI) to handle it from there.