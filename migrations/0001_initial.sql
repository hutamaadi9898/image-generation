CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  summary TEXT NOT NULL,
  adult_age_years INTEGER NOT NULL,
  identity_traits_json TEXT NOT NULL,
  style_tokens_json TEXT NOT NULL,
  negative_tokens_json TEXT NOT NULL,
  outfit_notes TEXT NOT NULL,
  status TEXT NOT NULL,
  latest_lora_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_profiles (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  label TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  negative_prompt TEXT NOT NULL,
  style_tokens_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reference_images (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  prompt_snapshot TEXT NOT NULL,
  seed INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL,
  reviewer_notes TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reference_images_character_status
  ON reference_images(character_id, status);

CREATE TABLE IF NOT EXISTS lora_versions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  job_id TEXT NOT NULL,
  base_model_id TEXT NOT NULL,
  artifact_r2_key TEXT,
  metadata_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lora_versions_character_version
  ON lora_versions(character_id, version_number);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  lora_version_id TEXT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  runpod_endpoint_id TEXT NOT NULL,
  runpod_job_id TEXT,
  prompt_template TEXT,
  negative_prompt TEXT,
  seed_values_json TEXT NOT NULL,
  aspect_ratio TEXT,
  image_count INTEGER,
  output_prefix TEXT NOT NULL,
  error_message TEXT,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status
  ON generation_jobs(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS generated_images (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  lora_version_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  prompt_snapshot TEXT NOT NULL,
  seed INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (lora_version_id) REFERENCES lora_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
);
