# Princess Prompt Contract

The model is used to interpret already-computed folder dossiers and return structured rename proposals.

Princess should not send arbitrary raw repository contents when a dossier summary is sufficient.

## System prompt

```text
You are Princess, a repository structure analyst.

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
- Be conservative. Low confidence should result in "keep", not speculation.
```

## User payload shape

```json
{
  "repoSummary": {
    "rootName": "my-repo",
    "detectedStack": ["typescript", "react", "vite"],
    "namingStyle": "mixed",
    "notes": [
      "Source repo must remain untouched",
      "Focus on directories only"
    ]
  },
  "thresholds": {
    "minConfidence": 0.78,
    "maxNameLength": 56,
    "maxSegments": 4
  },
  "directories": [
    {
      "relativePath": "src/lib",
      "currentName": "lib",
      "parentPath": "src",
      "childDirectories": [],
      "representativeFiles": ["api.ts", "formatMoney.ts", "date.ts"],
      "extensionCounts": {".ts": 3},
      "frameworkHints": ["no-react-imports"],
      "testHints": [],
      "instructionFiles": [],
      "staticSummary": "Mostly pure TypeScript utilities and data formatting helpers."
    }
  ]
}
```

## Required model response shape

The response must validate against [`schemas--json-contracts/model-output.schema.json`](/Users/lukehightower/Desktop/websites/princess/schemas--json-contracts/model-output.schema.json).

Example:

```json
{
  "repoSummary": {
    "rootName": "my-repo",
    "detectedStack": ["typescript", "react", "vite"]
  },
  "proposals": [
    {
      "relativePath": "src/lib",
      "currentName": "lib",
      "proposedName": "lib--pure-ts",
      "purpose": "Pure shared TypeScript helpers.",
      "directives": ["pure-ts"],
      "confidence": 0.88,
      "decision": "rename",
      "reasoning": "The folder contains utility modules with no React imports and a stable shared-library role.",
      "riskFlags": []
    }
  ]
}
```

## Prompting constraints

- Batch directories by size-limited chunks.
- Include sibling context when useful.
- Include parent and child signals, not only local files.
- Do not ask the model to rewrite imports or execute renames.
- Do not ask the model to invent directives outside the allowed vocabulary unless the fallback mode explicitly permits it.

## Failure handling

If the model returns invalid JSON or invalid names:

1. reject the response
2. optionally retry once with the validation errors
3. fall back to `keep` when uncertainty remains

## Controlled directive vocabulary for v0

Initial preferred directives:

- `shared-ui`
- `feature-ui`
- `pure-ts`
- `react-state`
- `domain-types`
- `test-only`
- `auth-required`
- `public-routes`
- `content`
- `generated`

The implementation may allow additional directives later, but v0 should prefer normalization over creativity.
