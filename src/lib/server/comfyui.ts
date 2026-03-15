import type { AppBindings } from "./config";

interface ComfyUiRequestConfig {
  baseUrl: string;
  bearerToken?: string;
}

export interface ComfyUiSubmissionResponse {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyUiHistoryImage {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyUiHistoryEntry {
  outputs?: Record<string, { images?: ComfyUiHistoryImage[] }>;
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown[];
  };
}

function buildHeaders(config: ComfyUiRequestConfig): HeadersInit {
  return config.bearerToken
    ? {
        authorization: `Bearer ${config.bearerToken}`
      }
    : {};
}

export async function submitComfyUiPrompt({
  baseUrl,
  bearerToken,
  prompt
}: ComfyUiRequestConfig & {
  prompt: Record<string, unknown>;
}): Promise<ComfyUiSubmissionResponse> {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...buildHeaders({ baseUrl, bearerToken })
    },
    body: JSON.stringify({ prompt })
  });

  if (!response.ok) {
    throw new Error(`ComfyUI prompt submit failed with status ${response.status}.`);
  }

  return (await response.json()) as ComfyUiSubmissionResponse;
}

export async function getComfyUiHistory({
  baseUrl,
  bearerToken,
  promptId
}: ComfyUiRequestConfig & {
  promptId: string;
}): Promise<ComfyUiHistoryEntry | null> {
  const response = await fetch(`${baseUrl}/history/${promptId}`, {
    headers: buildHeaders({ baseUrl, bearerToken })
  });

  if (!response.ok) {
    throw new Error(`ComfyUI history check failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as Record<string, ComfyUiHistoryEntry>;
  return payload[promptId] ?? null;
}

export async function fetchComfyUiImage({
  baseUrl,
  bearerToken,
  image
}: ComfyUiRequestConfig & {
  image: ComfyUiHistoryImage;
}): Promise<ArrayBuffer> {
  const url = new URL(`${baseUrl}/view`);
  url.searchParams.set("filename", image.filename);
  url.searchParams.set("subfolder", image.subfolder);
  url.searchParams.set("type", image.type);

  const response = await fetch(url, {
    headers: buildHeaders({ baseUrl, bearerToken })
  });

  if (!response.ok) {
    throw new Error(`ComfyUI image fetch failed with status ${response.status}.`);
  }

  return await response.arrayBuffer();
}

export function serializeProviderJobIds(ids: string[]): string {
  return JSON.stringify(ids);
}

export function parseProviderJobIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    return [value];
  }

  return [value];
}

export function isComfyUiPromptCompleted(entry: ComfyUiHistoryEntry | null): boolean {
  return Boolean(entry?.outputs && Object.keys(entry.outputs).length > 0);
}

export function getComfyUiPromptError(entry: ComfyUiHistoryEntry | null): string | null {
  const status = entry?.status?.status_str?.toLowerCase();
  if (status && ["error", "failed"].includes(status)) {
    return status;
  }

  const messages = entry?.status?.messages ?? [];
  const serialized = JSON.stringify(messages);
  return serialized.includes("execution_error") ? serialized : null;
}

export function buildComfyUiProxyReference(env: AppBindings): string {
  return env.COMFYUI_BASE_URL?.replace(/\/$/, "") ?? "comfyui-pod";
}
