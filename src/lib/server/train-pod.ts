interface TrainPodRequestConfig {
  baseUrl: string;
  bearerToken?: string;
}

export interface TrainPodStatusResponse {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  output?: {
    artifactR2Key?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

function buildHeaders(config: TrainPodRequestConfig): HeadersInit {
  return config.bearerToken
    ? {
        authorization: `Bearer ${config.bearerToken}`
      }
    : {};
}

export async function submitTrainingPodJob({
  baseUrl,
  bearerToken,
  input
}: TrainPodRequestConfig & {
  input: Record<string, unknown>;
}): Promise<{ id: string; status: string }> {
  const response = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...buildHeaders({ baseUrl, bearerToken })
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Training Pod submit failed with status ${response.status}.`);
  }

  return (await response.json()) as { id: string; status: string };
}

export async function getTrainingPodStatus({
  baseUrl,
  bearerToken,
  jobId
}: TrainPodRequestConfig & {
  jobId: string;
}): Promise<TrainPodStatusResponse> {
  const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
    headers: buildHeaders({ baseUrl, bearerToken })
  });

  if (!response.ok) {
    throw new Error(`Training Pod status check failed with status ${response.status}.`);
  }

  return (await response.json()) as TrainPodStatusResponse;
}
