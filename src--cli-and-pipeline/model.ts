import { readFile } from "node:fs/promises";
import type {
  FolderDossier,
  ModelThresholds,
  OpenAIModelOptions,
  ProgressCallback,
  RenameProposal,
  RepoSummary,
} from "./contracts";
import { validatePrincessName } from "./naming";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const DEFAULT_REASONING_EFFORT = "low";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_DOSSIERS_PER_CALL = 20;
const MODEL_OUTPUT_SCHEMA_URL = new URL(
  "../schemas--json-contracts/model-output.schema.json",
  import.meta.url,
);

const SYSTEM_PROMPT = `You are Princess, a repository structure analyst.

Your job is to decide whether a directory in a software repository should be renamed to a more legible, normalized folder name.

You are given structured evidence about each directory. Use that evidence to infer purpose, not guess from the current folder name alone.

Output JSON only. Do not include markdown. Do not include commentary outside the JSON object.

Naming rules:
- Use lowercase ASCII only.
- Use single hyphens between words.
- Use double hyphens between semantic segments.
- Max 4 segments total.
- Max 56 characters total.
- Segment 1 is the purpose.
- Prefer stable purpose words over implementation trivia.
- Use directives only when they add meaningful disambiguation.
- Avoid generic names like "stuff", "misc", "common", or "things".

Decision rules:
- Use "rename" only when the proposed name is materially better than the current name.
- Use "keep" when the current name is already strong or evidence is mixed.
- Use "ignore" for generated, external, or non-actionable directories.
- Be conservative. Low confidence should result in "keep", not speculation.`;

export interface ResolvedOpenAIModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  timeoutMs: number;
  maxDossiersPerCall: number;
}

interface ModelBatchResponse {
  repoSummary: {
    rootName: string;
    detectedStack: string[];
  };
  proposals: RenameProposal[];
}

interface ModelInferenceInput {
  repoSummary: RepoSummary;
  dossiers: FolderDossier[];
  thresholds: ModelThresholds;
  modelOptions?: OpenAIModelOptions;
}

export async function inferModelRenameProposals(
  input: ModelInferenceInput,
  onProgress?: ProgressCallback,
): Promise<{ proposals: RenameProposal[]; rawModelResponse: string }> {
  const config = resolveOpenAIModelConfig(input.modelOptions);
  const schema = await loadModelOutputSchema();
  const chunks = chunkDossiers(input.dossiers, config.maxDossiersPerCall);
  const responses: string[] = [];
  const proposals: RenameProposal[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];

    if (onProgress) {
      onProgress({
        type: "inference",
        totalChunks: chunks.length,
        completedChunks: index,
        currentChunkSize: chunk.length,
        engineUsed: "model",
      });
    }

    const result = await requestModelChunk({
      repoSummary: input.repoSummary,
      dossiers: chunk,
      thresholds: input.thresholds,
      schema,
      config,
    });

    responses.push(result.rawResponse);
    proposals.push(...result.parsed.proposals);
  }

  if (onProgress) {
    onProgress({
      type: "inference",
      totalChunks: chunks.length,
      completedChunks: chunks.length,
      currentChunkSize: 0,
      engineUsed: "model",
    });
  }

  return {
    proposals,
    rawModelResponse: responses.join("\n\n"),
  };
}

