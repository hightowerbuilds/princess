import path from "node:path";
import os from "node:os";
import fs from "node:fs";

function findProjectLocalPrincess(): string | null {
  let current = process.cwd();
  while (true) {
    const princessDir = path.join(current, ".princess");
    if (fs.existsSync(princessDir) && fs.statSync(princessDir).isDirectory()) {
      return princessDir;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break; // Reached root
    }
    current = parent;
  }
  return null;
}

export function getPaths() {
  const home = os.homedir();
  const env = process.env;

  // 1. Explicit override
  if (env.PRINCESS_HOME) {
    return {
      dataDir: env.PRINCESS_HOME,
      configDir: env.PRINCESS_HOME,
      inboxDir: path.join(env.PRINCESS_HOME, "inbox"),
      agentFile: path.join(env.PRINCESS_HOME, "AGENT.md"),
      oldPrincessDir: path.join(home, ".princess"),
      isLocal: false,
    };
  }

  // 2. Project-Local Discovery
  const localPrincessDir = findProjectLocalPrincess();
  if (localPrincessDir) {
    return {
      dataDir: localPrincessDir,
      configDir: localPrincessDir,
      inboxDir: path.join(localPrincessDir, "inbox"),
      agentFile: path.join(localPrincessDir, "AGENT.md"),
      oldPrincessDir: path.join(home, ".princess"),
      isLocal: true,
    };
  }

  // 3. XDG Base Directory Specification
  const dataHome = env.XDG_DATA_HOME || path.join(home, ".local", "share");
  const configHome = env.XDG_CONFIG_HOME || path.join(home, ".config");

  const dataDir = path.join(dataHome, "princess");
  const configDir = path.join(configHome, "princess");

  return {
    dataDir,
    configDir,
    inboxDir: path.join(dataDir, "inbox"),
    agentFile: path.join(configDir, "AGENT.md"),
    oldPrincessDir: path.join(home, ".princess"),
    isLocal: false,
  };
}
