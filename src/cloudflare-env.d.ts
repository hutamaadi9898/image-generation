interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
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
