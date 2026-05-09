import { spawn } from "node:child_process";
import os from "node:os";

export async function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    let command = "";
    let args: string[] = [];

    if (platform === "darwin") {
      command = "pbcopy";
    } else if (platform === "win32") {
      command = "clip";
    } else {
      command = "xclip";
      args = ["-selection", "clipboard"];
    }

    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });

    child.on("error", (err) => {
      // If xclip isn't installed on linux, we could try xsel, but for now just reject
      reject(new Error(`Failed to copy: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Clipboard command exited with code ${code}`));
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}
