import { describe, expect, it } from "vitest";
import { buildBootstrapPayload, buildGenerationPayload, buildTrainingPayload } from "../src/lib/server/job-payloads";
import type { CharacterRecord, JobRecord, LoraVersionRecord, PromptProfileRecord } from "../src/lib/domain";

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
  artifactR2Key: "mara-vale/v3/lora.safetensors",
  metadataJson: "{}",
  status: "ready",
  createdAt: "2026-03-15T00:00:00.000Z",
  completedAt: "2026-03-15T02:00:00.000Z"
};

const job: JobRecord = {
  id: "job_generate",
  characterId: "char_1",
  loraVersionId: "lora_1",
  type: "generate",
  status: "queued",
  runpodEndpointId: "endpoint",
  runpodJobId: "rp_1",
  promptTemplate: "adult original character",
  negativePrompt: "underage",
  seedValues: [11, 22],
  aspectRatio: "3:4",
  imageCount: 2,
  outputPrefix: "mara-vale/generations/job_generate",
  errorMessage: null,
  submittedAt: "2026-03-15T00:00:00.000Z",
  updatedAt: "2026-03-15T00:00:00.000Z",
  completedAt: null
};

describe("job payload builders", () => {
  it("builds bootstrap payloads with the character spec and seeds", () => {
    const payload = buildBootstrapPayload({
      character,
      promptProfile,
      job,
      targetCount: 96,
      seeds: [101, 202],
      webhookSecret: "secret"
    });

    expect(payload.type).toBe("bootstrap");
    expect(payload.targetCount).toBe(96);
    expect(payload.character).toMatchObject({ id: "char_1", slug: "mara-vale" });
    expect(payload.promptProfile).toMatchObject({ label: "Default" });
    expect(payload.outputPrefix).toBe("mara-vale/generations/job_generate");
    expect(payload.callback).toMatchObject({ internalJobId: "job_generate", webhookSecret: "secret" });
  });

  it("builds training payloads with approved keys and callback data", () => {
    const payload = buildTrainingPayload({
      character,
      version,
      approvedKeys: ["mara-vale/dataset/ref_1.png", "mara-vale/dataset/ref_2.png"],
      webhookSecret: "secret",
      hyperparameters: {
        rank: 16,
        learningRate: 0.0001,
        steps: 1200
      }
    });

    expect(payload.type).toBe("train_lora");
    expect(payload.outputPath).toBe("mara-vale/v3/lora.safetensors");
    expect(payload.hyperparameters).toMatchObject({ rank: 16, steps: 1200 });
    expect(payload.callback).toMatchObject({ internalJobId: "job_train", webhookSecret: "secret" });
    expect(payload.instancePrompt).toContain("Mara Vale");
  });

  it("builds generation payloads with output prefixes and seeds", () => {
    const payload = buildGenerationPayload({
      character,
      version,
      job,
      webhookSecret: "secret",
      input: {
        characterId: "char_1",
        loraVersionId: "lora_1",
        promptTemplate: "adult original character, satin gloves",
        negativePrompt: "underage",
        aspectRatio: "3:4",
        imageCount: 2,
        seeds: [11, 22]
      }
    });

    expect(payload.loraArtifactKey).toBe("mara-vale/v3/lora.safetensors");
    expect(payload.outputPrefix).toBe("mara-vale/generations/job_generate");
    expect(payload.seeds).toEqual([11, 22]);
    expect(payload.callback).toMatchObject({ internalJobId: "job_generate", webhookSecret: "secret" });
    expect(payload.baseModelId).toBe("stabilityai/stable-diffusion-xl-base-1.0");
  });
});
