import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { validateCharacterInput, splitTokenList } from "../../../lib/server/content-policy";
import { badRequest, created, json } from "../../../lib/server/http";
import { createRepository } from "../../../lib/server/repository";
import { asInteger, asString, readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const repository = createRepository(env);
  if (!repository) {
    return json({ ok: false, message: "D1 is not configured." }, { status: 503 });
  }

  const payload = await readRequestPayload(request);
  const input = {
    name: asString(payload.name),
    tagline: asString(payload.tagline),
    summary: asString(payload.summary),
    adultAgeYears: asInteger(payload.adultAgeYears, 21),
    identityTraits: splitTokenList(payload.identityTraits),
    styleTokens: splitTokenList(payload.styleTokens),
    negativeTokens: splitTokenList(payload.negativeTokens),
    outfitNotes: asString(payload.outfitNotes),
    promptTemplate: asString(payload.promptTemplate),
    negativePrompt: asString(payload.negativePrompt)
  };

  const issues = validateCharacterInput(input);
  if (!input.name || !input.summary || !input.promptTemplate || issues.length) {
    return badRequest("Character input failed validation.", issues);
  }

  try {
    const character = await repository.createCharacter(input);
    return created({ ok: true, character });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Character creation failed."
      },
      { status: 500 }
    );
  }
};
