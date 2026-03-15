import { describe, expect, it } from "vitest";
import {
  buildBootstrapPromptText,
  buildComfyUiRequest,
  buildGenerationPromptText,
  buildTrainingPayload,
  dimensionsForAspectRatio,
  expandSeeds
} from "../src/lib/server/job-payloads";
import type { CharacterRecord, GenerationInput, LoraVersionRecord, PromptProfileRecord } from "../src/lib/domain";

const character: CharacterRecord = {
  id: "char_1",
  slug: "mara-vale",
  name: "Mara Vale",
  tagline: "Noir lounge singer",
  summary: "Adult editorial performer.",
  adultAgeYears: 25,
  identityTraits: ["auburn bob", "arched brows"],
  styleTokens: ["editorial pin-up"],
  negativeTokens: ["underage"],
  outfitNotes: "Velvet gloves.",
  status: "ready",
  latestLoraVersionId: "lora_1",
  createdAt: "2026-03-15T00:00:00.000Z",
  updatedAt: "2026-03-15T00:00:00.000Z"
};

const promptProfile: PromptProfileRecord = {
  id: "profile_1",
  characterId: "char_1",
  label: "Default",
  promptTemplate: "adult original character, cinematic rim light",
  negativePrompt: "underage, explicit sex",
  styleTokens: ["editorial pin-up"],
  createdAt: "2026-03-15T00:00:00.000Z",
  updatedAt: "2026-03-15T00:00:00.000Z"
};

const version: LoraVersionRecord = {
  id: "lora_1",
  characterId: "char_1",
  versionNumber: 3,
  jobId: "job_train",
  baseModelId: "stabilityai/stable-diffusion-xl-base-1.0",
  artifactR2Key: "mara-vale/v3/mara-vale-v3.safetensors",
  metadataJson: "{}",
  status: "ready",
  createdAt: "2026-03-15T00:00:00.000Z",
  completedAt: "2026-03-15T02:00:00.000Z"
};

const generationInput: GenerationInput = {
  characterId: "char_1",
  loraVersionId: "lora_1",
  promptTemplate: "adult original character, satin gloves",
  negativePrompt: "underage",
  aspectRatio: "3:4",
  imageCount: 2,
  seeds: [11, 22]
};

describe("job payload builders", () => {
  it("builds bootstrap prompt text from the character record", () => {
    const result = buildBootstrapPromptText(character, promptProfile);

    expect(result.prompt).toContain("Mara Vale");
    expect(result.prompt).toContain("Velvet gloves.");
    expect(result.negativePrompt).toContain("underage, explicit sex");
    expect(result.negativePrompt).toContain("watermark");
  });

  it("builds generation prompt text with style and negative tokens", () => {
    const result = buildGenerationPromptText(character, generationInput);

    expect(result.prompt).toContain("satin gloves");
    expect(result.prompt).toContain("editorial pin-up");
    expect(result.negativePrompt).toContain("underage");
    expect(result.negativePrompt).toContain("watermark");
  });

  it("builds comfyui requests with optional lora nodes", () => {
    const workflow = buildComfyUiRequest({
      checkpointFilename: "pony.safetensors",
      positivePrompt: "masterpiece",
      negativePrompt: "bad hands",
      seed: 42,
      width: 1024,
      height: 1344,
      filenamePrefix: "mara_42",
      loraFilename: "mara-vale-v3.safetensors"
    }) as Record<string, { inputs?: Record<string, unknown> }>;

    expect(workflow["4"]?.inputs?.ckpt_name).toBe("pony.safetensors");
    expect(workflow["10"]?.inputs?.lora_name).toBe("mara-vale-v3.safetensors");
    expect(workflow["5"]?.inputs?.width).toBe(1024);
  });

  it("builds training payloads with approved keys", () => {
    const payload = buildTrainingPayload({
      character,
      version,
      approvedKeys: ["mara-vale/dataset/ref_1.png", "mara-vale/dataset/ref_2.png"],
      hyperparameters: {
        rank: 16,
        learningRate: 0.0001,
        steps: 1200
      }
    });

    expect(payload.type).toBe("train_lora");
    expect(payload.outputPath).toBe("mara-vale/v3/mara-vale-v3.safetensors");
    expect(payload.hyperparameters).toMatchObject({ rank: 16, steps: 1200 });
    expect(payload.instancePrompt).toContain("Mara Vale");
  });

  it("expands seeds and maps aspect ratios deterministically", () => {
    expect(expandSeeds([101, 202], 5)).toEqual([101, 202, 100104, 100205, 200107]);
    expect(dimensionsForAspectRatio("1:1")).toEqual({ width: 1024, height: 1024 });
    expect(dimensionsForAspectRatio("3:4")).toEqual({ width: 1024, height: 1344 });
  });
});
