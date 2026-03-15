import type { JobCompletionPayload } from "../domain";
import { assertArtifacts, isPollingEnabled, requireComfyUiConfig, requireTrainingPodConfig, type AppBindings } from "./config";
import { mapProviderStatusToJobStatus } from "./job-state";
import {
  buildComfyUiProxyReference,
  fetchComfyUiImage,
  getComfyUiHistory,
  getComfyUiPromptError,
  isComfyUiPromptCompleted,
  parseProviderJobIds
} from "./comfyui";
import { AppRepository } from "./repository";
import { getTrainingPodStatus } from "./train-pod";

export async function syncJobStatus(
  env: AppBindings,
  repository: AppRepository,
  jobId: string
): Promise<{ changed: boolean }> {
  const job = await repository.getJob(jobId);
  if (!job || !job.providerJobId || (job.status !== "queued" && job.status !== "running")) {
    return { changed: false };
  }

  if (!isPollingEnabled(env)) {
    return { changed: false };
  }

  if (job.type === "train_lora") {
    const config = requireTrainingPodConfig(env);
    const status = await getTrainingPodStatus({
      baseUrl: config.baseUrl,
      bearerToken: config.bearerToken,
      jobId: job.providerJobId
    });
    const internalStatus = mapProviderStatusToJobStatus(status.status);
    const priorStatus = job.status;

    if (status.status === "COMPLETED" || status.status === "FAILED") {
      const payload = {
        jobId: job.id,
        type: job.type,
        status: status.status,
        output: status.output,
        error: status.error
      } satisfies JobCompletionPayload;
      const dedupeKey = `${job.providerJobId}:${status.status}:poll`;
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

  const config = requireComfyUiConfig(env);
  const promptIds = parseProviderJobIds(job.providerJobId);
  if (!promptIds.length) {
    return { changed: false };
  }

  const histories = await Promise.all(
    promptIds.map((promptId) =>
      getComfyUiHistory({
        baseUrl: config.baseUrl,
        bearerToken: config.bearerToken,
        promptId
      }).then((entry) => ({ promptId, entry }))
    )
  );

  const errorEntry = histories.find(({ entry }) => getComfyUiPromptError(entry));
  if (errorEntry) {
    const payload = {
      jobId: job.id,
      type: job.type,
      status: "FAILED",
      error: getComfyUiPromptError(errorEntry.entry) ?? "ComfyUI prompt failed."
    } satisfies JobCompletionPayload;
    const dedupeKey = `${job.providerJobId}:FAILED:poll`;
    const inserted = await repository.recordJobEvent(job.id, "poller", "status-sync", dedupeKey, payload);
    if (inserted) {
      await repository.applyCompletion(job, payload);
      return { changed: true };
    }
    return { changed: false };
  }

  const completed = histories.every(({ entry }) => isComfyUiPromptCompleted(entry));
  if (!completed) {
    if (job.status !== "running") {
      await repository.applyJobState(job.id, "running");
      return { changed: true };
    }
    return { changed: false };
  }

  const bucket = assertArtifacts(env);
  const seeds =
    job.type === "bootstrap"
      ? Array.from({ length: job.imageCount ?? promptIds.length }, (_, index) => {
          const base = job.seedValues[index % job.seedValues.length] ?? 0;
          const offset = Math.floor(index / Math.max(job.seedValues.length, 1)) * 100_003;
          return base + offset;
        })
      : job.seedValues.slice(0, job.imageCount ?? promptIds.length);

  const images = [];
  for (const [index, history] of histories.entries()) {
    const outputs = Object.values(history.entry?.outputs ?? {});
    const imageMeta = outputs.flatMap((output) => output.images ?? [])[0];
    if (!imageMeta) {
      continue;
    }

    const bytes = await fetchComfyUiImage({
      baseUrl: config.baseUrl,
      bearerToken: config.bearerToken,
      image: imageMeta
    });
    const seed = seeds[index] ?? index;
    const r2Key = `${job.outputPrefix}/seed-${seed}.png`;
    await bucket.put(r2Key, bytes, {
      httpMetadata: {
        contentType: "image/png"
      }
    });
    images.push({
      r2Key,
      seed,
      promptSnapshot: job.promptTemplate ?? job.outputPrefix
    });
  }

  const payload = {
    jobId: job.id,
    type: job.type,
    status: "COMPLETED",
    output: { images },
    providerEventId: buildComfyUiProxyReference(env)
  } satisfies JobCompletionPayload;
  const dedupeKey = `${job.providerJobId}:COMPLETED:poll`;
  const inserted = await repository.recordJobEvent(job.id, "poller", "status-sync", dedupeKey, payload);
  if (inserted) {
    await repository.applyCompletion(job, payload);
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
