import { parseArgs } from "util";
import path from "node:path";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import { runTui } from "../tui/tui.ts";

const INBOX_DIR = path.join(os.homedir(), ".princess", "inbox");
const AGENT_FILE = path.join(os.homedir(), ".princess", "AGENT.md");

const AGENT_INSTRUCTIONS = `# Princess Prompt Stacker: Agent Instructions

You are reading this because the user has asked you to interact with **Princess**, their global Prompt Stacker. Princess is a terminal-based inbox and text editor designed specifically for managing complex prompts.

Whenever the user asks you to "draft a prompt," "save this to my inbox," or "put this in Princess," you should follow these protocols.

## The Inbox Location
The Princess inbox is located globally at:
**\`~/.princess/inbox/\`**

All prompts are stored as standard Markdown (\`.md\`) files in this directory.

## How to Interact with Princess

### 1. Depositing a New Prompt
Do not just output the prompt in the chat. Instead, deposit it directly into the inbox.

1. **Create the entry:** Run the CLI command:
   \`\`\`bash
   princess create-prompt "Title of the Prompt" [--category "optional/subfolder"]
   \`\`\`
   *This will create a new, sanitized markdown file (e.g., \`~/.princess/inbox/optional/subfolder/title-of-the-prompt.md\`) with the title pre-filled.*

2. **Write the content:** Use your standard file writing/editing tools to overwrite or append the actual prompt content to that newly created file in the \`~/.princess/inbox/\` directory.

### 2. Viewing the Inbox
To see what prompts currently exist in the user's inbox, run:
\`\`\`bash
princess list
\`\`\`
Or simply read the contents of the \`~/.princess/inbox/\` directory.

### 3. Editing an Existing Prompt
If the user asks you to update or refine a prompt that is already in Princess:
1. Locate the file in \`~/.princess/inbox/\` (e.g., \`~/.princess/inbox/existing-prompt.md\`).
2. Read the file to understand its current state.
3. Use your standard file-editing tools (like replace/write) to modify the markdown file directly.

## Human Handoff
Once you have created or edited a prompt in the inbox, simply tell the user:
> *"I have saved the prompt to your inbox. Run \`princess tui\` to view and edit it."*

The user will use the Princess Terminal User Interface (TUI) to handle it from there.`;

async function bootstrap() {
  try {
    await mkdir(INBOX_DIR, { recursive: true });
    await writeFile(AGENT_FILE, AGENT_INSTRUCTIONS, { flag: "w" });
    console.log(`Initialized Princess globally at ~/.princess`);
    console.log(`Agent instructions created at ~/.princess/AGENT.md`);
  } catch (err: any) {
    if (err.code === "EEXIST") {
      // Already bootstrapped, ignore
    } else {
      console.error(`Failed to bootstrap Princess: ${err.message}`);
    }
  }
}

async function ensureInbox(subpath: string = "") {
  const targetDir = path.join(INBOX_DIR, subpath);
  try {
    await mkdir(targetDir, { recursive: true });
  } catch {}
  return targetDir;
}

async function createPrompt(title: string, category: string = "") {
  const targetDir = await ensureInbox(category);
  
  // Sanitize title for filename
  const sanitized = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const filename = `${sanitized}.md`;
  const filepath = path.join(targetDir, filename);

  const initialContent = `# ${title}\n\n`;

  try {
    await writeFile(filepath, initialContent, { flag: "wx" });
    console.log(`Created prompt: ${filepath}`);
  } catch (err: any) {
    if (err.code === "EEXIST") {
      console.log(`Prompt already exists: ${filepath}`);
    } else {
      console.error(`Failed to create prompt: ${err.message}`);
    }
  }
}

async function listPrompts(category: string = "") {
  const targetDir = await ensureInbox(category);
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    
    if (entries.length === 0) {
      console.log(`Inbox${category ? ` (${category})` : ""} is empty.`);
      return;
    }

    console.log(`Inbox Prompts${category ? ` in ${category}` : ""}:`);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        console.log(`- 📁 ${entry.name}/`);
      } else if (entry.name.endsWith(".md")) {
        console.log(`- 📄 ${entry.name}`);
      }
    }
  } catch (err: any) {
    console.error(`Failed to list prompts: ${err.message}`);
  }
}

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      category: {
        type: "string",
        short: "c",
      },
    },
  });

  const command = positionals[0] || "tui";
  const category = values.category || "";

  switch (command) {
    case "init":
      await bootstrap();
      break;
    case "create-prompt":
      const title = positionals.slice(1).join(" ") || "Untitled Prompt";
      await createPrompt(title, category);
      break;
    case "list":
      await listPrompts(category);
      break;
    case "tui":
      await runTui({});
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Usage:`);
      console.log(`  princess init                    Initialize global directories and agent contracts`);
      console.log(`  princess create-prompt <title>   Create a new prompt in the inbox`);
      console.log(`      --category, -c <name>        (Optional) Put the prompt in a subfolder`);
      console.log(`  princess list                    List prompts in the inbox`);
      console.log(`      --category, -c <name>        (Optional) List a subfolder`);
      console.log(`  princess tui                     Launch the TUI (default)`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