export function resolveOpenAIModelConfig(
  options: OpenAIModelOptions = {},
): ResolvedOpenAIModelConfig {
  const apiKey = options.apiKey ?? Bun.env.OPENAI_API_KEY ?? "";
  const baseUrl =
    options.baseUrl ??
    Bun.env.PRINCESS_OPENAI_BASE_URL ??
    Bun.env.OPENAI_BASE_URL ??
    DEFAULT_OPENAI_BASE_URL;
  const model =
    options.model ??
    Bun.env.PRINCESS_OPENAI_MODEL ??
    DEFAULT_OPENAI_MODEL;
  const reasoningEffort =
    options.reasoningEffort ??
    Bun.env.PRINCESS_OPENAI_REASONING_EFFORT ??
    DEFAULT_REASONING_EFFORT;
  const timeoutMs = resolvePositiveInteger(
    options.timeoutMs,
    Bun.env.PRINCESS_OPENAI_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const maxDossiersPerCall = resolvePositiveInteger(
    options.maxDossiersPerCall,
    Bun.env.PRINCESS_OPENAI_MAX_DOSSIERS_PER_CALL,
    DEFAULT_MAX_DOSSIERS_PER_CALL,
  );

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Provide it in the environment or use --engine heuristic.",
    );
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    reasoningEffort,
    timeoutMs,
    maxDossiersPerCall,
  };
}

