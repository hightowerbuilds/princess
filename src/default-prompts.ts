export const AGENT_LETTER_TITLE = "A LETTER TO YOUR AGENT FROM PRINCESS";
export const AGENT_LETTER_FILENAME = "a-letter-to-your-agent-from-princess.md";

export const AGENT_LETTER_CONTENT = `Dear agent,

You are working with a human who uses Princess as a local prompt inbox. Princess is not a remote service and it is not a database. It stores prompts as ordinary files on this computer so both humans and agents can read, edit, copy, and preserve them.

When the user asks you to save, draft, revise, or organize a prompt in Princess, do the work in the Princess inbox instead of leaving the final prompt only in chat.

## Find the Inbox

Run:

\`\`\`bash
princess list --json
\`\`\`

The JSON output includes the active inbox path. You can also read the current agent contract at the Princess config path shown in the user's environment or in the installed Princess instructions.

## Save a Markdown Prompt

For a normal text prompt, create a Markdown prompt:

\`\`\`bash
princess create-prompt "Clear Prompt Title" --category "optional-folder"
\`\`\`

Then open the created \`.md\` file and write the full prompt body into it. Keep useful frontmatter and headings intact. If the command creates a suffixed filename because the title already exists, use the suffixed file it reports.

## Save a Structured HTML Prompt

For prompts with assets, tables, source files, or explicit sections, use the HTML prompt builder. It creates a workspace directory, not a single file:

\`\`\`bash
princess create-prompt "Clear Prompt Title" --format html --category "optional-folder"
\`\`\`

The command prints the workspace path. In later commands, refer to the workspace relative to the Princess inbox, usually as \`optional-folder/clear-prompt-title\`. If Princess creates a suffixed folder such as \`clear-prompt-title-2\`, use that exact reported workspace.

HTML prompt authoring should go through \`princess html ...\` commands. Do not hand-edit \`manifest.json\`. Avoid hand-editing \`prompt.html\` unless the user explicitly asks you to; the section commands preserve the expected structure.

### Sections

HTML prompts are organized as \`<section data-princess-role="...">\` blocks. Common roles are \`instructions\`, \`context\`, \`constraints\`, \`examples\`, and \`output-format\`, but roles are just stable slugs.

\`\`\`bash
princess html set-section "optional-folder/clear-prompt-title" instructions --text "Write the task here."
princess html set-section "optional-folder/clear-prompt-title" constraints --text "Write constraints here."
princess html list-sections "optional-folder/clear-prompt-title"
princess html get-section "optional-folder/clear-prompt-title" constraints
princess html move-section "optional-folder/clear-prompt-title" constraints --before output-format
princess html remove-section "optional-folder/clear-prompt-title" examples
princess html open "optional-folder/clear-prompt-title"
\`\`\`

\`set-section\` is an upsert: it creates the section if it is missing and replaces it if it already exists. Use \`--text\` for normal prompt prose; Princess escapes it into safe HTML paragraphs. Use \`--from ./file.md\` when the section body should come from a file. Use \`--as html\` only when you intentionally trust the supplied HTML.

The \`resources\` section is managed by Princess and should not be moved or removed.

Use \`princess html open "optional-folder/clear-prompt-title"\` when the user wants to view the workspace \`prompt.html\` in the operating system's default browser.

### Resources

Attach local materials through the CLI so the manifest and prompt stay in sync:

\`\`\`bash
princess html add-source "optional-folder/clear-prompt-title" ./notes.md --name notes --trust trusted
princess html add-asset "optional-folder/clear-prompt-title" ./wireframe.png --name wireframe --alt "Short description for the model"
princess html import-table "optional-folder/clear-prompt-title" ./data.csv --name data --trust untrusted
\`\`\`

\`add-source\` copies text-like source files into \`sources/\` and expands them during compile. Mark user-provided or third-party content as \`untrusted\`; mark project-owned context as \`trusted\`.

\`add-asset\` copies images or other binary files into \`assets/\`. Always provide useful \`--alt\` text because model APIs usually need image files attached separately with a text description.

\`import-table\` converts CSV or TSV data into an HTML table partial under \`partials/\` and expands it during compile.

### Validate and Export

Before handoff, lint the workspace:

\`\`\`bash
princess html lint "optional-folder/clear-prompt-title"
\`\`\`

Compile to the format the next agent or model call needs:

\`\`\`bash
princess html compile "optional-folder/clear-prompt-title" --target html
princess html compile "optional-folder/clear-prompt-title" --target markdown
princess html compile "optional-folder/clear-prompt-title" --target json
\`\`\`

Use \`--target json\` for a model-ready package that lists asset attachments. Use \`--target markdown\` when the prompt needs to be pasted into a plain chat. Use \`--target html\` when preserving raw document structure matters.

Compiled HTML expands text sources and table partials. Asset files remain explicit attachments; do not pretend they were embedded into the text prompt.

## Handoff

After saving or updating the prompt, tell the user where it was saved and suggest:

\`\`\`bash
princess tui
\`\`\`

Do not claim the prompt is saved unless you have actually created or edited the file in the Princess inbox.

With care,
Princess`;
