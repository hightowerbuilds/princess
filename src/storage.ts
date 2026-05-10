import path from "node:path";
import { mkdir, rename, writeFile, unlink, readdir, stat } from "node:fs/promises";

function tempPathFor(targetPath: string): string {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  return path.join(dir, `.${base}.${suffix}`);
}

export async function cleanupTempFiles(dir: string, maxAgeMs = 1000 * 60 * 60) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await cleanupTempFiles(entryPath, maxAgeMs);
      } else if (entry.name.startsWith(".") && entry.name.endsWith(".tmp")) {
        const s = await stat(entryPath).catch(() => null);
        if (s && (now - s.mtimeMs) > maxAgeMs) {
          await unlink(entryPath).catch(() => {});
        }
      }
    }
  } catch {}
}

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const tempPath = tempPathFor(targetPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, targetPath);
  } catch (err) {
    await unlink(tempPath).catch(() => {});
    throw err;
  }
}
