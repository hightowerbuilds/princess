import { parseArgs } from "util";
import path from "node:path";
import { mkdir, writeFile, readdir, stat, rename, rmdir } from "node:fs/promises";
import { runTui } from "../tui/tui.ts";
import { getPaths } from "../paths.ts";

function getAgentInstructions(inboxDir: string) {
  return `# Princess Prompt Stacker: Agent Instructions

You are reading this because the user has asked you to interact with **Princess**, their global Prompt Stacker. Princess is a terminal-based inbox and text editor designed specifically for managing complex prompts.

Whenever the user asks you to "draft a prompt," "save this to my inbox," or "put this in Princess," you should follow these protocols.

## The Inbox Location
The Princess inbox is located at:
**\`${inboxDir}\`**
*(Note: This path may be customized via environment variables).*

All prompts are stored as standard Markdown (\`.md\`) files in this directory.

## How to Interact with Princess

### 1. Depositing a New Prompt
Do not just output the prompt in the chat. Instead, deposit it directly into the inbox.

1. **Create the entry:** Run the CLI command:
   \`\`\`bash
   princess create-prompt "Title of the Prompt" [--category "optional/subfolder"]
   \`\`\`
   *This will create a new, sanitized markdown file (e.g., \`${path.join(inboxDir, "optional", "subfolder", "title-of-the-prompt.md")}\`) with the title pre-filled.*

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

## Human Handoff
Once you have created or edited a prompt in the inbox, simply tell the user:
> *"I have saved the prompt to your inbox. Run \`princess tui\` to view and edit it."*

The user will use the Princess Terminal User Interface (TUI) to handle it from there.`;
}

async function performMigrationIfNecessary(paths: ReturnType<typeof getPaths>) {
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

async function bootstrap(isLocal: boolean = false) {
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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
