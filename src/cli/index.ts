import { parseArgs } from "util";
import path from "node:path";
import { mkdir, writeFile, readdir, stat, rename, rmdir, readFile } from "node:fs/promises";
import { runTui } from "../tui/tui.ts";
import { getPaths } from "../paths.ts";
import { buildPromptDocument, sanitizePromptTitle } from "../prompts.ts";
import {
  addHtmlPromptAsset,
  addHtmlPromptSource,
  compileHtmlPromptWorkspace,
  createHtmlPromptWorkspace,
  importHtmlPromptTable,
  lintHtmlPromptWorkspace,
  listHtmlPromptResources,
  removeHtmlPromptResource,
  upsertHtmlPromptSection,
  type HtmlPromptSectionMode,
  type HtmlPromptCompileTarget,
} from "../html-prompts.ts";

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

### 1b. Depositing a Structured HTML Prompt
For prompts that need local assets, source files, tables, or richer structure, create an HTML prompt workspace:
\`\`\`bash
princess create-prompt "Title of the Prompt" --format html [--category "optional/subfolder"]
princess html add-source "optional/subfolder/title-of-the-prompt" ./requirements.md --name requirements --trust trusted
princess html add-asset "optional/subfolder/title-of-the-prompt" ./wireframe.png --name wireframe --alt "Description of the image"
princess html import-table "optional/subfolder/title-of-the-prompt" ./data.csv --name data --trust untrusted
princess html set-section "optional/subfolder/title-of-the-prompt" constraints --text "Use existing project patterns."
princess html list "optional/subfolder/title-of-the-prompt"
princess html lint "optional/subfolder/title-of-the-prompt"
princess html compile "optional/subfolder/title-of-the-prompt" --target json
\`\`\`
The workspace contains \`prompt.html\`, \`manifest.json\`, \`assets/\`, \`sources/\`, \`partials/\`, and \`dist/\`. Edit \`prompt.html\` for the final task instructions. Local text and table resources are expanded during compile; image files are listed as attachments in \`dist/compiled.json\` and should be attached separately when the target model requires typed file inputs.

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

export async function createPrompt(title: string, category: string = "", format: "markdown" | "html" = "markdown") {
  if (format === "html") {
    try {
      const workspace = await createHtmlPromptWorkspace(title, { category });
      console.log(`Created HTML prompt workspace: ${workspace.path}`);
      console.log(`Edit prompt: ${path.join(workspace.path, "prompt.html")}`);
    } catch (err: any) {
      console.error(`Failed to create HTML prompt workspace: ${err.message}`);
    }
    return;
  }

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

export async function listPrompts(category: string = "", json: boolean = false) {
  const paths = getPaths();
  const targetDir = path.join(paths.inboxDir, category);
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });

    if (json) {
      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: path.join(targetDir, entry.name),
      }));
      console.log(JSON.stringify({ inbox: paths.inboxDir, items }, null, 2));
      return;
    }

    if (entries.length === 0) {
      console.log(`Inbox${category ? ` (${category})` : ""} is empty.`);
      return;
    }

    console.log(`Inbox Prompts${category ? ` in ${category}` : ""}:`);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        console.log(`- 📁 ${entry.name}/`);
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".html")) {
        console.log(`- 📄 ${entry.name}`);
      }
    }
    console.log(`\nInbox: ${paths.inboxDir}`);
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

export async function createClaudeMd() {
  const paths = getPaths();
  const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");
  const princessSection = `\n## Princess\n\nPrompts live in **Princess**. Run \`princess list\` to browse, \`princess create-prompt "<title>" [--category <folder>]\` to deposit.\n\nInbox: \`${paths.inboxDir}\`\n`;

  try {
    const fs = await import("node:fs/promises");
    const existing = await fs.readFile(claudeMdPath, "utf-8").catch(() => null);
    if (existing) {
      // Check if Princess section already exists
      if (existing.includes("## Princess") || existing.includes("Princess")) {
        console.log(`CLAUDE.md already mentions Princess.`);
        return;
      }
      await fs.writeFile(claudeMdPath, existing + princessSection);
      console.log(`Appended Princess section to ${claudeMdPath}`);
    } else {
      await fs.writeFile(claudeMdPath, `# Project Notes\n${princessSection}`);
      console.log(`Created ${claudeMdPath} with Princess section`);
    }
  } catch (err: any) {
    console.error(`Failed to create/update CLAUDE.md: ${err.message}`);
  }
}

