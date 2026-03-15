import { describe, expect, it } from "vitest";
import { generateCharacterPrompt } from "../src/lib/server/gemini";

describe("generateCharacterPrompt", () => {
  it("normalizes Gemini JSON output into prompt fields", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      tagline: "Velvet nightclub singer",
                      summary: "An adult original character with a precise gaze and tailored styling.",
                      identityTraits: ["auburn bob", "sharp eyeliner", "beauty mark", "calm stare"],
                      styleTokens: ["editorial", "moody light", "velvet dress", "cinematic"],
                      negativeTokens: ["minor", "explicit nudity", "celebrity", "franchise character"],
                      promptTemplate:
                        "adult original woman, auburn bob, sharp eyeliner, velvet dress, cinematic editorial portrait, confident pose",
                      negativePrompt:
                        "explicit sexual act, visible genitals, minor, celebrity, franchise character, extra limbs"
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ) as Promise<Response>;

    await expect(
      generateCharacterPrompt(
        { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-3-flash-preview" },
        {
          name: "Mara Vale",
          tagline: "",
          summary: "Nightclub singer with elegant posture.",
          adultAgeYears: 24,
          identityTraits: [],
          styleTokens: [],
          negativeTokens: [],
          outfitNotes: "Velvet dress.",
          promptTemplate: "",
          negativePrompt: ""
        }
      )
    ).resolves.toMatchObject({
      tagline: "Velvet nightclub singer",
      identityTraits: ["auburn bob", "sharp eyeliner", "beauty mark", "calm stare"]
    });

    globalThis.fetch = originalFetch;
  });
});
