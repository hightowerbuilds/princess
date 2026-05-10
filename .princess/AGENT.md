# Princess Prompt Stacker: Agent Instructions

You are reading this because the user has asked you to interact with **Princess**, their global Prompt Stacker. Princess is a terminal-based inbox and text editor designed specifically for managing complex prompts.

Whenever the user asks you to "draft a prompt," "save this to my inbox," or "put this in Princess," you should follow these protocols.

## The Inbox Location
The Princess inbox is located at:
**`/Users/lukehightower/Desktop/websites/princess/.princess/inbox`**
*(Note: This path may be customized via environment variables).*

All prompts are stored as standard Markdown (`.md`) files in this directory, usually with a short frontmatter block for metadata such as title, category, status, and timestamps.

## How to Interact with Princess

### 1. Depositing a New Prompt
Do not just output the prompt in the chat. Instead, deposit it directly into the inbox.

1. **Create the entry:** Run the CLI command:
   ```bash
   princess create-prompt "Title of the Prompt" [--category "optional/subfolder"]
   ```
   *This will create a new, sanitized markdown file (e.g., `/Users/lukehightower/Desktop/websites/princess/.princess/inbox/optional/subfolder/title-of-the-prompt.md`) with frontmatter and the title pre-filled.*

2. **Write the content:** Use your standard file writing/editing tools to overwrite or append the actual prompt content to that newly created file in the `/Users/lukehightower/Desktop/websites/princess/.princess/inbox` directory.

### 2. Viewing the Inbox
To see what prompts currently exist in the user's inbox, run:
```bash
princess list
```
Or simply read the contents of the `/Users/lukehightower/Desktop/websites/princess/.princess/inbox` directory.

### 3. Editing an Existing Prompt
If the user asks you to update or refine a prompt that is already in Princess:
1. Locate the file in `/Users/lukehightower/Desktop/websites/princess/.princess/inbox` (e.g., `/Users/lukehightower/Desktop/websites/princess/.princess/inbox/existing-prompt.md`).
2. Read the file to understand its current state.
3. Use your standard file-editing tools (like replace/write) to modify the markdown file directly.
4. If you need to review prior versions, use Princess's revision history. The TUI can open the latest diff with `Ctrl+R` from the editor.

## Human Handoff
Once you have created or edited a prompt in the inbox, simply tell the user:
> *"I have saved the prompt to your inbox. Run `princess tui` to view and edit it."*

The user will use the Princess Terminal User Interface (TUI) to handle it from there.