function printUsage(): void {
  console.log(`Usage:`);
  console.log(`  princess init                    Initialize global directories and agent contracts`);
  console.log(`      --local                      Initialize a project-local workspace in the current directory`);
  console.log(`      --claude-md                  Add Princess mention to CLAUDE.md in the current directory`);
  console.log(`  princess create-prompt <title>   Create a new prompt in the inbox`);
  console.log(`      --category, -c <name>        (Optional) Put the prompt in a subfolder`);
  console.log(`      --format <markdown|html>     Create a Markdown file or HTML prompt workspace`);
  console.log(`  princess list                    List prompts in the inbox`);
  console.log(`      --category, -c <name>        (Optional) List a subfolder`);
  console.log(`      --json                       Output as JSON`);
  console.log(`  princess html add-source <workspace> <file>`);
  console.log(`      --name <id>                  Resource id to use in prompt.html`);
  console.log(`      --trust <trusted|untrusted>  Trust boundary for local source content`);
  console.log(`  princess html add-asset <workspace> <file>`);
  console.log(`      --name <id>                  Resource id to use in prompt.html`);
  console.log(`      --alt <text>                 Required model-facing image description`);
  console.log(`  princess html import-table <workspace> <csv-or-tsv>`);
  console.log(`      --name <id>                  Resource id to use in prompt.html`);
  console.log(`      --trust <trusted|untrusted>  Trust boundary for imported table data`);
  console.log(`  princess html set-section <workspace> <role>`);
  console.log(`      --text <text>                Text content to escape into prompt.html`);
  console.log(`      --from <file>                Read section content from a local file`);
  console.log(`      --as <text|html>             Treat content as escaped text or trusted HTML`);
  console.log(`      --heading <title>            Optional rendered section heading`);
  console.log(`  princess html list <workspace>   List attached workspace resources`);
  console.log(`      --json                       Output resources as JSON`);
  console.log(`  princess html remove-resource <workspace> <id>`);
  console.log(`      --delete-file                Also delete the copied workspace file`);
  console.log(`  princess html compile <workspace>`);
  console.log(`      --target <html|markdown|json> Output dist/compiled.*`);
  console.log(`  princess html lint <workspace>   Validate local refs, unsafe tags, and assets`);
  console.log(`  princess uninstall               Instructions for uninstalling Princess`);
  console.log(`  princess tui                     Launch the TUI (default)`);
  console.log(`\nEnvironment:`);
  console.log(`  PRINCESS_HOME                    Override the default inbox/config paths`);
}

