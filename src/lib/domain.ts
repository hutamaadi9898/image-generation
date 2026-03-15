export const JOB_TYPES = ["bootstrap", "train_lora", "generate"] as const;
export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled"
] as const;
export const CHARACTER_STATUSES = [
  "draft",
  "bootstrapping",
  "dataset_ready",
  "training",
  "ready"
] as const;
export const IMAGE_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export const LORA_STATUSES = ["queued", "training", "ready", "failed"] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];
export type ImageReviewStatus = (typeof IMAGE_REVIEW_STATUSES)[number];
export type LoraStatus = (typeof LORA_STATUSES)[number];

export interface CharacterRecord {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  adultAgeYears: number;
  identityTraits: string[];
  styleTokens: string[];
  negativeTokens: string[];
  outfitNotes: string;
  status: CharacterStatus;
  latestLoraVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptProfileRecord {
  id: string;
  characterId: string;
  label: string;
  promptTemplate: string;
  negativePrompt: string;
  styleTokens: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceImageRecord {
  id: string;
  characterId: string;
  jobId: string;
  r2Key: string;
  sourceType: "bootstrap";
  promptSnapshot: string;
  seed: number;
  width: number | null;
  height: number | null;
  status: ImageReviewStatus;
  reviewerNotes: string | null;
  createdAt: string;
  approvedAt: string | null;
}

export interface LoraVersionRecord {
  id: string;
  characterId: string;
  versionNumber: number;
  jobId: string;
  baseModelId: string;
  artifactR2Key: string | null;
  metadataJson: string | null;
  status: LoraStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface JobRecord {
  id: string;
  characterId: string;
  loraVersionId: string | null;
  type: JobType;
  status: JobStatus;
  providerEndpoint: string;
  providerJobId: string | null;
  promptTemplate: string | null;
  negativePrompt: string | null;
  seedValues: number[];
  aspectRatio: string | null;
  imageCount: number | null;
  outputPrefix: string;
  errorMessage: string | null;
  submittedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GeneratedImageRecord {
  id: string;
  jobId: string;
  characterId: string;
  loraVersionId: string;
  r2Key: string;
  promptSnapshot: string;
  seed: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface DashboardSummary {
  totalCharacters: number;
  pendingReferences: number;
  readyLoras: number;
  runningJobs: number;
}

export interface JobEventRecord {
  id: string;
  jobId: string;
  source: string;
  eventType: string;
  dedupeKey: string;
  payloadJson: string;
  createdAt: string;
}

export interface CharacterInput {
  name: string;
  tagline: string;
  summary: string;
  adultAgeYears: number;
  identityTraits: string[];
  styleTokens: string[];
  negativeTokens: string[];
  outfitNotes: string;
  promptTemplate: string;
  negativePrompt: string;
}

export interface BootstrapInput {
  characterId: string;
  styleTokens: string[];
  negativeTokens: string[];
  targetCount: number;
  seeds: number[];
}

export interface TrainingInput {
  characterId: string;
  baseModelId: string;
  rank: number;
  learningRate: number;
  steps: number;
}

export interface GenerationInput {
  characterId: string;
  loraVersionId: string;
  promptTemplate: string;
  negativePrompt: string;
  aspectRatio: string;
  imageCount: number;
  seeds: number[];
}

export interface CompletionImage {
  r2Key: string;
  seed: number;
  promptSnapshot: string;
  width?: number;
  height?: number;
}

export interface JobCompletionPayload {
  jobId: string;
  type: JobType;
  status: "COMPLETED" | "FAILED" | "RUNNING" | "QUEUED" | "IN_PROGRESS" | "IN_QUEUE" | "CANCELLED";
  output?: {
    images?: CompletionImage[];
    artifactR2Key?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
  providerEventId?: string;
}
