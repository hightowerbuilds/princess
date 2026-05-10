import { parseArgs } from "util";
import path from "node:path";
import { mkdir, writeFile, readdir, stat, rename, rmdir } from "node:fs/promises";
import { runTui } from "../tui/tui.ts";
import { getPaths } from "../paths.ts";
import { buildPromptDocument, sanitizePromptTitle } from "../prompts.ts";

export function getAgentInstructions(inboxDir: string) {
  return `# Princess Prompt Stacker: Agent Instructions

You are reading this because the user has asked you to interact with **Princess**, their global Prompt Stacker. Princess is a terminal-based inbox and text editor designed specifically for managing complex prompts.

Whenever the user asks you to "draft a prompt," "save this to my inbox," or "put this in Princess," you should follow these protocols.

## The Inbox Location
The Princess inbox is located at:
**\`${inboxDir}\`**
*(Note: This path may be customized via environment variables).*

All prompts are stored as standard Markdown (\`.md\`) files in this directory, usually with a short frontmatter block for metadata such as title, category, status, and timestamps.

## How to Interact with Princess

### 1. Depositing a New Prompt
Do not just output the prompt in the chat. Instead, deposit it directly into the inbox.

1. **Create the entry:** Run the CLI command:
   \`\`\`bash
   princess create-prompt "Title of the Prompt" [--category "optional/subfolder"]
   \`\`\`
   *This will create a new, sanitized markdown file (e.g., \`${path.join(inboxDir, "optional", "subfolder", "title-of-the-prompt.md")}\`) with frontmatter and the title pre-filled.*

2. **Write the content:** Use your standard file writing/editing tools to overwrite or append the actual prompt content to that newly created file in the \`${inboxDir}\` directory.

### 2. Viewing the Inbox
To see what prompts currently exist in the user's inbox, run:
\`\`\`bash
princess list
\`\`\`
Or simply read the contents of the \`${inboxDir}\` directory.

### 3. Editing an Existing Prompt
If the user asks you to update or refine a prompt that is already in Princess:
1. Locate the file in \`${inboxDir}\` (e.g., \`${path.join(inboxDir, "existing-prompt.md")}\`).
2. Read the file to understand its current state.
3. Use your standard file-editing tools (like replace/write) to modify the markdown file directly.
4. If you need to review prior versions, use Princess's revision history. The TUI can open the latest diff with \`Ctrl+R\` from the editor.

## Human Handoff
Once you have created or edited a prompt in the inbox, simply tell the user:
> *"I have saved the prompt to your inbox. Run \`princess tui\` to view and edit it."*

The user will use the Princess Terminal User Interface (TUI) to handle it from there.`;
}

export async function performMigrationIfNecessary(paths: ReturnType<typeof getPaths>) {
  if (paths.isLocal) return; // Do not migrate global settings into a local workspace

  try {
    const oldStat = await stat(paths.oldPrincessDir).catch(() => null);
    if (!oldStat || !oldStat.isDirectory()) {
      return; // No old directory, nothing to migrate
    }

    const newStat = await stat(paths.dataDir).catch(() => null);
    if (newStat) {
      return; // New directory already exists, don't migrate
    }

    console.log(`Migrating data from ${paths.oldPrincessDir} to ${paths.dataDir} and ${paths.configDir}...`);
    
    // Create new directories
    await mkdir(paths.dataDir, { recursive: true });
    await mkdir(paths.configDir, { recursive: true });

    // Move inbox
    const oldInbox = path.join(paths.oldPrincessDir, "inbox");
    const oldInboxStat = await stat(oldInbox).catch(() => null);
    if (oldInboxStat && oldInboxStat.isDirectory()) {
      await rename(oldInbox, paths.inboxDir);
    }

    // Move AGENT.md
    const oldAgent = path.join(paths.oldPrincessDir, "AGENT.md");
    const oldAgentStat = await stat(oldAgent).catch(() => null);
    if (oldAgentStat && oldAgentStat.isFile()) {
      await rename(oldAgent, paths.agentFile);
    }

    // Try to remove old dir (will only succeed if empty now, which is safe)
    await rmdir(paths.oldPrincessDir).catch(() => {
      console.warn(`Could not completely remove old directory ${paths.oldPrincessDir}. You may need to delete it manually.`);
    });
    
    console.log(`Migration complete.`);
  } catch (err: any) {
    console.error(`Migration failed: ${err.message}`);
  }
}

