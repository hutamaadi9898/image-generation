import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { splitTokenList } from "../../../lib/server/content-policy";
import { badRequest, json } from "../../../lib/server/http";
import { generateCharacterPrompt } from "../../../lib/server/gemini";
import { asInteger, asString, readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const payload = await readRequestPayload(request);
  const input = {
    name: asString(payload.name),
    tagline: asString(payload.tagline),
    summary: asString(payload.summary),
    adultAgeYears: asInteger(payload.adultAgeYears, 21),
    identityTraits: splitTokenList(asString(payload.identityTraits)),
    styleTokens: splitTokenList(asString(payload.styleTokens)),
    negativeTokens: splitTokenList(asString(payload.negativeTokens)),
    outfitNotes: asString(payload.outfitNotes),
    promptTemplate: asString(payload.promptTemplate),
    negativePrompt: asString(payload.negativePrompt)
  };

  if (!input.name && !input.summary && !input.tagline) {
    return badRequest("Add at least a name, tagline, or summary before asking Gemini.");
  }

  if (input.adultAgeYears < 21) {
    return badRequest("Characters must be explicitly adult and at least 21 years old.");
  }

  try {
    const suggestion = await generateCharacterPrompt(env, input);
    return json({ ok: true, suggestion });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gemini prompt generation failed.";
    const status = /not configured/i.test(message) ? 503 : 500;
    return json({ ok: false, message }, { status });
  }
};
