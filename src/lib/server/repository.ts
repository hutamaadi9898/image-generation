import type {
  CharacterInput,
  CharacterRecord,
  DashboardSummary,
  GeneratedImageRecord,
  GenerationInput,
  JobCompletionPayload,
  JobRecord,
  JobStatus,
  JobType,
  LoraVersionRecord,
  PromptProfileRecord,
  ReferenceImageRecord,
  TrainingInput
} from "../domain";
import { buildApprovedDatasetKey, buildGenerationOutputPrefix, buildLoraArtifactKey } from "./paths";
import { getRequiredDb, type AppBindings } from "./config";
import { createId, nowIso, slugify } from "./ids";

function parseJsonArray(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonNumberArray(value: unknown): number[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((item) => Number(item)).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function mapCharacter(row: Record<string, unknown>): CharacterRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    tagline: String(row.tagline ?? ""),
    summary: String(row.summary ?? ""),
    adultAgeYears: Number(row.adult_age_years ?? 21),
    identityTraits: parseJsonArray(row.identity_traits_json),
    styleTokens: parseJsonArray(row.style_tokens_json),
    negativeTokens: parseJsonArray(row.negative_tokens_json),
    outfitNotes: String(row.outfit_notes ?? ""),
    status: String(row.status ?? "draft") as CharacterRecord["status"],
    latestLoraVersionId: row.latest_lora_version_id ? String(row.latest_lora_version_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapPromptProfile(row: Record<string, unknown>): PromptProfileRecord {
  return {
    id: String(row.id),
    characterId: String(row.character_id),
    label: String(row.label),
    promptTemplate: String(row.prompt_template),
    negativePrompt: String(row.negative_prompt),
    styleTokens: parseJsonArray(row.style_tokens_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapReference(row: Record<string, unknown>): ReferenceImageRecord {
  return {
    id: String(row.id),
    characterId: String(row.character_id),
    jobId: String(row.job_id),
    r2Key: String(row.r2_key),
    sourceType: "bootstrap",
    promptSnapshot: String(row.prompt_snapshot ?? ""),
    seed: Number(row.seed ?? 0),
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null,
    status: String(row.status ?? "pending") as ReferenceImageRecord["status"],
    reviewerNotes: row.reviewer_notes ? String(row.reviewer_notes) : null,
    createdAt: String(row.created_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null
  };
}

function mapLoraVersion(row: Record<string, unknown>): LoraVersionRecord {
  return {
    id: String(row.id),
    characterId: String(row.character_id),
    versionNumber: Number(row.version_number),
    jobId: String(row.job_id),
    baseModelId: String(row.base_model_id),
    artifactR2Key: row.artifact_r2_key ? String(row.artifact_r2_key) : null,
    metadataJson: row.metadata_json ? String(row.metadata_json) : null,
    status: String(row.status ?? "queued") as LoraVersionRecord["status"],
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

function mapJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    characterId: String(row.character_id),
    loraVersionId: row.lora_version_id ? String(row.lora_version_id) : null,
    type: String(row.job_type) as JobType,
    status: String(row.status) as JobStatus,
    providerEndpoint: String(row.provider_endpoint ?? ""),
    providerJobId: row.provider_job_id ? String(row.provider_job_id) : null,
    promptTemplate: row.prompt_template ? String(row.prompt_template) : null,
    negativePrompt: row.negative_prompt ? String(row.negative_prompt) : null,
    seedValues: parseJsonNumberArray(row.seed_values_json),
    aspectRatio: row.aspect_ratio ? String(row.aspect_ratio) : null,
    imageCount: row.image_count ? Number(row.image_count) : null,
    outputPrefix: String(row.output_prefix ?? ""),
    errorMessage: row.error_message ? String(row.error_message) : null,
    submittedAt: String(row.submitted_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

function mapGeneratedImage(row: Record<string, unknown>): GeneratedImageRecord {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    characterId: String(row.character_id),
    loraVersionId: String(row.lora_version_id),
    r2Key: String(row.r2_key),
    promptSnapshot: String(row.prompt_snapshot ?? ""),
    seed: Number(row.seed ?? 0),
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null,
    createdAt: String(row.created_at)
  };
}

export class AppRepository {
  readonly db: D1Database;

  constructor(env: AppBindings) {
    this.db = getRequiredDb(env);
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const [characters, pendingReferences, readyLoras, runningJobs] = await Promise.all([
      this.db.prepare("SELECT COUNT(*) AS total FROM characters").first<{ total: number }>(),
      this.db
        .prepare("SELECT COUNT(*) AS total FROM reference_images WHERE status = 'pending'")
        .first<{ total: number }>(),
      this.db
        .prepare("SELECT COUNT(*) AS total FROM lora_versions WHERE status = 'ready'")
        .first<{ total: number }>(),
      this.db
        .prepare("SELECT COUNT(*) AS total FROM generation_jobs WHERE status IN ('queued', 'running')")
        .first<{ total: number }>()
    ]);

    return {
      totalCharacters: Number(characters?.total ?? 0),
      pendingReferences: Number(pendingReferences?.total ?? 0),
      readyLoras: Number(readyLoras?.total ?? 0),
      runningJobs: Number(runningJobs?.total ?? 0)
    };
  }

  async listCharacters(): Promise<CharacterRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM characters ORDER BY updated_at DESC")
      .all<Record<string, unknown>>();
    return result.results.map(mapCharacter);
  }

  async getCharacter(id: string): Promise<CharacterRecord | null> {
    const row = await this.db.prepare("SELECT * FROM characters WHERE id = ?1").bind(id).first();
    return row ? mapCharacter(row as Record<string, unknown>) : null;
  }

  async getCharacterBySlug(slug: string): Promise<CharacterRecord | null> {
    const row = await this.db.prepare("SELECT * FROM characters WHERE slug = ?1").bind(slug).first();
    return row ? mapCharacter(row as Record<string, unknown>) : null;
  }

  async createCharacter(input: CharacterInput): Promise<CharacterRecord> {
    const id = createId("char");
    const slug = slugify(input.name);
    const now = nowIso();

    await this.db
      .prepare(
        `INSERT INTO characters (
          id, slug, name, tagline, summary, adult_age_years, identity_traits_json,
          style_tokens_json, negative_tokens_json, outfit_notes, status, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'draft', ?11, ?11)`
      )
      .bind(
        id,
        slug,
        input.name,
        input.tagline,
        input.summary,
        input.adultAgeYears,
        JSON.stringify(input.identityTraits),
        JSON.stringify(input.styleTokens),
        JSON.stringify(input.negativeTokens),
        input.outfitNotes,
        now
      )
      .run();

    const promptProfileId = createId("profile");
    await this.db
      .prepare(
        `INSERT INTO prompt_profiles (
          id, character_id, label, prompt_template, negative_prompt, style_tokens_json, created_at, updated_at
        ) VALUES (?1, ?2, 'Default', ?3, ?4, ?5, ?6, ?6)`
      )
      .bind(
        promptProfileId,
        id,
        input.promptTemplate,
        input.negativePrompt,
        JSON.stringify(input.styleTokens),
        now
      )
      .run();

    const created = await this.getCharacter(id);
    if (!created) {
      throw new Error("Character creation failed.");
    }

    return created;
  }

  async listPromptProfiles(characterId?: string): Promise<PromptProfileRecord[]> {
    const statement = characterId
      ? this.db
          .prepare("SELECT * FROM prompt_profiles WHERE character_id = ?1 ORDER BY updated_at DESC")
          .bind(characterId)
      : this.db.prepare("SELECT * FROM prompt_profiles ORDER BY updated_at DESC");
    const result = await statement.all<Record<string, unknown>>();
    return result.results.map(mapPromptProfile);
  }

  async listReferenceImages(filters: {
    status?: ReferenceImageRecord["status"];
    characterId?: string;
  } = {}): Promise<ReferenceImageRecord[]> {
    const clauses: string[] = [];
    const values: string[] = [];

    if (filters.status) {
      clauses.push(`status = ?${values.length + 1}`);
      values.push(filters.status);
    }
    if (filters.characterId) {
      clauses.push(`character_id = ?${values.length + 1}`);
      values.push(filters.characterId);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const statement = this.db
      .prepare(`SELECT * FROM reference_images ${whereClause} ORDER BY created_at DESC`)
      .bind(...values);
    const result = await statement.all<Record<string, unknown>>();
    return result.results.map(mapReference);
  }

  async getReferenceImage(id: string): Promise<ReferenceImageRecord | null> {
    const row = await this.db.prepare("SELECT * FROM reference_images WHERE id = ?1").bind(id).first();
    return row ? mapReference(row as Record<string, unknown>) : null;
  }

  async setReferenceImageDecision(
    id: string,
    status: "approved" | "rejected",
    reviewerNotes: string
  ): Promise<ReferenceImageRecord | null> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE reference_images
         SET status = ?2, reviewer_notes = ?3, approved_at = CASE WHEN ?2 = 'approved' THEN ?4 ELSE NULL END
         WHERE id = ?1`
      )
      .bind(id, status, reviewerNotes, now)
      .run();

    return this.getReferenceImage(id);
  }

  async countApprovedReferences(characterId: string): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS total FROM reference_images WHERE character_id = ?1 AND status = 'approved'"
      )
      .bind(characterId)
      .first<{ total: number }>();

    return Number(row?.total ?? 0);
  }

  async listLoraVersions(characterId?: string): Promise<LoraVersionRecord[]> {
    const statement = characterId
      ? this.db
          .prepare("SELECT * FROM lora_versions WHERE character_id = ?1 ORDER BY version_number DESC")
          .bind(characterId)
      : this.db.prepare("SELECT * FROM lora_versions ORDER BY created_at DESC");
    const result = await statement.all<Record<string, unknown>>();
    return result.results.map(mapLoraVersion);
  }

  async getLoraVersion(id: string): Promise<LoraVersionRecord | null> {
    const row = await this.db.prepare("SELECT * FROM lora_versions WHERE id = ?1").bind(id).first();
    return row ? mapLoraVersion(row as Record<string, unknown>) : null;
  }

  async getNextLoraVersionNumber(characterId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM lora_versions WHERE character_id = ?1")
      .bind(characterId)
      .first<{ next_version: number }>();
    return Number(row?.next_version ?? 1);
  }

  async createTrainingVersion(character: CharacterRecord, input: TrainingInput): Promise<LoraVersionRecord> {
    const versionNumber = await this.getNextLoraVersionNumber(character.id);
    const versionId = createId("lora");
    const jobId = createId("job");
    const now = nowIso();
    const artifactR2Key = buildLoraArtifactKey(character.slug, versionNumber);

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO generation_jobs (
            id, character_id, lora_version_id, job_type, status, provider_endpoint,
            seed_values_json, output_prefix, submitted_at, updated_at
          ) VALUES (?1, ?2, ?3, 'train_lora', 'queued', '', '[]', ?4, ?5, ?5)`
        )
        .bind(jobId, character.id, versionId, artifactR2Key, now),
      this.db
        .prepare(
          `INSERT INTO lora_versions (
            id, character_id, version_number, job_id, base_model_id, artifact_r2_key,
            metadata_json, status, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', ?8)`
        )
        .bind(
          versionId,
          character.id,
          versionNumber,
          jobId,
          input.baseModelId,
          artifactR2Key,
          JSON.stringify({
            rank: input.rank,
            learningRate: input.learningRate,
            steps: input.steps
          }),
          now
        ),
      this.db
        .prepare("UPDATE characters SET status = 'training', updated_at = ?2 WHERE id = ?1")
        .bind(character.id, now)
    ]);

    const version = await this.getLoraVersion(versionId);
    if (!version) {
      throw new Error("LoRA version creation failed.");
    }

    return version;
  }

  async updateJobSubmission(jobId: string, endpoint: string, providerJobId: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE generation_jobs
         SET provider_endpoint = ?2, provider_job_id = ?3, updated_at = ?4
         WHERE id = ?1`
      )
      .bind(jobId, endpoint, providerJobId, nowIso())
      .run();
  }

  async createBootstrapJob(character: CharacterRecord, targetCount: number, seeds: number[]): Promise<JobRecord> {
    const jobId = createId("job");
    const now = nowIso();
    const outputPrefix = `${character.slug}/bootstrap/${jobId}`;

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO generation_jobs (
            id, character_id, lora_version_id, job_type, status, provider_endpoint,
            prompt_template, negative_prompt, seed_values_json, image_count, output_prefix,
            submitted_at, updated_at
          ) VALUES (?1, ?2, NULL, 'bootstrap', 'queued', '', NULL, NULL, ?3, ?4, ?5, ?6, ?6)`
        )
        .bind(jobId, character.id, JSON.stringify(seeds), targetCount, outputPrefix, now),
      this.db
        .prepare("UPDATE characters SET status = 'bootstrapping', updated_at = ?2 WHERE id = ?1")
        .bind(character.id, now)
    ]);

    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error("Bootstrap job creation failed.");
    }

    return job;
  }

  async createGenerationJob(
    character: CharacterRecord,
    input: GenerationInput
  ): Promise<JobRecord> {
    const jobId = createId("job");
    const now = nowIso();
    const outputPrefix = buildGenerationOutputPrefix(character.slug, jobId);

    await this.db
      .prepare(
        `INSERT INTO generation_jobs (
          id, character_id, lora_version_id, job_type, status, provider_endpoint,
          prompt_template, negative_prompt, seed_values_json, aspect_ratio, image_count,
          output_prefix, submitted_at, updated_at
        ) VALUES (?1, ?2, ?3, 'generate', 'queued', '', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
      )
      .bind(
        jobId,
        character.id,
        input.loraVersionId,
        input.promptTemplate,
        input.negativePrompt,
        JSON.stringify(input.seeds),
        input.aspectRatio,
        input.imageCount,
        outputPrefix,
        now
      )
      .run();

    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error("Generation job creation failed.");
    }

    return job;
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const row = await this.db.prepare("SELECT * FROM generation_jobs WHERE id = ?1").bind(id).first();
    return row ? mapJob(row as Record<string, unknown>) : null;
  }

  async listJobs(): Promise<JobRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM generation_jobs ORDER BY submitted_at DESC LIMIT 25")
      .all<Record<string, unknown>>();
    return result.results.map(mapJob);
  }

  async listGeneratedImages(): Promise<GeneratedImageRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM generated_images ORDER BY created_at DESC LIMIT 48")
      .all<Record<string, unknown>>();
    return result.results.map(mapGeneratedImage);
  }

  async recordJobEvent(
    jobId: string,
    source: string,
    eventType: string,
    dedupeKey: string,
    payload: unknown
  ): Promise<boolean> {
    try {
      await this.db
        .prepare(
          `INSERT INTO job_events (id, job_id, source, event_type, dedupe_key, payload_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .bind(createId("event"), jobId, source, eventType, dedupeKey, JSON.stringify(payload), nowIso())
        .run();
      return true;
    } catch {
      return false;
    }
  }

  async applyJobState(jobId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    const now = nowIso();
    const completedAt = status === "succeeded" || status === "failed" || status === "cancelled" ? now : null;

    await this.db
      .prepare(
        `UPDATE generation_jobs
         SET status = ?2, error_message = ?3, updated_at = ?4, completed_at = ?5
         WHERE id = ?1`
      )
      .bind(jobId, status, errorMessage ?? null, now, completedAt)
      .run();
  }

  async applyCompletion(job: JobRecord, payload: JobCompletionPayload): Promise<void> {
    if (payload.status === "IN_QUEUE" || payload.status === "IN_PROGRESS") {
      await this.applyJobState(job.id, payload.status === "IN_QUEUE" ? "queued" : "running");
      return;
    }

    if (payload.status === "FAILED" || payload.status === "CANCELLED") {
      await this.applyJobState(job.id, payload.status === "FAILED" ? "failed" : "cancelled", payload.error);
      if (job.type === "train_lora" && job.loraVersionId) {
        await this.db
          .prepare("UPDATE lora_versions SET status = 'failed' WHERE id = ?1")
          .bind(job.loraVersionId)
          .run();
      }
      return;
    }

    await this.applyJobState(job.id, "succeeded");

    if (job.type === "bootstrap") {
      const images = payload.output?.images ?? [];
      for (const image of images) {
        await this.db
          .prepare(
            `INSERT INTO reference_images (
              id, character_id, job_id, r2_key, source_type, prompt_snapshot, seed,
              width, height, status, reviewer_notes, created_at, approved_at
            ) VALUES (?1, ?2, ?3, ?4, 'bootstrap', ?5, ?6, ?7, ?8, 'pending', NULL, ?9, NULL)`
          )
          .bind(
            createId("ref"),
            job.characterId,
            job.id,
            image.r2Key,
            image.promptSnapshot,
            image.seed,
            image.width ?? null,
            image.height ?? null,
            nowIso()
          )
          .run();
      }
      return;
    }

    if (job.type === "train_lora" && job.loraVersionId) {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE lora_versions
             SET status = 'ready', artifact_r2_key = ?2, metadata_json = ?3, completed_at = ?4
             WHERE id = ?1`
          )
          .bind(
            job.loraVersionId,
            payload.output?.artifactR2Key ?? null,
            JSON.stringify(payload.output?.metadata ?? {}),
            nowIso()
          ),
        this.db
          .prepare(
            `UPDATE characters
             SET status = 'ready', latest_lora_version_id = ?2, updated_at = ?3
             WHERE id = ?1`
          )
          .bind(job.characterId, job.loraVersionId, nowIso())
      ]);
      return;
    }

    if (job.type === "generate" && job.loraVersionId) {
      const images = payload.output?.images ?? [];
      for (const image of images) {
        await this.db
          .prepare(
            `INSERT INTO generated_images (
              id, job_id, character_id, lora_version_id, r2_key, prompt_snapshot,
              seed, width, height, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
          )
          .bind(
            createId("img"),
            job.id,
            job.characterId,
            job.loraVersionId,
            image.r2Key,
            image.promptSnapshot,
            image.seed,
            image.width ?? null,
            image.height ?? null,
            nowIso()
          )
          .run();
      }
    }
  }
}

export function createRepository(env: AppBindings): AppRepository | null {
  if (!env.DB) {
    return null;
  }

  return new AppRepository(env);
}
