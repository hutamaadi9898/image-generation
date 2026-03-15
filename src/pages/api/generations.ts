import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { requireComfyUiConfig } from "../../lib/server/config";
import { validateGenerationInput } from "../../lib/server/content-policy";
import {
  buildComfyUiRequest,
  buildGenerationPromptText,
  dimensionsForAspectRatio,
  expandSeeds
} from "../../lib/server/job-payloads";
import { serializeProviderJobIds, submitComfyUiPrompt } from "../../lib/server/comfyui";
import { badRequest, json } from "../../lib/server/http";
import { createRepository } from "../../lib/server/repository";
import { asInteger, asSeeds, asString, readRequestPayload } from "../../lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const repository = createRepository(env);
  if (!repository) {
    return json({ ok: false, message: "D1 is not configured." }, { status: 503 });
  }

  const payload = await readRequestPayload(request);
  const characterId = asString(payload.characterId);
  const loraVersionId = asString(payload.loraVersionId);

  const [character, version] = await Promise.all([
    repository.getCharacter(characterId),
    repository.getLoraVersion(loraVersionId)
  ]);

  if (!character || !version || version.status !== "ready") {
    return badRequest("A ready LoRA version is required.");
  }

  const input = {
    characterId,
    loraVersionId,
    promptTemplate: asString(payload.promptTemplate),
    negativePrompt: asString(payload.negativePrompt),
    aspectRatio: asString(payload.aspectRatio, "3:4"),
    imageCount: Math.min(Math.max(asInteger(payload.imageCount, 4), 1), 8),
    seeds: asSeeds(payload.seeds, 4)
  };

  const issues = validateGenerationInput(input);
  if (issues.length) {
    return badRequest("Generation request failed validation.", issues);
  }
  let internalJobId: string | null = null;

  try {
    const job = await repository.createGenerationJob(character, input);
    internalJobId = job.id;
    const config = requireComfyUiConfig(env);
    const { prompt, negativePrompt } = buildGenerationPromptText(character, input);
    const { width, height } = dimensionsForAspectRatio(input.aspectRatio);
    const loraFilename = version.artifactR2Key?.split("/").pop() ?? undefined;
    const seeds = expandSeeds(input.seeds, input.imageCount);

    const promptIds: string[] = [];
    for (const seed of seeds) {
      const submission = await submitComfyUiPrompt({
        baseUrl: config.baseUrl,
        bearerToken: config.bearerToken,
        prompt: buildComfyUiRequest({
          checkpointFilename: config.checkpointFilename,
          positivePrompt: prompt,
          negativePrompt,
          seed,
          width,
          height,
          filenamePrefix: `${character.slug}_${job.id}_${seed}`,
          loraFilename
        })
      });
      promptIds.push(submission.prompt_id);
    }

    await repository.updateJobSubmission(job.id, config.baseUrl, serializeProviderJobIds(promptIds));
    return json({ ok: true, jobId: job.id, providerJobId: serializeProviderJobIds(promptIds) });
  } catch (error) {
    if (internalJobId) {
      await repository.applyJobState(
        internalJobId,
        "failed",
        error instanceof Error ? error.message : "Generation submission failed."
      );
    }
    return json(
      { ok: false, message: error instanceof Error ? error.message : "Generation submission failed." },
      { status: 500 }
    );
  }
};
