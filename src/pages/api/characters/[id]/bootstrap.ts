import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { requireRunPodConfig } from "../../../../lib/server/config";
import { buildBootstrapPayload } from "../../../../lib/server/job-payloads";
import { badRequest, json } from "../../../../lib/server/http";
import { createRepository } from "../../../../lib/server/repository";
import { asInteger, asSeeds, readRequestPayload } from "../../../../lib/server/request";
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
    const config = requireRunPodConfig(env, "bootstrap");
    const submission = await submitRunPodJob({
      apiKey: config.apiKey,
      endpointId: config.endpointId,
      webhookUrl: config.webhookUrl,
      input: buildBootstrapPayload({
        character,
        promptProfile,
        targetCount,
        seeds
      })
    });

    await repository.updateJobSubmission(job.id, config.endpointId, submission.id);
    return json({ ok: true, jobId: job.id, runpodJobId: submission.id });
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
