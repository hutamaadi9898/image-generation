export interface AppBindings {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  COMFYUI_BASE_URL?: string;
  COMFYUI_BEARER_TOKEN?: string;
  COMFYUI_CHECKPOINT_FILENAME?: string;
  TRAIN_POD_BASE_URL?: string;
  TRAIN_POD_BEARER_TOKEN?: string;
  JOB_STATUS_POLL_ENABLED?: string;
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

export function requireComfyUiConfig(env: AppBindings): {
  baseUrl: string;
  bearerToken?: string;
  checkpointFilename: string;
} {
  if (!env.COMFYUI_BASE_URL || !env.COMFYUI_CHECKPOINT_FILENAME) {
    throw new Error("ComfyUI Pod configuration is incomplete.");
  }

  return {
    baseUrl: env.COMFYUI_BASE_URL.replace(/\/$/, ""),
    bearerToken: env.COMFYUI_BEARER_TOKEN,
    checkpointFilename: env.COMFYUI_CHECKPOINT_FILENAME
  };
}

export function requireTrainingPodConfig(env: AppBindings): {
  baseUrl: string;
  bearerToken?: string;
} {
  if (!env.TRAIN_POD_BASE_URL) {
    throw new Error("Training Pod configuration is incomplete.");
  }

  return {
    baseUrl: env.TRAIN_POD_BASE_URL.replace(/\/$/, ""),
    bearerToken: env.TRAIN_POD_BEARER_TOKEN
  };
}

export function isPollingEnabled(env: AppBindings): boolean {
  return env.JOB_STATUS_POLL_ENABLED !== "false";
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
