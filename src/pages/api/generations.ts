import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { requireRunPodConfig } from "../../lib/server/config";
import { validateGenerationInput } from "../../lib/server/content-policy";
import { buildGenerationPayload } from "../../lib/server/job-payloads";
import { badRequest, json } from "../../lib/server/http";
import { createRepository } from "../../lib/server/repository";
import { asInteger, asSeeds, asString, readRequestPayload } from "../../lib/server/request";
import { submitRunPodJob } from "../../lib/server/runpod";

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
    const config = requireRunPodConfig(env, "bootstrap");
    const submission = await submitRunPodJob({
      apiKey: config.apiKey,
      endpointId: config.endpointId,
      input: buildGenerationPayload({
        character,
        version,
        input,
        job,
        webhookSecret: env.RUNPOD_WEBHOOK_SECRET
      })
    });

    await repository.updateJobSubmission(job.id, config.endpointId, submission.id);
    return json({ ok: true, jobId: job.id, runpodJobId: submission.id });
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
