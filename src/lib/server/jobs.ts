import type { JobCompletionPayload } from "../domain";
import { isPollingEnabled, requireRunPodConfig, type AppBindings } from "./config";
import { mapProviderStatusToJobStatus } from "./job-state";
import { buildWebhookPayload, getRunPodStatus } from "./runpod";
import { AppRepository } from "./repository";

export async function syncJobStatus(
  env: AppBindings,
  repository: AppRepository,
  jobId: string
): Promise<{ changed: boolean }> {
  const job = await repository.getJob(jobId);
  if (!job || !job.runpodJobId || (job.status !== "queued" && job.status !== "running")) {
    return { changed: false };
  }

  if (!isPollingEnabled(env)) {
    return { changed: false };
  }

  const config = requireRunPodConfig(env, job.type === "train_lora" ? "train" : "bootstrap");
  const status = await getRunPodStatus({
    apiKey: config.apiKey,
    endpointId: job.runpodEndpointId || config.endpointId,
    jobId: job.runpodJobId
  });
  const internalStatus = mapProviderStatusToJobStatus(status.status);
  const priorStatus = job.status;

  if (status.status === "COMPLETED" || status.status === "FAILED" || status.status === "CANCELLED") {
    const payload = buildWebhookPayload(job.type, job.id, status);
    const dedupeKey = `${job.runpodJobId}:${status.status}:poll`;
    const inserted = await repository.recordJobEvent(job.id, "poller", "status-sync", dedupeKey, payload);
    if (inserted) {
      await repository.applyCompletion(job, payload);
      return { changed: true };
    }
  } else if (internalStatus !== priorStatus) {
    await repository.applyJobState(job.id, internalStatus);
    return { changed: true };
  }

  return { changed: false };
}

export function parseCompletionPayload(raw: Record<string, unknown>): JobCompletionPayload {
  return {
    jobId: String(raw.jobId ?? raw.internalJobId ?? ""),
    type: String(raw.type ?? "generate") as JobCompletionPayload["type"],
    status: String(raw.status ?? "FAILED") as JobCompletionPayload["status"],
    output: raw.output as JobCompletionPayload["output"],
    error: raw.error ? String(raw.error) : undefined,
    providerEventId: raw.providerEventId ? String(raw.providerEventId) : undefined
  };
}
