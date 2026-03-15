import type { JobCompletionPayload, JobRecord, JobType } from "../domain";
import type { AppBindings } from "./config";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

interface RunPodSubmissionRequest {
  apiKey: string;
  endpointId: string;
  input: Record<string, unknown>;
}

export interface RunPodJobStatusResponse {
  id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  output?: Record<string, unknown>;
  error?: string;
}

export async function submitRunPodJob({
  apiKey,
  endpointId,
  input
}: RunPodSubmissionRequest): Promise<{ id: string; status: string }> {
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input,
      policy: {
        executionTimeout: 3_600_000,
        ttl: 86_400_000,
        lowPriority: false
      }
    })
  });

  if (!response.ok) {
    throw new Error(`RunPod submit failed with status ${response.status}.`);
  }

  return (await response.json()) as { id: string; status: string };
}

export async function getRunPodStatus({
  apiKey,
  endpointId,
  jobId
}: {
  apiKey: string;
  endpointId: string;
  jobId: string;
}): Promise<RunPodJobStatusResponse> {
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/status/${jobId}`, {
    headers: {
      authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`RunPod status check failed with status ${response.status}.`);
  }

  return (await response.json()) as RunPodJobStatusResponse;
}

export function mapRunPodStatus(status: RunPodJobStatusResponse["status"]): JobRecord["status"] {
  switch (status) {
    case "IN_QUEUE":
      return "queued";
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

export function buildWebhookPayload(
  type: JobType,
  jobId: string,
  payload: RunPodJobStatusResponse
): JobCompletionPayload {
  return {
    jobId,
    type,
    status: payload.status,
    output: payload.output as JobCompletionPayload["output"],
    error: payload.error
  };
}

export function verifyWebhookSecret(request: Request, env: AppBindings): boolean {
  const provided =
    request.headers.get("x-runpod-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return Boolean(provided && env.RUNPOD_WEBHOOK_SECRET && provided === env.RUNPOD_WEBHOOK_SECRET);
}