async function runHtmlCommand(positionals: string[], values: Record<string, unknown>): Promise<void> {
  const subcommand = positionals[1];
  const workspace = positionals[2];
  const file = positionals[3];

  if (!subcommand || !workspace) {
    printUsage();
    process.exit(1);
  }

  switch (subcommand) {
    case "add-source": {
      if (!file) throw new Error("Usage: princess html add-source <workspace> <file>");
      const resource = await addHtmlPromptSource(workspace, file, {
        name: typeof values.name === "string" ? values.name : undefined,
        trust: typeof values.trust === "string" ? values.trust : undefined,
      });
      console.log(`Added source "${resource.id}": ${resource.path}`);
      break;
    }
    case "add-asset": {
      if (!file) throw new Error("Usage: princess html add-asset <workspace> <file>");
      const resource = await addHtmlPromptAsset(workspace, file, {
        name: typeof values.name === "string" ? values.name : undefined,
        alt: typeof values.alt === "string" ? values.alt : undefined,
      });
      console.log(`Added asset "${resource.id}": ${resource.path}`);
      break;
    }
    case "import-table": {
      if (!file) throw new Error("Usage: princess html import-table <workspace> <csv-or-tsv>");
      const resource = await importHtmlPromptTable(workspace, file, {
        name: typeof values.name === "string" ? values.name : undefined,
        trust: typeof values.trust === "string" ? values.trust : undefined,
      });
      console.log(`Imported table "${resource.id}": ${resource.path}`);
      break;
    }
    case "set-section": {
      if (!file) throw new Error("Usage: princess html set-section <workspace> <role> --text <text>");
      const text = typeof values.text === "string" ? values.text : undefined;
      const from = typeof values.from === "string" ? values.from : undefined;
      if ((text && from) || (!text && !from)) {
        throw new Error("Use exactly one of --text or --from for set-section.");
      }
      const content = from ? await readFile(path.resolve(from), "utf8") : text ?? "";
      const mode = typeof values.as === "string" ? values.as : "text";
      await upsertHtmlPromptSection(workspace, file, content, {
        heading: typeof values.heading === "string" ? values.heading : undefined,
        mode: mode as HtmlPromptSectionMode,
      });
      console.log(`Updated section "${file}" in ${workspace}`);
      break;
    }
    case "list": {
      const resources = await listHtmlPromptResources(workspace);
      if (values.json === true) {
        console.log(JSON.stringify({ workspace, resources }, null, 2));
        break;
      }
      if (resources.length === 0) {
        console.log("No resources attached.");
        break;
      }
      for (const resource of resources) {
        const trust = resource.trust ? ` trust=${resource.trust}` : "";
        const alt = resource.alt ? ` alt="${resource.alt}"` : "";
        console.log(`- ${resource.id} (${resource.type}) ${resource.path}${trust}${alt}`);
      }
      break;
    }
    case "remove-resource": {
      if (!file) throw new Error("Usage: princess html remove-resource <workspace> <id>");
      const removed = await removeHtmlPromptResource(workspace, file, {
        deleteFile: values["delete-file"] === true,
      });
      if (!removed) {
        console.log(`Resource not found: ${file}`);
        process.exit(1);
      }
      console.log(`Removed ${removed.type} "${removed.id}"`);
      break;
    }
    case "compile": {
      const target = typeof values.target === "string" ? values.target : "html";
      const compiled = await compileHtmlPromptWorkspace(workspace, {
        target: target as HtmlPromptCompileTarget,
      });
      console.log(`Compiled ${compiled.target} prompt: ${compiled.path}`);
      break;
    }
    case "lint": {
      const issues = await lintHtmlPromptWorkspace(workspace);
      if (issues.length === 0) {
        console.log("HTML prompt workspace passed lint.");
        return;
      }
      for (const issue of issues) {
        console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
      }
      if (issues.some((issue) => issue.severity === "error")) {
        process.exit(1);
      }
      break;
    }
    default:
      console.log(`Unknown HTML command: ${subcommand}`);
      printUsage();
      process.exit(1);
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
      help: {
        type: "boolean",
        short: "h",
      },
      json: {
        type: "boolean",
      },
      format: {
        type: "string",
      },
      name: {
        type: "string",
      },
      trust: {
        type: "string",
      },
      alt: {
        type: "string",
      },
      target: {
        type: "string",
      },
      text: {
        type: "string",
      },
      from: {
        type: "string",
      },
      as: {
        type: "string",
      },
      heading: {
        type: "string",
      },
      "delete-file": {
        type: "boolean",
      },
      "claude-md": {
        type: "boolean",
      },
    },
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const command = positionals[0] || "tui";
  const category = values.category || "";

  const paths = getPaths();
  await performMigrationIfNecessary(paths);

  switch (command) {
    case "init":
      await bootstrap(values.local);
      if (values["claude-md"]) {
        await createClaudeMd();
      }
      break;
    case "create-prompt":
      const title = positionals.slice(1).join(" ") || "Untitled Prompt";
      const format = values.format === "html" ? "html" : "markdown";
      await createPrompt(title, category, format);
      break;
    case "list":
      await listPrompts(category, values.json);
      break;
    case "html":
      await runHtmlCommand(positionals, values);
      break;
    case "tui":
      if (!process.stdout.isTTY) {
        console.log("Princess TUI requires an interactive terminal.");
        console.log("For non-interactive use, try:");
        console.log("  princess list");
        console.log("  princess create-prompt \"<title>\" [--category <name>]");
        process.exit(1);
      }
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
      printUsage();
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
