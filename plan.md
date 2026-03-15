# Private MVP Plan: Adult-Suggestive AI Character Art Generator

## Summary
Build a single-admin web app on top of the existing Astro + Cloudflare repo ([package.json](/home/hutamaadi/Desktop/coding/image-generator/package.json), [astro.config.mjs](/home/hutamaadi/Desktop/coding/image-generator/astro.config.mjs)) with a Python inference/training backend on RunPod Serverless. The product flow is: define an original adult character, bootstrap a reference pack with AI, manually curate the dataset, train an SDXL LoRA, then generate consistent adult-suggestive images through async jobs.

Success criteria for v1:
- One admin can create and version characters end to end without touching the terminal.
- Each character has a reusable LoRA artifact and prompt preset set.
- A generation job returns multiple images with recognizable face/hair/outfit consistency across seeds.
- The app blocks explicit sexual prompts, youthful-looking characters, real-person likenesses, and named third-party IP characters.

## Key Changes
- Keep Astro on Cloudflare and switch the app to server-rendered admin routes; use Astro pages for `Dashboard`, `Characters`, `Dataset Review`, `Training`, `Generate`, and `Gallery`.
- Use Cloudflare D1 for metadata and job state, and Cloudflare R2 for generated references, approved training images, final outputs, and LoRA artifacts. Python services will access R2 through its S3-compatible API.
- Create two RunPod queue-based Serverless endpoints:
  - `bootstrap-generate`: SDXL inference worker that generates candidate reference images and normal generation outputs.
  - `train-lora`: Python training worker that downloads curated images from R2, trains an SDXL DreamBooth LoRA, uploads `.safetensors` + metadata to R2, and reports completion by webhook.
- Use async job orchestration only. Astro server routes submit RunPod `/run` jobs, persist job records in D1, and update status via polling fallback plus webhook completion handling.
- Use SDXL-compatible Diffusers training/loading for v1. Default artifact format is `safetensors`, versioned per character as `character_slug/v{n}/lora.safetensors`.
- Add a manual curation gate between bootstrap and training. The system may generate 80-150 candidate references per character, but only 20-40 approved adult-consistent images become the LoRA dataset.
- Enforce content policy in both UI and backend validators:
  - Allow adult suggestive / ecchi / pin-up prompts only.
  - Reject explicit sex acts, visible genitals, minors or school-age framing, incest, coercion, bestiality, celebrity/real-person likenesses, and named copyrighted franchise characters.
- Define these core entities in D1: `characters`, `prompt_profiles`, `reference_images`, `lora_versions`, `generation_jobs`, `generated_images`, `job_events`.
- Define these server interfaces:
  - `POST /api/characters`
  - `POST /api/characters/:id/bootstrap`
  - `POST /api/reference-images/:id/approve`
  - `POST /api/characters/:id/train`
  - `POST /api/generations`
  - `POST /api/runpod/webhook`
  - `GET /api/jobs/:id`
- Standardize three RunPod job payloads:
  - `bootstrap`: character spec, style tokens, negative tokens, seed batch, target count.
  - `train_lora`: character id, approved R2 keys, base model id, training hyperparameters, output path.
  - `generate`: lora version id, prompt template, negative prompt, seed list, aspect ratio, image count.

## Implementation Plan
- Phase 1: turn the Astro starter into a server-rendered admin shell, add D1/R2 bindings, build the D1 schema, and implement the job/status domain model.
- Phase 2: implement the Python RunPod workers, local handler tests, Docker images, model loading, R2 I/O, and webhook contract.
- Phase 3: build the character workflow in Astro: create character, launch AI bootstrap, review candidate images, approve dataset, launch training, inspect LoRA version status.
- Phase 4: build the generation workflow: prompt form, preset application, LoRA version selector, async gallery refresh, seed replay, output storage, and metadata display.
- Phase 5: harden operations: prompt validation, webhook idempotency, retries, timeout handling, artifact cleanup rules, and basic usage/cost telemetry.

## Test Plan
- Unit tests for prompt/content validation, RunPod payload builders, webhook idempotency, job state transitions, and artifact path/version resolution.
- Integration tests with mocked RunPod responses for the full chain: bootstrap submission, approval, training completion, generation completion, and failed-job retry behavior.
- Manual acceptance scenarios:
  - Create an original adult character, generate a candidate pack, approve 20+ images, train a LoRA, and generate 4-8 consistent outputs.
  - Regenerate with different poses/outfits while preserving identity cues.
  - Reject prompts containing explicit sexual language, underage cues, real names, or franchise character names.
  - Recover cleanly from worker timeout, failed training, or missing R2 object.
- Quality bar:
  - A trained character should preserve core identity markers across at least 8 test generations.
  - End-to-end training and generation must work through the UI with no manual RunPod console steps after initial endpoint setup.

## Assumptions And Defaults
- v1 is single-admin only; no public signup, billing, community features, or end-user auth tables.
- Character datasets are AI-bootstrapped and then manually curated; fully automated dataset acceptance is out of scope.
- Only original adult characters are supported in v1.
- Astro remains the control plane; RunPod handles GPU execution only.
- Prefer RunPod cached base models for inference cold-start reduction, use async `/run` plus `/status`/webhook semantics, and keep durable artifacts in R2 instead of relying on long-lived RunPod storage.
- Primary references used for these choices:
  - RunPod endpoints, async jobs, policies, and webhooks: https://docs.runpod.io/serverless/endpoints/job-operations
  - RunPod custom worker flow: https://docs.runpod.io/serverless/workers/custom-worker
  - RunPod cached models: https://docs.runpod.io/serverless/endpoints
  - Hugging Face Diffusers SDXL DreamBooth LoRA training: https://huggingface.co/docs/diffusers/main/training/dreambooth
  - Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
  - Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/get-started/s3/
  - Cloudflare D1 overview: https://developers.cloudflare.com/d1/
