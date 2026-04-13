import type { FolderDossier, ModelThresholds, RenameProposal } from "./contracts";
import { buildPrincessName, validatePrincessName } from "./naming";

export function inferHeuristicRenameProposals(
  dossiers: FolderDossier[],
  thresholds: ModelThresholds,
): RenameProposal[] {
  return dossiers.map((dossier) => inferHeuristicRenameProposal(dossier, thresholds));
}

function inferHeuristicRenameProposal(
  dossier: FolderDossier,
  thresholds: ModelThresholds,
): RenameProposal {
  const currentName = dossier.currentName;
  const normalizedName = normalizeFolderName(currentName);
  const basePurpose = normalizedName.split("--", 1)[0] ?? normalizedName;
  const extCounts = dossier.extensionCounts;
  const representativeFiles = dossier.representativeFiles;
  const riskFlags: string[] = [];

  if (currentName.includes("--")) {
    const validation = validatePrincessName(currentName);

    if (validation.valid) {
      return {
        relativePath: dossier.relativePath,
        currentName,
        proposedName: currentName,
        purpose: `Directory already uses Princess naming with base purpose "${basePurpose}".`,
        directives: currentName.split("--").slice(1),
        confidence: 0.99,
        decision: "keep",
        reasoning: "The current directory name already conforms to the Princess naming grammar.",
        riskFlags: ["already-princess"],
      };
    }
  }

  if (isFixtureRepoRoot(dossier)) {
    return {
      relativePath: dossier.relativePath,
      currentName,
      proposedName: currentName,
      purpose: "Embedded sample repository root kept in its original form.",
      directives: [],
      confidence: 0.97,
      decision: "keep",
      reasoning:
        "This directory looks like the root of a sample repo stored under a fixture container and should remain representative of an ordinary input repo.",
      riskFlags: ["fixture-repo-root"],
    };
  }

  if (basePurpose === "src") {
    return {
      relativePath: dossier.relativePath,
      currentName,
      proposedName: currentName,
      purpose: "Primary source root for the repository.",
      directives: [],
      confidence: 0.96,
      decision: "keep",
      reasoning: "The current directory name is a stable source-root convention and does not benefit from Princess directives.",
      riskFlags: ["already-strong"],
    };
  }

  if (basePurpose === "fixtures") {
    return finalizeProposal(
      dossier,
      {
        proposedName: buildPrincessName("fixtures", ["sample-repos"]),
        purpose: "Sample repositories and test fixtures used to exercise Princess.",
        directives: ["sample-repos"],
        confidence: 0.91,
        reasoning:
          "The directory acts as a container for sample repos and verification fixtures rather than a generic test-only folder.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (basePurpose === "examples") {
    return finalizeProposal(
      dossier,
      {
        proposedName: buildPrincessName("examples", ["reference-output"]),
        purpose: "Reference payloads and example Princess outputs.",
        directives: ["reference-output"],
        confidence: 0.9,
        reasoning:
          "The directory contains example artifacts rather than executable source or tests.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (basePurpose === "schemas") {
    return finalizeProposal(
      dossier,
      {
        proposedName: buildPrincessName("schemas", ["json-contracts"]),
        purpose: "JSON schemas and machine-readable contract definitions.",
        directives: ["json-contracts"],
        confidence: 0.94,
        reasoning:
          "The directory holds validation schemas that define external or internal data contracts.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (basePurpose === "docs") {
    return finalizeProposal(
      dossier,
      {
        proposedName: buildPrincessName("docs", ["product-spec"]),
        purpose: "Product, prompt, and workflow documentation for Princess.",
        directives: ["product-spec"],
        confidence: 0.82,
        reasoning:
          "The directory is documentation-oriented and the directive clarifies that it is design/spec material rather than generic docs.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isGeneratedDirectory(basePurpose, dossier)) {
    return {
      relativePath: dossier.relativePath,
      currentName,
      proposedName: "generated",
      purpose: "Generated output that should not be hand-renamed.",
      directives: ["generated"],
      confidence: 0.98,
      decision: "ignore",
      reasoning: "The directory name or file contents indicate generated output.",
      riskFlags: ["generated-path"],
    };
  }

  if (isTestDirectory(basePurpose, dossier)) {
    const currentIsStrong = normalizedName === "tests";
    const proposedName = currentIsStrong
      ? currentName
      : buildPrincessName("tests", ["test-only"]);

    return finalizeProposal(
      dossier,
      {
        proposedName,
        purpose: "Test-only files and fixtures.",
        directives: currentIsStrong ? [] : ["test-only"],
        confidence: currentIsStrong ? 0.95 : 0.93,
        reasoning: currentIsStrong
          ? "The current directory name already communicates a dedicated test location."
          : "The directory is dominated by test signals and benefits from a normalized test-only name.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isHooksDirectory(basePurpose, dossier)) {
    const hasReact = hasHint(dossier, "react");
    const proposedName = buildPrincessName(
      "hooks",
      hasReact ? ["react-state"] : [],
    );

    return finalizeProposal(
      dossier,
      {
        proposedName,
        purpose: hasReact
          ? "React hooks and stateful shared logic."
          : "Shared hooks or composables.",
        directives: hasReact ? ["react-state"] : [],
        confidence: hasReact ? 0.87 : 0.8,
        reasoning: "Hook-like naming and source patterns indicate shared stateful helper code.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isComponentsDirectory(basePurpose, dossier)) {
    const directives = ["shared-ui"];
    const proposedName = buildPrincessName("components", directives);

    return finalizeProposal(
      dossier,
      {
        proposedName,
        purpose: "Shared UI components and presentational building blocks.",
        directives,
        confidence: 0.83,
        reasoning:
          "The folder contains reusable component-shaped files and benefits from a clearer UI-oriented name.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isTypesDirectory(basePurpose, dossier)) {
    const proposedName = buildPrincessName("types", ["domain-types"]);

    return finalizeProposal(
      dossier,
      {
        proposedName,
        purpose: "Shared domain interfaces and type definitions.",
        directives: ["domain-types"],
        confidence: 0.89,
        reasoning:
          "The directory is dominated by type-oriented files and benefits from clearer domain intent.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isRoutesDirectory(basePurpose, dossier)) {
    const directives = inferRouteDirectives(dossier);
    const proposedName = buildPrincessName("routes", directives);
    const confidence = directives.length > 0 ? 0.8 : 0.76;

    if (confidence < thresholds.minConfidence) {
      riskFlags.push("ambiguous-routes");
    }

    return finalizeProposal(
      dossier,
      {
        proposedName,
        purpose: "Application route entries and route-bound screens.",
        directives,
        confidence,
        reasoning:
          "Route file names or directory conventions indicate an application routing surface.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isUtilityDirectory(basePurpose, dossier)) {
    const directives =
      extCounts[".ts"] || extCounts[".tsx"] || extCounts[".js"] || extCounts[".jsx"]
        ? ["pure-ts"]
        : [];
    const proposedName = buildPrincessName("lib", directives);

    return finalizeProposal(
      dossier,
      {
        proposedName,
        purpose: "Shared framework-light library code and helpers.",
        directives,
        confidence: hasHint(dossier, "no-react-imports") ? 0.88 : 0.8,
        reasoning:
          "The directory reads like shared utility code with little or no UI framework coupling.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isAssetDirectory(basePurpose, extCounts)) {
    return finalizeProposal(
      dossier,
      {
        proposedName: buildPrincessName("assets", ["content"]),
        purpose: "Static assets and content files.",
        directives: ["content"],
        confidence: 0.79,
        reasoning: "The directory looks like a static asset container.",
        riskFlags,
      },
      thresholds,
    );
  }

  if (isDocsDirectory(basePurpose, extCounts)) {
    return finalizeProposal(
      dossier,
      {
        proposedName: buildPrincessName("docs", ["content"]),
        purpose: "Documentation and narrative project content.",
        directives: ["content"],
        confidence: 0.74,
        reasoning: "The directory appears documentation-oriented, but the current name may already be sufficient.",
        riskFlags: ["low-confidence"],
      },
      thresholds,
    );
  }

  return {
    relativePath: dossier.relativePath,
    currentName,
    proposedName: currentName,
    purpose: inferFallbackPurpose(representativeFiles),
    directives: [],
    confidence: 0.45,
    decision: "keep",
    reasoning: "The heuristic engine could not infer a materially better normalized name with enough confidence.",
    riskFlags: ["ambiguous-purpose"],
  };
}

function finalizeProposal(
  dossier: FolderDossier,
  candidate: {
    proposedName: string;
    purpose: string;
    directives: string[];
    confidence: number;
    reasoning: string;
    riskFlags: string[];
  },
  thresholds: ModelThresholds,
): RenameProposal {
  const validation = validatePrincessName(candidate.proposedName);
  const currentName = dossier.currentName;

  if (!validation.valid) {
    return {
      relativePath: dossier.relativePath,
      currentName,
      proposedName: currentName,
      purpose: candidate.purpose,
      directives: [],
      confidence: 0.2,
      decision: "keep",
      reasoning: `Candidate name was rejected by Princess validation: ${validation.errors.join(" ")}`,
      riskFlags: [...candidate.riskFlags, "invalid-candidate"],
    };
  }

  if (candidate.proposedName === currentName) {
    return {
      relativePath: dossier.relativePath,
      currentName,
      proposedName: currentName,
      purpose: candidate.purpose,
      directives: candidate.directives,
      confidence: Math.max(candidate.confidence, thresholds.minConfidence),
      decision: "keep",
      reasoning: candidate.reasoning,
      riskFlags: [...candidate.riskFlags, "already-strong"],
    };
  }

  if (candidate.confidence < thresholds.minConfidence) {
    return {
      relativePath: dossier.relativePath,
      currentName,
      proposedName: currentName,
      purpose: candidate.purpose,
      directives: candidate.directives,
      confidence: candidate.confidence,
      decision: "keep",
      reasoning: `${candidate.reasoning} Confidence did not clear the rename threshold.`,
      riskFlags: [...candidate.riskFlags, "low-confidence"],
    };
  }

  return {
    relativePath: dossier.relativePath,
    currentName,
    proposedName: candidate.proposedName,
    purpose: candidate.purpose,
    directives: candidate.directives,
    confidence: candidate.confidence,
    decision: "rename",
    reasoning: candidate.reasoning,
    riskFlags: candidate.riskFlags,
  };
}

function hasHint(dossier: FolderDossier, hint: string): boolean {
  return dossier.frameworkHints.includes(hint);
}

function isGeneratedDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName.includes("generated") ||
    normalizedName.includes("codegen") ||
    (dossier.frameworkHints.includes("generated-content") &&
      dossier.representativeFiles.some((fileName) => /generated|codegen/i.test(fileName)))
  );
}

function isTestDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName === "tests" ||
    normalizedName === "test" ||
    normalizedName === "spec" ||
    normalizedName === "__tests__" ||
    normalizedName.endsWith("-tests") ||
    dossier.testHints.length > 0
  );
}

function isHooksDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName.includes("hook") ||
    normalizedName.includes("composable") ||
    dossier.representativeFiles.some((fileName) => /^use[A-Z].+/.test(fileName))
  );
}

function isComponentsDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName === "components" ||
    normalizedName === "component" ||
    normalizedName === "ui" ||
    dossier.representativeFiles.some((fileName) => /^[A-Z][A-Za-z0-9]+\.(jsx|tsx)$/.test(fileName))
  );
}

function isUtilityDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName === "lib" ||
    normalizedName === "utils" ||
    normalizedName === "helpers" ||
    normalizedName === "core"
  );
}

function isTypesDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName === "types" ||
    normalizedName === "interfaces" ||
    normalizedName === "models"
  );
}

function isRoutesDirectory(normalizedName: string, dossier: FolderDossier): boolean {
  return (
    normalizedName === "pages" ||
    normalizedName === "routes" ||
    normalizedName === "app" ||
    dossier.frameworkHints.includes("route-files")
  );
}

function inferRouteDirectives(dossier: FolderDossier): string[] {
  const joinedChildren = dossier.childDirectories.join(" ").toLowerCase();

  if (/\blogin\b|\bregister\b|\bsignin\b|\bsign-up\b/.test(joinedChildren)) {
    return ["public-routes"];
  }

  if (/\bdashboard\b|\bsettings\b|\baccount\b|\badmin\b/.test(joinedChildren)) {
    return ["auth-required"];
  }

  return [];
}

function isAssetDirectory(
  normalizedName: string,
  extensionCounts: Record<string, number>,
): boolean {
  return (
    normalizedName === "assets" ||
    normalizedName === "images" ||
    normalizedName === "public" ||
    Boolean(extensionCounts[".png"] || extensionCounts[".jpg"] || extensionCounts[".svg"])
  );
}

function isDocsDirectory(
  normalizedName: string,
  extensionCounts: Record<string, number>,
): boolean {
  return (
    normalizedName === "docs" ||
    normalizedName === "notes" ||
    normalizedName === "research" ||
    Boolean(extensionCounts[".md"] || extensionCounts[".mdx"])
  );
}

function inferFallbackPurpose(representativeFiles: string[]): string {
  if (representativeFiles.length === 0) {
    return "Unclassified directory.";
  }

  return `Unclassified directory containing files such as ${representativeFiles.slice(0, 2).join(", ")}.`;
}

function normalizeFolderName(name: string): string {
  return name.toLowerCase().replace(/^[_\-.]+|[_\-.]+$/g, "");
}

function isFixtureRepoRoot(dossier: FolderDossier): boolean {
  const parentBase = dossier.parentPath
    .split("/")
    .pop()
    ?.split("--", 1)[0];

  if (parentBase !== "fixtures") {
    return false;
  }

  const representativeSet = new Set(dossier.representativeFiles);
  const childSet = new Set(dossier.childDirectories);

  return (
    representativeSet.has("package.json") &&
    childSet.has("src") &&
    (childSet.has("tests") || childSet.has("test"))
  );
}
