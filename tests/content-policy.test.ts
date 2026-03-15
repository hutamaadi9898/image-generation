import { describe, expect, it } from "vitest";
import { validateCharacterInput, validateGenerationInput } from "../src/lib/server/content-policy";

describe("content policy", () => {
  it("accepts a compliant adult character spec", () => {
    const issues = validateCharacterInput({
      name: "Mara Vale",
      tagline: "Noir club vocalist",
      summary: "Adult lounge singer with sharp eyeliner and a theatrical silhouette.",
      adultAgeYears: 24,
      identityTraits: ["auburn bob", "beauty mark"],
      styleTokens: ["editorial pin-up", "velvet haze"],
      negativeTokens: ["underage", "explicit nudity"],
      outfitNotes: "Velvet gown with long gloves.",
      promptTemplate: "adult original character, polished illustration, pin-up pose",
      negativePrompt: "explicit sex act, underage, celebrity"
    });

    expect(issues).toEqual([]);
  });

  it("blocks explicit and underage cues", () => {
    const issues = validateCharacterInput({
      name: "Teen idol clone",
      tagline: "Schoolgirl fantasy",
      summary: "Petite school uniform and childlike body proportions.",
      adultAgeYears: 18,
      identityTraits: ["youthful body"],
      styleTokens: ["anime"],
      negativeTokens: [],
      outfitNotes: "School blazer.",
      promptTemplate: "school girl, explicit sex",
      negativePrompt: ""
    });

    expect(issues).toContain("Youthful or underage framing is not allowed.");
    expect(issues).toContain("Explicit sexual content is not allowed.");
    expect(issues).toContain("Characters must be explicitly adult and at least 21 years old.");
  });

  it("rejects invalid generation requests", () => {
    const issues = validateGenerationInput({
      characterId: "char_1",
      loraVersionId: "lora_1",
      promptTemplate: "celebrity look like scene",
      negativePrompt: "",
      aspectRatio: "3:4",
      imageCount: 12,
      seeds: [11, 22]
    });

    expect(issues).toContain("Real-person likeness requests are not allowed.");
    expect(issues).toContain("Image count must be between 1 and 8.");
  });
});
