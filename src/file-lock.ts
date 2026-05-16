import { hostname } from "node:os";
import { readFile, unlink, writeFile } from "node:fs/promises";

export interface WithFileLockOptions {
  timeoutMs?: number;
  initialPollMs?: number;
  maxPollMs?: number;
  staleAfterMs?: number;
}

interface LockPayload {
  pid: number;
  hostname: string;
  acquiredAt: string;
}

const DEFAULTS = {
  timeoutMs: 5000,
  initialPollMs: 20,
  maxPollMs: 200,
  staleAfterMs: 30_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    return code === "EPERM";
  }
}

async function readLockPayload(lockPath: string): Promise<LockPayload | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as LockPayload;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.hostname !== "string" ||
      typeof parsed.acquiredAt !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isStale(payload: LockPayload, staleAfterMs: number): boolean {
  if (payload.hostname === hostname() && !isProcessAlive(payload.pid)) {
    return true;
  }
  const acquired = Date.parse(payload.acquiredAt);
  if (!Number.isFinite(acquired)) return true;
  return Date.now() - acquired > staleAfterMs;
}

async function tryRemoveStale(lockPath: string, staleAfterMs: number): Promise<boolean> {
  const payload = await readLockPayload(lockPath);
  if (payload === null) {
    await unlink(lockPath).catch(() => {});
    return true;
  }
  if (isStale(payload, staleAfterMs)) {
    await unlink(lockPath).catch(() => {});
    return true;
  }
  return false;
}

async function acquireLock(
  lockPath: string,
  options: Required<WithFileLockOptions>,
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  let pollMs = options.initialPollMs;
  const payload: LockPayload = {
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: new Date().toISOString(),
  };
  const body = `${JSON.stringify(payload)}\n`;

  while (true) {
    try {
      await writeFile(lockPath, body, { flag: "wx" });
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "EEXIST") throw err;
    }

    await tryRemoveStale(lockPath, options.staleAfterMs);

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${options.timeoutMs}ms waiting for lock: ${lockPath}`,
      );
    }
    const jitter = Math.floor(Math.random() * pollMs);
    await sleep(jitter);
    pollMs = Math.min(pollMs * 2, options.maxPollMs);
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") throw err;
  }
}

export async function withFileLock<T>(
  lockPath: string,
  work: () => Promise<T>,
  options: WithFileLockOptions = {},
): Promise<T> {
  const resolved: Required<WithFileLockOptions> = {
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    initialPollMs: options.initialPollMs ?? DEFAULTS.initialPollMs,
    maxPollMs: options.maxPollMs ?? DEFAULTS.maxPollMs,
    staleAfterMs: options.staleAfterMs ?? DEFAULTS.staleAfterMs,
  };
  await acquireLock(lockPath, resolved);
  try {
    return await work();
  } finally {
    await releaseLock(lockPath);
  }
}
