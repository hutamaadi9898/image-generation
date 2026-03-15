export interface AppBindings {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  RUNPOD_API_KEY?: string;
  RUNPOD_BOOTSTRAP_ENDPOINT_ID?: string;
  RUNPOD_TRAIN_ENDPOINT_ID?: string;
  RUNPOD_WEBHOOK_SECRET?: string;
  RUNPOD_STATUS_POLL_ENABLED?: string;
  APP_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

export function getRequiredDb(env: AppBindings): D1Database {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is not configured.");
  }

  return env.DB;
}

export function assertArtifacts(env: AppBindings): R2Bucket {
  if (!env.ARTIFACTS) {
    throw new Error("Cloudflare R2 binding `ARTIFACTS` is not configured.");
  }

  return env.ARTIFACTS;
}

export function requireRunPodConfig(env: AppBindings, type: "bootstrap" | "train"): {
  apiKey: string;
  endpointId: string;
  webhookUrl: string;
} {
  const endpointId =
    type === "bootstrap" ? env.RUNPOD_BOOTSTRAP_ENDPOINT_ID : env.RUNPOD_TRAIN_ENDPOINT_ID;

  if (!env.RUNPOD_API_KEY || !endpointId) {
    throw new Error(`RunPod configuration for ${type} jobs is incomplete.`);
  }

  if (!env.APP_BASE_URL) {
    throw new Error("APP_BASE_URL must be set so RunPod can reach the webhook endpoint.");
  }

  return {
    apiKey: env.RUNPOD_API_KEY,
    endpointId,
    webhookUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/api/runpod/webhook`
  };
}

export function isPollingEnabled(env: AppBindings): boolean {
  return env.RUNPOD_STATUS_POLL_ENABLED !== "false";
}

export function requireGeminiConfig(env: AppBindings): { apiKey: string; model: string } {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  return {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-3-flash-preview"
  };
}
