import type { CharacterInput, GenerationInput } from "../domain";

const EXPLICIT_PATTERNS = [
  /\b(sex|intercourse|penetrat(?:e|ion)|cumshot|fellatio|blowjob|handjob)\b/i,
  /\b(genitals?|nipples? out|spread legs|fully nude)\b/i,
  /\b(rape|coercion|non-consensual|incest|bestiality)\b/i
];

const YOUTH_PATTERNS = [
  /\b(minor|underage|teen|teenage|school ?girl|school ?boy|loli|childlike)\b/i,
  /\b(youthful body|petite school uniform)\b/i
];

const REAL_PERSON_PATTERNS = [
  /\b(celebrity|real person|photoreal likeness|look like)\b/i,
  /\b(actor|actress|influencer|idol)\b/i
];

const COPYRIGHT_PATTERNS = [
  /\b(disney|marvel|dc comics|pokemon|dragon ball|naruto|one piece)\b/i,
  /\b(goku|elsa|harley quinn|princess zelda|sailor moon)\b/i
];

function collectViolations(parts: string[]): string[] {
  const text = parts.filter(Boolean).join(" \n ");
  const violations: string[] = [];

  if (EXPLICIT_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push("Explicit sexual content is not allowed.");
  }
  if (YOUTH_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push("Youthful or underage framing is not allowed.");
  }
  if (REAL_PERSON_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push("Real-person likeness requests are not allowed.");
  }
  if (COPYRIGHT_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push("Named third-party IP characters are not allowed.");
  }

  return violations;
}

export function validateCharacterInput(input: CharacterInput): string[] {
  const violations = collectViolations([
    input.name,
    input.tagline,
    input.summary,
    input.outfitNotes,
    input.promptTemplate,
    input.identityTraits.join(" "),
    input.styleTokens.join(" ")
  ]);

  if (input.adultAgeYears < 21) {
    violations.push("Characters must be explicitly adult and at least 21 years old.");
  }

  if (!input.identityTraits.length) {
    violations.push("At least one identity trait is required.");
  }

  return Array.from(new Set(violations));
}

export function validateGenerationInput(input: GenerationInput): string[] {
  return Array.from(
    new Set(
      collectViolations([input.promptTemplate]).concat(
        input.imageCount < 1 || input.imageCount > 8
          ? ["Image count must be between 1 and 8."]
          : []
      )
    )
  );
}

export function splitTokenList(value: string | FormDataEntryValue | null | undefined): string[] {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
