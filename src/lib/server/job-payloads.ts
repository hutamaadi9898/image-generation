import type {
  CharacterRecord,
  GenerationInput,
  JobRecord,
  LoraVersionRecord,
  PromptProfileRecord
} from "../domain";
import { buildBootstrapOutputPrefix } from "./paths";

const DIMENSIONS = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 1024, height: 1344 },
  "16:9": { width: 1344, height: 768 }
} as const;

export function collapsePromptParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part ?? "").trim()).filter(Boolean).join(", ");
}

export function expandSeeds(seeds: number[], targetCount: number): number[] {
  const source = seeds.length ? seeds : [Math.floor(Math.random() * 1_000_000)];
  return Array.from({ length: targetCount }, (_, index) => {
    const base = source[index % source.length] ?? 0;
    const offset = Math.floor(index / source.length) * 100_003;
    return base + offset;
  });
}

export function dimensionsForAspectRatio(aspectRatio: string | null | undefined): {
  width: number;
  height: number;
} {
  return DIMENSIONS[(aspectRatio ?? "3:4") as keyof typeof DIMENSIONS] ?? DIMENSIONS["3:4"];
}

export function buildBootstrapPromptText(
  character: CharacterRecord,
  promptProfile: PromptProfileRecord
): { prompt: string; negativePrompt: string } {
  return {
    prompt: collapsePromptParts([
      promptProfile.promptTemplate,
      character.name,
      character.tagline,
      ...character.identityTraits,
      character.summary,
      character.outfitNotes,
      ...promptProfile.styleTokens
    ]),
    negativePrompt: collapsePromptParts([
      promptProfile.negativePrompt,
      "low quality",
      "blurry",
      "text",
      "watermark",
      "deformed",
      "extra limbs"
    ])
  };
}

export function buildGenerationPromptText(
  character: CharacterRecord,
  input: GenerationInput
): { prompt: string; negativePrompt: string } {
  return {
    prompt: collapsePromptParts([input.promptTemplate, ...character.styleTokens]),
    negativePrompt: collapsePromptParts([
      input.negativePrompt,
      ...character.negativeTokens,
      "low quality",
      "text",
      "watermark",
      "deformed"
    ])
  };
}

export function buildComfyUiRequest({
  checkpointFilename,
  positivePrompt,
  negativePrompt,
  seed,
  width,
  height,
  filenamePrefix,
  loraFilename
}: {
  checkpointFilename: string;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  filenamePrefix: string;
  loraFilename?: string;
}): Record<string, unknown> {
  const modelNodeId = loraFilename ? "10" : "4";
  const clipNodeId = loraFilename ? "10" : "4";

  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        cfg: 7,
        denoise: 1,
        latent_image: ["5", 0],
        model: [modelNodeId, 0],
        negative: ["7", 0],
        positive: ["6", 0],
        sampler_name: "euler",
        scheduler: "normal",
        seed,
        steps: 28
      }
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: checkpointFilename
      }
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        batch_size: 1,
        height,
        width
      }
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: [clipNodeId, 1],
        text: positivePrompt
      }
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: [clipNodeId, 1],
        text: negativePrompt
      }
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2]
      }
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: filenamePrefix,
        images: ["8", 0]
      }
    },
    ...(loraFilename
      ? {
          "10": {
            class_type: "LoraLoader",
            inputs: {
              model: ["4", 0],
              clip: ["4", 1],
              lora_name: loraFilename,
              strength_model: 0.9,
              strength_clip: 0.9
            }
          }
        }
      : {})
  };
}

export function buildTrainingPayload({
  character,
  version,
  approvedKeys,
  hyperparameters
}: {
  character: CharacterRecord;
  version: LoraVersionRecord;
  approvedKeys: string[];
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
    hyperparameters
  };
}
