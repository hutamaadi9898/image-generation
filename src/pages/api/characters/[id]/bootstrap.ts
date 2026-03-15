import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { requireComfyUiConfig } from "../../../../lib/server/config";
import {
  buildBootstrapPromptText,
  buildComfyUiRequest,
  dimensionsForAspectRatio,
  expandSeeds
} from "../../../../lib/server/job-payloads";
import { serializeProviderJobIds, submitComfyUiPrompt } from "../../../../lib/server/comfyui";
import { badRequest, json } from "../../../../lib/server/http";
import { createRepository } from "../../../../lib/server/repository";
import { asInteger, asSeeds, readRequestPayload } from "../../../../lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const repository = createRepository(env);
  if (!repository) {
    return json({ ok: false, message: "D1 is not configured." }, { status: 503 });
  }

  const character = await repository.getCharacter(params.id ?? "");
  if (!character) {
    return badRequest("Character not found.");
  }

  const promptProfile = (await repository.listPromptProfiles(character.id))[0];
  if (!promptProfile) {
    return badRequest("Character is missing a prompt profile.");
  }

  const payload = await readRequestPayload(request);
  const targetCount = Math.min(Math.max(asInteger(payload.targetCount, 96), 20), 150);
  const seeds = asSeeds(payload.seeds, Math.min(targetCount, 8));
  let internalJobId: string | null = null;

  try {
    const job = await repository.createBootstrapJob(character, targetCount, seeds);
    internalJobId = job.id;
    const config = requireComfyUiConfig(env);
    const { prompt, negativePrompt } = buildBootstrapPromptText(character, promptProfile);
    const expandedSeeds = expandSeeds(seeds, targetCount);
    const { width, height } = dimensionsForAspectRatio("3:4");

    const promptIds: string[] = [];
    for (const seed of expandedSeeds) {
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
          filenamePrefix: `${character.slug}_${job.id}_${seed}`
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
        error instanceof Error ? error.message : "Bootstrap submission failed."
      );
    }
    return json(
      { ok: false, message: error instanceof Error ? error.message : "Bootstrap submission failed." },
      { status: 500 }
    );
  }
};
