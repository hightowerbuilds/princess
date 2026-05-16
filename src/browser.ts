import path from "node:path";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";

export interface BrowserOpenCommand {
  command: string;
  args: string[];
}

export function defaultBrowserOpenCommand(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand {
  const absolutePath = path.resolve(filePath);

  if (platform === "darwin") {
    return { command: "open", args: [absolutePath] };
  }

  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", absolutePath] };
  }

  return { command: "xdg-open", args: [absolutePath] };
}

export async function openFileInDefaultBrowser(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const fileStat = await stat(absolutePath).catch((error) => {
    if ((error as { code?: string }).code === "ENOENT") {
      throw new Error(`Browser target file not found: ${absolutePath}`);
    }
    throw error;
  });

  if (!fileStat.isFile()) {
    throw new Error(`Browser target is not a file: ${absolutePath}`);
  }

  const { command, args } = defaultBrowserOpenCommand(absolutePath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsHide: true,
    });

    child.once("error", (error) => {
      reject(new Error(`Failed to open browser: ${error.message}`));
    });

    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to open browser: ${command} exited with code ${code}.`));
      }
    });
  });

  return absolutePath;
}
