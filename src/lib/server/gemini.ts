import type { CharacterInput } from "../domain";
import { requireGeminiConfig, type AppBindings } from "./config";
import { splitTokenList, validateCharacterInput } from "./content-policy";

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface CharacterPromptSuggestion {
  tagline: string;
  summary: string;
  identityTraits: string[];
  styleTokens: string[];
  negativeTokens: string[];
  promptTemplate: string;
  negativePrompt: string;
}

type CharacterPromptSeed = Pick<
  CharacterInput,
  | "name"
  | "tagline"
  | "summary"
  | "adultAgeYears"
  | "identityTraits"
  | "styleTokens"
  | "negativeTokens"
  | "outfitNotes"
  | "promptTemplate"
  | "negativePrompt"
>;

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return splitTokenList(String(value ?? ""));
}

function extractText(payload: GeminiResponse): string {
  return payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("\n")
    .trim() ?? "";
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

function normalizeSuggestion(raw: Record<string, unknown>): CharacterPromptSuggestion {
  return {
    tagline: String(raw.tagline ?? "").trim(),
    summary: String(raw.summary ?? "").trim(),
    identityTraits: asStringArray(raw.identityTraits),
    styleTokens: asStringArray(raw.styleTokens),
    negativeTokens: asStringArray(raw.negativeTokens),
    promptTemplate: String(raw.promptTemplate ?? "").trim(),
    negativePrompt: String(raw.negativePrompt ?? "").trim()
  };
}

function buildPrompt(seed: CharacterPromptSeed): string {
  return [
    "You are writing reusable image-generation prompt packs for a private original-character workflow.",
    "Return only valid JSON with these keys:",
    'tagline, summary, identityTraits, styleTokens, negativeTokens, promptTemplate, negativePrompt',
    "Rules:",
    "- The character must be an original adult age 21+.",
    "- No explicit sex acts, visible genitals, incest, coercion, bestiality, minors, school-age framing, celebrities, real people, or named franchise characters.",
    "- Keep the tone suggestive or editorial if needed, but not explicit.",
    "- Make promptTemplate concise, practical, and reusable for image generation.",
    "- Make negativePrompt concise and safety-aware.",
    "- identityTraits, styleTokens, and negativeTokens must each contain 4 to 8 short strings.",
    "",
    "Current input:",
    JSON.stringify(
      {
        name: seed.name,
        tagline: seed.tagline,
        summary: seed.summary,
        adultAgeYears: seed.adultAgeYears,
        identityTraits: seed.identityTraits,
        styleTokens: seed.styleTokens,
        negativeTokens: seed.negativeTokens,
        outfitNotes: seed.outfitNotes,
        promptTemplate: seed.promptTemplate,
        negativePrompt: seed.negativePrompt
      },
      null,
      2
    )
  ].join("\n");
}

export async function generateCharacterPrompt(
  env: AppBindings,
  seed: CharacterPromptSeed
): Promise<CharacterPromptSuggestion> {
  const config = requireGeminiConfig(env);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(seed) }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini request failed.");
  }

  const text = extractText(payload);
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  const suggestion = normalizeSuggestion(parsed);
  const issues = validateCharacterInput({
    name: seed.name || "Untitled character",
    tagline: suggestion.tagline,
    summary: suggestion.summary,
    adultAgeYears: seed.adultAgeYears,
    identityTraits: suggestion.identityTraits,
    styleTokens: suggestion.styleTokens,
    negativeTokens: suggestion.negativeTokens,
    outfitNotes: seed.outfitNotes,
    promptTemplate: suggestion.promptTemplate,
    negativePrompt: suggestion.negativePrompt
  });

  if (issues.length) {
    throw new Error(`Gemini suggestion failed validation: ${issues.join(" ")}`);
  }

  return suggestion;
}