async function requestModelChunk(input: {
  repoSummary: RepoSummary;
  dossiers: FolderDossier[];
  thresholds: ModelThresholds;
  schema: Record<string, unknown>;
  config: ResolvedOpenAIModelConfig;
}): Promise<{ parsed: ModelBatchResponse; rawResponse: string }> {
  const expectedPaths = new Set(input.dossiers.map((dossier) => dossier.relativePath));
  const userPayload = JSON.stringify(
    {
      repoSummary: {
        rootName: input.repoSummary.rootName,
        detectedStack: input.repoSummary.detectedStack,
        namingStyle: input.repoSummary.namingStyle,
        notes: [
          ...(input.repoSummary.notes ?? []),
          "Return proposals for exactly the directories provided in this batch.",
        ],
      },
      thresholds: input.thresholds,
      directories: input.dossiers,
    },
    null,
    2,
  );

  try {
    return await performModelRequest({
      config: input.config,
      schema: input.schema,
      userPayload,
      expectedPaths,
    });
  } catch (error) {
    return await performModelRequest({
      config: input.config,
      schema: input.schema,
      userPayload: `${userPayload}\n\nThe previous attempt failed validation. Return valid JSON with one proposal per provided relativePath.`,
      expectedPaths,
      retryCause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function performModelRequest(input: {
  config: ResolvedOpenAIModelConfig;
  schema: Record<string, unknown>;
  userPayload: string;
  expectedPaths: Set<string>;
  retryCause?: string;
}): Promise<{ parsed: ModelBatchResponse; rawResponse: string }> {
  const response = await fetch(`${input.config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.config.model,
      store: false,
      reasoning: {
        effort: input.config.reasoningEffort,
      },
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: input.userPayload,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "princess_model_output",
          schema: input.schema,
          strict: true,
        },
      },
    }),
    signal: AbortSignal.timeout(input.config.timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const retrySuffix = input.retryCause ? ` Retry context: ${input.retryCause}` : "";
    throw new Error(
      `OpenAI Responses API request failed with ${response.status}.${retrySuffix} ${body}`.trim(),
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const rawResponse = extractOutputText(payload);
  const parsed = validateModelBatchResponse(rawResponse, input.expectedPaths);

  return {
    parsed,
    rawResponse,
  };
}

function extractOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content)
      : [];

    for (const piece of content) {
      if (!piece || typeof piece !== "object") {
        continue;
      }

      if ((piece as { type?: unknown }).type === "output_text") {
        const text = (piece as { text?: unknown }).text;
        if (typeof text === "string") {
          parts.push(text);
        }
      }
    }
  }

  if (parts.length === 0) {
    throw new Error("Responses API returned no output_text payload.");
  }

  return parts.join("\n");
}

function validateModelBatchResponse(
  rawResponse: string,
  expectedPaths: Set<string>,
): ModelBatchResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawResponse);
  } catch (error) {
    throw new Error(
      `Model output was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model output root must be an object.");
  }

  const payload = parsed as {
    repoSummary?: unknown;
    proposals?: unknown;
  };

  if (!payload.repoSummary || typeof payload.repoSummary !== "object") {
    throw new Error("Model output must include repoSummary.");
  }

  if (!Array.isArray(payload.proposals)) {
    throw new Error("Model output must include proposals array.");
  }

  const proposals = payload.proposals.map((proposal, index) =>
    validateRenameProposal(proposal, index),
  );
  const returnedPaths = new Set(proposals.map((proposal) => proposal.relativePath));

  for (const path of expectedPaths) {
    if (!returnedPaths.has(path)) {
      throw new Error(`Model output omitted proposal for "${path}".`);
    }
  }

  for (const proposal of proposals) {
    if (!expectedPaths.has(proposal.relativePath)) {
      throw new Error(`Model returned unexpected directory "${proposal.relativePath}".`);
    }
  }

  return {
    repoSummary: {
      rootName: String(
        (payload.repoSummary as { rootName?: unknown }).rootName ?? "",
      ),
      detectedStack: Array.isArray(
        (payload.repoSummary as { detectedStack?: unknown }).detectedStack,
      )
        ? ((payload.repoSummary as { detectedStack: unknown[] }).detectedStack)
            .filter((entry): entry is string => typeof entry === "string")
        : [],
    },
    proposals,
  };
}

function validateRenameProposal(value: unknown, index: number): RenameProposal {
  if (!value || typeof value !== "object") {
    throw new Error(`Proposal at index ${index} must be an object.`);
  }

  const proposal = value as Record<string, unknown>;
  const relativePath = asRequiredString(proposal.relativePath, `proposals[${index}].relativePath`);
  const currentName = asRequiredString(proposal.currentName, `proposals[${index}].currentName`);
  const proposedName = asRequiredString(proposal.proposedName, `proposals[${index}].proposedName`);
  const purpose = asRequiredString(proposal.purpose, `proposals[${index}].purpose`);
  const reasoning = asRequiredString(proposal.reasoning, `proposals[${index}].reasoning`);
  const confidence = asRequiredNumber(proposal.confidence, `proposals[${index}].confidence`);
  const decision = asDecision(proposal.decision, `proposals[${index}].decision`);
  const directives = asStringArray(proposal.directives, `proposals[${index}].directives`);
  const riskFlags = asStringArray(proposal.riskFlags, `proposals[${index}].riskFlags`);
  const nameValidation = validatePrincessName(proposedName);

  if (!nameValidation.valid) {
    throw new Error(
      `Proposal at index ${index} has invalid proposedName "${proposedName}": ${nameValidation.errors.join(" ")}`,
    );
  }

  if (confidence < 0 || confidence > 1) {
    throw new Error(`Proposal at index ${index} has confidence outside 0..1.`);
  }

  return {
    relativePath,
    currentName,
    proposedName,
    purpose,
    directives,
    confidence,
    decision,
    reasoning,
    riskFlags,
  };
}

function asRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function asRequiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }

  return value;
}

function asDecision(value: unknown, label: string): RenameProposal["decision"] {
  if (value === "rename" || value === "keep" || value === "ignore") {
    return value;
  }

  throw new Error(`${label} must be one of rename, keep, or ignore.`);
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`${label}[${index}] must be a string.`);
    }

    return entry;
  });
}

function resolvePositiveInteger(
  directValue: number | undefined,
  envValue: string | undefined,
  fallback: number,
): number {
  if (typeof directValue === "number" && Number.isFinite(directValue) && directValue > 0) {
    return Math.floor(directValue);
  }

  if (typeof envValue === "string" && envValue.trim() !== "") {
    const parsed = Number(envValue);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return fallback;
}

async function loadModelOutputSchema(): Promise<Record<string, unknown>> {
  const raw = await readFile(MODEL_OUTPUT_SCHEMA_URL, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function chunkDossiers(
  dossiers: FolderDossier[],
  maxDossiersPerCall: number,
): FolderDossier[][] {
  const chunks: FolderDossier[][] = [];

  for (let index = 0; index < dossiers.length; index += maxDossiersPerCall) {
    chunks.push(dossiers.slice(index, index + maxDossiersPerCall));
  }

  return chunks;
}
