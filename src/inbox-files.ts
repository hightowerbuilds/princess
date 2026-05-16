import path from "node:path";
import { AGENT_LETTER_FILENAME } from "./default-prompts.ts";

const PROMPT_FILE_EXTENSIONS = new Set([".md", ".html"]);
const IMAGE_ASSET_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const TABLE_DATA_EXTENSIONS = new Set([".csv", ".tsv"]);

export function isPromptFile(name: string): boolean {
  return PROMPT_FILE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export function isImageAssetFile(name: string): boolean {
  return IMAGE_ASSET_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export function isTableDataFile(name: string): boolean {
  return TABLE_DATA_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export function isVisibleInboxFile(name: string): boolean {
  return isPromptFile(name) || isImageAssetFile(name) || isTableDataFile(name);
}

export interface SortableInboxEntry {
  name: string;
  isDirectory: boolean;
}

export function compareInboxEntriesForDisplay(
  currentSub: string,
  a: SortableInboxEntry,
  b: SortableInboxEntry,
): number {
  if (currentSub === "") {
    const aIsAgentLetter = a.name === AGENT_LETTER_FILENAME;
    const bIsAgentLetter = b.name === AGENT_LETTER_FILENAME;
    if (aIsAgentLetter && !bIsAgentLetter) return -1;
    if (!aIsAgentLetter && bIsAgentLetter) return 1;
  }
  if (a.isDirectory && !b.isDirectory) return -1;
  if (!a.isDirectory && b.isDirectory) return 1;
  return a.name.localeCompare(b.name);
}
