#!/usr/bin/env bun

import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { executeRenamePlan } from "./apply.ts";
import { analyzeRepository } from "./discovery.ts";
import { buildRenamePlan, resolveThresholds } from "./pipeline.ts";
import { formatApplyReport, formatDryRunReport } from "./report.ts";
import type { RunManifest } from "./contracts";

type CommandName = "optimize" | "verify";
type FlagValue = boolean | number | string | undefined;

interface ParsedCommand {
  command?: CommandName;
  positionals: string[];
  flags: Record<string, FlagValue>;
}

async function main(): Promise<void> {
  const parsed = parseCommand(Bun.argv.slice(2));

  if (!parsed.command || parsed.flags.help) {
    printUsage();
    return;
  }

  if (parsed.command === "optimize") {
    await runOptimize(parsed);
    return;
  }

  if (parsed.command === "verify") {
    await runVerify(parsed);
    return;
  }

  throw new Error(`Unsupported command: ${parsed.command}`);
}

async function runOptimize(parsed: ParsedCommand): Promise<void> {
  const repoArg = parsed.positionals[0];

  if (!repoArg) {
    throw new Error("Missing repo path. Usage: princess optimize <repo>");
  }

  const sourceRepoPath = path.resolve(repoArg);
  const sourceStats = await stat(sourceRepoPath).catch(() => null);

  if (!sourceStats?.isDirectory()) {
    throw new Error(`Repo path is not a directory: ${sourceRepoPath}`);
  }

  const engine = String(parsed.flags.engine ?? "heuristic");

  const outputRepoPath = parsed.flags.out
    ? path.resolve(String(parsed.flags.out))
    : path.join(path.dirname(sourceRepoPath), `${path.basename(sourceRepoPath)}-princess`);

  if (isPathInside(sourceRepoPath, outputRepoPath)) {
    throw new Error("Output path must not live inside the source repo.");
  }

  const thresholds = resolveThresholds({
    minConfidence:
      typeof parsed.flags["min-confidence"] === "number"
        ? parsed.flags["min-confidence"]
        : undefined,
  });

  const { repoSummary, dossiers } = await analyzeRepository(sourceRepoPath, {
    includeHidden: Boolean(parsed.flags["include-hidden"]),
    maxDepth:
      typeof parsed.flags["max-depth"] === "number"
        ? parsed.flags["max-depth"]
        : undefined,
  });

  const plan = await buildRenamePlan({
    sourceRepoPath,
    outputRepoPath,
    repoSummary,
    dossiers,
    thresholds,
    engine:
      engine === "model" || engine === "auto" || engine === "heuristic"
        ? engine
        : "heuristic",
    modelOptions: {
      model: typeof parsed.flags.model === "string" ? parsed.flags.model : undefined,
      reasoningEffort:
        typeof parsed.flags["reasoning-effort"] === "string"
          ? parsed.flags["reasoning-effort"] as never
          : undefined,
      timeoutMs:
        typeof parsed.flags["timeout-ms"] === "number"
          ? parsed.flags["timeout-ms"]
          : undefined,
      maxDossiersPerCall:
        typeof parsed.flags["max-dossiers-per-call"] === "number"
          ? parsed.flags["max-dossiers-per-call"]
          : undefined,
    },
  });

  const isDryRun = Boolean(parsed.flags["dry-run"]);

  if (isDryRun && parsed.flags.json) {
    console.log(
      JSON.stringify(
        {
          command: "optimize",
          mode: "dry-run",
          engineRequested: engine,
          engineUsed: plan.inference?.engineUsed ?? engine,
          sourceRepoPath,
          outputRepoPath,
          repoSummary,
          analyzedDirectories: dossiers.length,
          plan,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (isDryRun) {
    console.log(
      formatDryRunReport({
        engine,
        sourceRepoPath,
        outputRepoPath,
        repoSummary,
        dossiers,
        plan,
      }),
    );
    return;
  }

  const manifest = await executeRenamePlan(plan, {
    force: Boolean(parsed.flags.force),
    preserveGit: Boolean(parsed.flags["preserve-git"]),
  });

  if (parsed.flags.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(
    formatApplyReport({
      sourceRepoPath,
      outputRepoPath,
      manifest,
    }),
  );
}

async function runVerify(parsed: ParsedCommand): Promise<void> {
  const repoArg = parsed.positionals[0];

  if (!repoArg) {
    throw new Error("Missing repo path. Usage: princess verify <repo>");
  }

  const repoPath = path.resolve(repoArg);
  const manifestPath = path.join(repoPath, ".princess", "run-manifest.json");
  const raw = await readFile(manifestPath, "utf8").catch(() => "");

  if (!raw) {
    throw new Error(`No run manifest found at ${manifestPath}.`);
  }

  const manifest = JSON.parse(raw) as RunManifest;

  if (parsed.flags.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(`Princess verify`);
  console.log("");
  console.log(`Repo: ${repoPath}`);
  console.log(`Status: ${manifest.verification.status}`);

  for (const check of manifest.verification.checks) {
    console.log(`- ${check.name}: ${check.status}${check.details ? ` (${check.details})` : ""}`);
  }
}

function parseCommand(argv: string[]): ParsedCommand {
  const result: ParsedCommand = {
    command: undefined,
    positionals: [],
    flags: {},
  };

  const [commandCandidate, ...rest] = argv;

  if (
    commandCandidate === "optimize" ||
    commandCandidate === "verify"
  ) {
    result.command = commandCandidate;
  } else if (commandCandidate) {
    result.positionals.push(commandCandidate);
  }

  for (let index = result.command ? 0 : -1; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      result.positionals.push(token);
      continue;
    }

    const [rawFlag, rawInlineValue] = token.slice(2).split("=", 2);

    if (rawInlineValue !== undefined) {
      result.flags[rawFlag] = coerceFlagValue(rawInlineValue);
      continue;
    }

    const nextToken = rest[index + 1];

    if (nextToken && !nextToken.startsWith("--")) {
      result.flags[rawFlag] = coerceFlagValue(nextToken);
      index += 1;
      continue;
    }

    result.flags[rawFlag] = true;
  }

  return result;
}

function coerceFlagValue(value: string): FlagValue {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  const numeric = Number(value);

  if (!Number.isNaN(numeric) && value.trim() !== "") {
    return numeric;
  }

  return value;
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function printUsage(): void {
  console.log(`Princess

Usage:
  princess optimize <repo> [--dry-run] [--json] [--force] [--preserve-git] [--engine heuristic|auto|model]
  princess verify <repo> [--json]

Notes:
  - optimize applies changes unless --dry-run is present.
  - --engine model uses OPENAI_API_KEY with the Responses API.
  - --engine auto tries the model path first and falls back to heuristics.
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Princess error: ${message}`);
  process.exitCode = 1;
});
