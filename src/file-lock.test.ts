import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { withFileLock } from "./file-lock.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
  }
}

function section(name: string) {
  console.log(`\n-- ${name} --`);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "princess-lock-"));

try {
  section("serializes overlapping callers");
  {
    const lockPath = path.join(tempRoot, "serialize.lock");
    const order: string[] = [];

    const first = withFileLock(lockPath, async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 80));
      order.push("first-end");
      return 1;
    });

    const second = withFileLock(lockPath, async () => {
      order.push("second-start");
      order.push("second-end");
      return 2;
    });

    const [a, b] = await Promise.all([first, second]);
    assertEq(a, 1, "first caller returns its value");
    assertEq(b, 2, "second caller returns its value");
    assertEq(
      order,
      ["first-start", "first-end", "second-start", "second-end"],
      "second caller starts only after first releases the lock",
    );
    assertEq((await stat(lockPath).catch(() => null)), null, "lock file is removed after work completes");
  }

  section("releases lock when work throws");
  {
    const lockPath = path.join(tempRoot, "throw.lock");

    let caught: unknown = null;
    try {
      await withFileLock(lockPath, async () => {
        throw new Error("boom");
      });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error && (caught as Error).message === "boom", "error propagates to caller");
    assertEq((await stat(lockPath).catch(() => null)), null, "lock file is removed even after work throws");

    const after = await withFileLock(lockPath, async () => 42);
    assertEq(after, 42, "lock can be re-acquired after a previous error");
  }

  section("recovers from a stale lock with a dead PID");
  {
    const lockPath = path.join(tempRoot, "stale-pid.lock");
    const stale = {
      pid: 999_999_999,
      hostname: os.hostname(),
      acquiredAt: new Date().toISOString(),
    };
    await writeFile(lockPath, `${JSON.stringify(stale)}\n`, "utf8");

    const result = await withFileLock(lockPath, async () => "recovered", {
      timeoutMs: 1000,
    });
    assertEq(result, "recovered", "lock acquired after stale-PID recovery");
  }

  section("recovers from an aged lock");
  {
    const lockPath = path.join(tempRoot, "stale-age.lock");
    const stale = {
      pid: process.pid,
      hostname: "some-other-host",
      acquiredAt: new Date(Date.now() - 60_000).toISOString(),
    };
    await writeFile(lockPath, `${JSON.stringify(stale)}\n`, "utf8");

    const result = await withFileLock(lockPath, async () => "recovered", {
      timeoutMs: 1000,
      staleAfterMs: 5_000,
    });
    assertEq(result, "recovered", "lock acquired after age-based stale recovery");
  }

  section("times out when the lock holder stays alive");
  {
    const lockPath = path.join(tempRoot, "timeout.lock");

    const holder = withFileLock(
      lockPath,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      },
      { timeoutMs: 5000 },
    );

    let timedOut = false;
    try {
      await withFileLock(lockPath, async () => "should not run", {
        timeoutMs: 80,
        staleAfterMs: 60_000,
      });
    } catch (err) {
      timedOut = (err as Error).message.includes("Timed out");
    }
    assert(timedOut, "second caller throws a timeout error while first holds the lock");

    await holder;
    const after = await withFileLock(lockPath, async () => "ok", { timeoutMs: 1000 });
    assertEq(after, "ok", "lock recoverable after the holder releases");
  }

  section("payload includes pid, hostname, and timestamp while held");
  {
    const lockPath = path.join(tempRoot, "payload.lock");

    let recorded: string | null = null;
    await withFileLock(lockPath, async () => {
      recorded = await readFile(lockPath, "utf8");
    });

    const parsed = JSON.parse(recorded ?? "{}") as { pid: number; hostname: string; acquiredAt: string };
    assertEq(parsed.pid, process.pid, "lock payload records the current pid");
    assertEq(parsed.hostname, os.hostname(), "lock payload records the current hostname");
    assert(typeof parsed.acquiredAt === "string" && parsed.acquiredAt.length > 0, "lock payload records acquiredAt timestamp");
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"-".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
