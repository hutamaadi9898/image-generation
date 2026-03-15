import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, badRequest } from "../../../lib/server/http";
import { buildWebhookDedupeKey } from "../../../lib/server/job-state";
import { parseCompletionPayload } from "../../../lib/server/jobs";
import { createRepository } from "../../../lib/server/repository";
import { verifyWebhookSecret } from "../../../lib/server/runpod";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!verifyWebhookSecret(request, env)) {
    return json({ ok: false, message: "Invalid webhook secret." }, { status: 401 });
  }

  const repository = createRepository(env);
  if (!repository) {
    return json({ ok: false, message: "D1 is not configured." }, { status: 503 });
  }

  const raw = (await request.json()) as Record<string, unknown>;
  const payload = parseCompletionPayload(raw);
  if (!payload.jobId) {
    return badRequest("Webhook payload is missing `jobId`.");
  }

  const job = await repository.getJob(payload.jobId);
  if (!job) {
    return badRequest("Job not found.");
  }

  const dedupeKey = buildWebhookDedupeKey({
    providerEventId: payload.providerEventId,
    providerJobId: job.runpodJobId,
    status: payload.status,
    output: payload.output
  });
  const inserted = await repository.recordJobEvent(job.id, "webhook", "runpod-update", dedupeKey, payload);

  if (!inserted) {
    return json({ ok: true, replay: true });
  }

  await repository.applyCompletion(job, payload);
  return json({ ok: true });
};