export async function bootstrap(isLocal: boolean = false) {
  if (isLocal) {
    // If local, we must create the directory before calling getPaths so that it gets detected
    const localPrincessDir = path.join(process.cwd(), ".princess");
    await mkdir(localPrincessDir, { recursive: true });
    console.log(`Created local project workspace at ${localPrincessDir}`);
  }

  const paths = getPaths();
  try {
    await mkdir(paths.inboxDir, { recursive: true });
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.agentFile, getAgentInstructions(paths.inboxDir), { flag: "w" });
    console.log(`Initialized Princess at ${paths.dataDir}`);
    console.log(`Agent instructions created at ${paths.agentFile}`);
  } catch (err: any) {
    if (err.code === "EEXIST") {
      // Already bootstrapped, ignore
    } else {
      console.error(`Failed to bootstrap Princess: ${err.message}`);
    }
  }
}

async function ensureInbox(subpath: string = "") {
  const paths = getPaths();
  const targetDir = path.join(paths.inboxDir, subpath);
  try {
    await mkdir(targetDir, { recursive: true });
  } catch {}
  return targetDir;
}

export async function createPrompt(title: string, category: string = "") {
  const targetDir = await ensureInbox(category);
  
  const filename = `${sanitizePromptTitle(title)}.md`;
  const filepath = path.join(targetDir, filename);

  const initialContent = buildPromptDocument(title, { category, status: "draft" });

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

export async function listPrompts(category: string = "") {
  const paths = getPaths();
  const targetDir = path.join(paths.inboxDir, category);
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

export async function seedExamples(inboxDir: string) {
  const examplesDir = path.join(inboxDir, "examples");
  await mkdir(examplesDir, { recursive: true });

  const examples = [
    {
      title: "Welcome to Princess",
      content: "Princess is a local prompt inbox for humans and coding agents.\n\nIt stores prompts as ordinary Markdown files and provides a small CLI plus a terminal UI for creating, browsing, copying, and editing them.\n\n### Key Controls\n- **Arrow keys/j/k**: Navigate\n- **Enter**: Open/Edit\n- **c**: Copy to clipboard\n- **d**: Delete\n- **/**: Search",
    },
    {
      title: "How to use with AI Agents",
      content: "When you want an agent to save a prompt for you, just tell it:\n'Save this to my Princess inbox'.\n\nThe agent will use the `princess create-prompt` command and then write the file content. You can find the full protocol in the `AGENT.md` file in your config directory.",
    }
  ];

  for (const ex of examples) {
    const filename = `${sanitizePromptTitle(ex.title)}.md`;
    const filepath = path.join(examplesDir, filename);
    const content = buildPromptDocument(ex.title, { category: "examples", status: "ready" }) + ex.content;
    await writeFile(filepath, content, { flag: "wx" }).catch(() => {});
  }
}

export async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      category: {
        type: "string",
        short: "c",
      },
      local: {
        type: "boolean",
      },
    },
  });

  const command = positionals[0] || "tui";
  const category = values.category || "";

  const paths = getPaths();
  await performMigrationIfNecessary(paths);

  switch (command) {
    case "init":
      await bootstrap(values.local);
      break;
    case "create-prompt":
      const title = positionals.slice(1).join(" ") || "Untitled Prompt";
      await createPrompt(title, category);
      break;
    case "list":
      await listPrompts(category);
      break;
    case "tui":
      const isFirstRun = await stat(paths.agentFile).catch(() => null) === null;
      if (isFirstRun) {
        console.log("Welcome to Princess! It looks like this is your first time running it.");
        console.log(`Princess stores your prompts globally at ${paths.inboxDir} by default.`);
        console.log("You can also create a project-local inbox by running `princess init --local` in any project folder.");
        console.log("\nInitializing your global inbox and seeding some examples...");
        await bootstrap(false);
        await seedExamples(paths.inboxDir);
        console.log("\nLaunching TUI in 3 seconds...");
        await new Promise(r => setTimeout(r, 3000));
      }
      await runTui({});
      break;
    case "uninstall":
      console.log("Uninstalling Princess...");
      const pths = getPaths();
      console.log(`\nTo completely remove Princess, please perform the following steps:`);
      console.log(`1. Delete your data:`);
      console.log(`   rm -rf ${pths.dataDir}`);
      console.log(`   rm -rf ${pths.configDir}`);
      console.log(`\n2. Remove the global symlink:`);
      console.log(`   rm $(which princess)`);
      console.log(`\nPrincess will remain available until you remove the symlink.`);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Usage:`);
      console.log(`  princess init                    Initialize global directories and agent contracts`);
      console.log(`      --local                      Initialize a project-local workspace in the current directory`);
      console.log(`  princess create-prompt <title>   Create a new prompt in the inbox`);
      console.log(`      --category, -c <name>        (Optional) Put the prompt in a subfolder`);
      console.log(`  princess list                    List prompts in the inbox`);
      console.log(`      --category, -c <name>        (Optional) List a subfolder`);
      console.log(`  princess uninstall               Instructions for uninstalling Princess`);
      console.log(`  princess tui                     Launch the TUI (default)`);
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
