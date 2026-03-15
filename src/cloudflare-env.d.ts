interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  RUNPOD_API_KEY: string;
  RUNPOD_BOOTSTRAP_ENDPOINT_ID: string;
  RUNPOD_TRAIN_ENDPOINT_ID: string;
  RUNPOD_WEBHOOK_SECRET: string;
  RUNPOD_STATUS_POLL_ENABLED?: string;
  APP_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}
