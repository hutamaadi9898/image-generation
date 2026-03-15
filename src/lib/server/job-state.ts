import type { JobCompletionPayload, JobStatus } from "../domain";

export function mapProviderStatusToJobStatus(
  status: JobCompletionPayload["status"]
): JobStatus {
  switch (status) {
    case "QUEUED":
    case "IN_QUEUE":
      return "queued";
    case "RUNNING":
    case "IN_PROGRESS":
      return "running";
    case "COMPLETED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "queued";
  }
}

export function isTrainingReady(approvedReferenceCount: number): boolean {
  return approvedReferenceCount >= 20;
}

export function buildWebhookDedupeKey({
  providerEventId,
  providerJobId,
  status,
  output
}: {
  providerEventId?: string;
  providerJobId?: string | null;
  status: string;
  output?: unknown;
}): string {
  if (providerEventId) {
    return providerEventId;
  }

  return `${providerJobId ?? "manual"}:${status}:${JSON.stringify(output ?? {})}`;
}
