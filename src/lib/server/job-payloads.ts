import type {
  CharacterRecord,
  GenerationInput,
  JobRecord,
  LoraVersionRecord,
  PromptProfileRecord
} from "../domain";

export function buildBootstrapPayload({
  character,
  promptProfile,
  job,
  targetCount,
  seeds,
  webhookSecret
}: {
  character: CharacterRecord;
  promptProfile: PromptProfileRecord;
  job: JobRecord;
  targetCount: number;
  seeds: number[];
  webhookSecret: string;
}): Record<string, unknown> {
  return {
    type: "bootstrap",
    character: {
      id: character.id,
      slug: character.slug,
      name: character.name,
      tagline: character.tagline,
      summary: character.summary,
      identityTraits: character.identityTraits,
      outfitNotes: character.outfitNotes
    },
    promptProfile: {
      label: promptProfile.label,
      promptTemplate: promptProfile.promptTemplate,
      negativePrompt: promptProfile.negativePrompt,
      styleTokens: promptProfile.styleTokens
    },
    outputPrefix: job.outputPrefix,
    targetCount,
    seeds,
    callback: {
      internalJobId: job.id,
      webhookSecret
    }
  };
}

export function buildTrainingPayload({
  character,
  version,
  approvedKeys,
  webhookSecret,
  hyperparameters
}: {
  character: CharacterRecord;
  version: LoraVersionRecord;
  approvedKeys: string[];
  webhookSecret: string;
  hyperparameters: {
    rank: number;
    learningRate: number;
    steps: number;
  };
}): Record<string, unknown> {
  return {
    type: "train_lora",
    characterId: character.id,
    characterSlug: character.slug,
    loraVersionId: version.id,
    baseModelId: version.baseModelId,
    instancePrompt: [
      "adult original character",
      character.name,
      ...character.identityTraits,
      ...character.styleTokens.slice(0, 3)
    ]
      .filter(Boolean)
      .join(", "),
    approvedR2Keys: approvedKeys,
    outputPath: version.artifactR2Key,
    hyperparameters,
    callback: {
      internalJobId: version.jobId,
      webhookSecret
    }
  };
}

export function buildGenerationPayload({
  character,
  version,
  input,
  job,
  webhookSecret
}: {
  character: CharacterRecord;
  version: LoraVersionRecord;
  input: GenerationInput;
  job: JobRecord;
  webhookSecret: string;
}): Record<string, unknown> {
  return {
    type: "generate",
    characterId: character.id,
    characterSlug: character.slug,
    loraVersionId: version.id,
    baseModelId: version.baseModelId,
    loraArtifactKey: version.artifactR2Key,
    promptTemplate: input.promptTemplate,
    negativePrompt: input.negativePrompt,
    styleTokens: character.styleTokens,
    seeds: input.seeds,
    aspectRatio: input.aspectRatio,
    imageCount: input.imageCount,
    outputPrefix: job.outputPrefix,
    callback: {
      internalJobId: job.id,
      webhookSecret
    }
  };
}
