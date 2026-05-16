export function summarizeFeature(name: string, risk: "low" | "medium" | "high"): string {
  return `${name}: ${risk}`;
}
