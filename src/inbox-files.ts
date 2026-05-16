import path from "node:path";

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
