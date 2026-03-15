import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { requireRunPodConfig } from "../../../../lib/server/config";
import { buildTrainingPayload } from "../../../../lib/server/job-payloads";
import { badRequest, json } from "../../../../lib/server/http";
import { createRepository } from "../../../../lib/server/repository";
import { asInteger, asNumber, asString, readRequestPayload } from "../../../../lib/server/request";
import { submitRunPodJob } from "../../../../lib/server/runpod";

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

  const approvedReferences = await repository.listReferenceImages({
    characterId: character.id,
    status: "approved"
  });
  if (approvedReferences.length < 20) {
    return badRequest("At least 20 approved reference images are required before training.");
  }

  const payload = await readRequestPayload(request);
  const input = {
    characterId: character.id,
    baseModelId: asString(payload.baseModelId, "stabilityai/stable-diffusion-xl-base-1.0"),
    rank: asInteger(payload.rank, 16),
    learningRate: asNumber(payload.learningRate, 0.0001),
    steps: asInteger(payload.steps, 1200)
  };
  let internalJobId: string | null = null;
  let loraVersionId: string | null = null;

  try {
    const version = await repository.createTrainingVersion(character, input);
    internalJobId = version.jobId;
    loraVersionId = version.id;
    const config = requireRunPodConfig(env, "train");
    const submission = await submitRunPodJob({
      apiKey: config.apiKey,
      endpointId: config.endpointId,
      input: buildTrainingPayload({
        character,
        version,
        approvedKeys: approvedReferences.map((item) => item.r2Key),
        webhookSecret: env.RUNPOD_WEBHOOK_SECRET,
        hyperparameters: {
          rank: input.rank,
          learningRate: input.learningRate,
          steps: input.steps
        }
      })
    });

    await repository.updateJobSubmission(version.jobId, config.endpointId, submission.id);
    return json({ ok: true, jobId: version.jobId, loraVersionId: version.id, runpodJobId: submission.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training submission failed.";
    if (internalJobId) {
      await repository.applyJobState(internalJobId, "failed", message);
    }
    if (loraVersionId) {
      await repository.db
        .prepare("UPDATE lora_versions SET status = 'failed' WHERE id = ?1")
        .bind(loraVersionId)
        .run();
    }
    return json(
      { ok: false, message },
      { status: 500 }
    );
  }
};
