export const MAX_PRINCESS_SEGMENTS = 4;
export const MAX_PRINCESS_NAME_LENGTH = 56;

const SEGMENT_PATTERN = /^[a-z0-9-]+$/;

export interface NameValidationResult {
  valid: boolean;
  errors: string[];
}

export function slugifySegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildPrincessName(
  purpose: string,
  directives: string[] = [],
): string {
  const purposeSegment = slugifySegment(purpose);
  const directiveSegments = directives
    .map(slugifySegment)
    .filter(Boolean)
    .slice(0, MAX_PRINCESS_SEGMENTS - 1);

  return [purposeSegment, ...directiveSegments].filter(Boolean).join("--");
}

export function validatePrincessName(name: string): NameValidationResult {
  const errors: string[] = [];
  const segments = name.split("--");

  if (!name) {
    errors.push("Name must not be empty.");
  }

  if (name.length > MAX_PRINCESS_NAME_LENGTH) {
    errors.push(
      `Name must be ${MAX_PRINCESS_NAME_LENGTH} characters or fewer.`,
    );
  }

  if (segments.length > MAX_PRINCESS_SEGMENTS) {
    errors.push(`Name must have at most ${MAX_PRINCESS_SEGMENTS} segments.`);
  }

  for (const segment of segments) {
    if (!segment) {
      errors.push("Name must not contain empty segments.");
      continue;
    }

    if (!SEGMENT_PATTERN.test(segment)) {
      errors.push(
        "Each segment must contain only lowercase ASCII letters, numbers, or single hyphens.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

