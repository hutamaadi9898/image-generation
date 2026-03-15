# Character Forge

Private Astro + Cloudflare control plane for:

- creating original adult-only character profiles
- curating reference images
- training SDXL LoRA versions on RunPod Serverless
- generating final images with stored prompt presets

The app now also supports Gemini-assisted prompt drafting from the Characters page.

## Stack

- Astro SSR on Cloudflare Workers
- Cloudflare D1 for metadata and job state
- Cloudflare R2 for datasets, generations, and LoRA artifacts
- RunPod Serverless for GPU inference and LoRA training
- Gemini for drafting character prompt packs

## What Is In This Repo

- Web app and API routes under [src](/home/hutamaadi/Desktop/coding/image-generator/src)
- D1 schema in [migrations/0001_initial.sql](/home/hutamaadi/Desktop/coding/image-generator/migrations/0001_initial.sql)
- RunPod inference worker in [runpod/bootstrap-generate](/home/hutamaadi/Desktop/coding/image-generator/runpod/bootstrap-generate)
- RunPod training worker in [runpod/train-lora](/home/hutamaadi/Desktop/coding/image-generator/runpod/train-lora)

## Quick Start

1. Install dependencies.
```bash
pnpm install
```

2. Run tests.
```bash
pnpm test
```

3. Build the app.
```bash
pnpm build
```

4. Deploy the Cloudflare Worker.
```bash
pnpm run deploy
```

## Cloudflare Setup

This repo expects these Cloudflare resources:

- one D1 database bound as `DB`
- one R2 bucket bound as `ARTIFACTS`
- one KV namespace bound as `SESSION`

This project is already configured in [wrangler.jsonc](/home/hutamaadi/Desktop/coding/image-generator/wrangler.jsonc) for:

- `DB` -> `image-generator-db`
- `ARTIFACTS` -> `image-generator-artifacts`
- `APP_BASE_URL` -> `https://image-generator.hutama39.workers.dev`
- `GEMINI_MODEL` -> `gemini-3-flash-preview`

Apply the database migration:

```bash
npx wrangler d1 migrations apply image-generator-db --remote
```

Generate Worker types any time you change `wrangler.jsonc`:

```bash
pnpm generate-types
```

## Secrets You Need In Cloudflare

Set these Worker secrets:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `GEMINI_API_KEY`
- `RUNPOD_API_KEY`
- `RUNPOD_BOOTSTRAP_ENDPOINT_ID`
- `RUNPOD_TRAIN_ENDPOINT_ID`
- `RUNPOD_WEBHOOK_SECRET`

Commands:

```bash
printf '%s' 'your-admin-user' | npx wrangler secret put ADMIN_USERNAME
printf '%s' 'your-admin-password' | npx wrangler secret put ADMIN_PASSWORD
printf '%s' 'your-gemini-key' | npx wrangler secret put GEMINI_API_KEY
printf '%s' 'your-runpod-api-key' | npx wrangler secret put RUNPOD_API_KEY
printf '%s' 'bootstrap-endpoint-id' | npx wrangler secret put RUNPOD_BOOTSTRAP_ENDPOINT_ID
printf '%s' 'train-endpoint-id' | npx wrangler secret put RUNPOD_TRAIN_ENDPOINT_ID
printf '%s' 'shared-webhook-secret' | npx wrangler secret put RUNPOD_WEBHOOK_SECRET
```

## Gemini Prompt Drafting

The Characters page can call Gemini to draft:

- tagline
- summary
- identity traits
- style tokens
- negative tokens
- prompt template
- negative prompt

It uses:

- model: `gemini-3-flash-preview`
- secret: `GEMINI_API_KEY`
- API route: `POST /api/characters/prompt`

Gemini output is validated against the same adult-only content policy used by the rest of the app.

## RunPod End-To-End Setup

This is the part that usually trips people up the first time. Follow it in this order.

### 1. Build And Push The Worker Images

You need two container images:

- `bootstrap-generate` for reference generation and final inference
- `train-lora` for LoRA training

Example with Docker Hub:

```bash
docker build -t your-dockerhub-user/character-forge-bootstrap:latest ./runpod/bootstrap-generate
docker build -t your-dockerhub-user/character-forge-train:latest ./runpod/train-lora

docker push your-dockerhub-user/character-forge-bootstrap:latest
docker push your-dockerhub-user/character-forge-train:latest
```

### 2. Create R2 S3 Credentials

Your RunPod workers do not talk to Cloudflare through Wrangler bindings. They need R2 S3 credentials.

Create:

- an R2 API token with read/write access to the artifacts bucket
- the S3 endpoint for your account

You will need these values in RunPod:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`

Typical endpoint format:

```text
https://<your-account-id>.r2.cloudflarestorage.com
```

### 3. Create The Bootstrap Endpoint In RunPod

In the RunPod dashboard:

1. Create a Serverless endpoint.
2. Choose `Import Git Repository`.
3. Select `hutamaadi9898/image-generation`.
4. Use branch `main`.
5. Set Dockerfile Path to `runpod/bootstrap-generate/Dockerfile`.
3. Give it enough GPU for SDXL inference.
4. Set these environment variables on the endpoint:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`
- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET`
- `HF_TOKEN` optional
- `SDXL_BASE_MODEL` optional

Recommended values:

- `APP_WEBHOOK_URL=https://image-generator.hutama39.workers.dev/api/runpod/webhook`
- `APP_WEBHOOK_SECRET=<same value as RUNPOD_WEBHOOK_SECRET in Cloudflare>`
- `SDXL_BASE_MODEL=stabilityai/stable-diffusion-xl-base-1.0`

Copy the RunPod endpoint ID. Put it into Cloudflare as `RUNPOD_BOOTSTRAP_ENDPOINT_ID`.

### 4. Create The Train Endpoint In RunPod

Create a second Serverless endpoint from the same GitHub repo:

1. Choose `Import Git Repository`.
2. Select `hutamaadi9898/image-generation`.
3. Use branch `main`.
4. Set Dockerfile Path to `runpod/train-lora/Dockerfile`.

Set these environment variables:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`
- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET`
- `HF_TOKEN` optional
- `TRAIN_RESOLUTION` optional

Recommended values:

- `APP_WEBHOOK_URL=https://image-generator.hutama39.workers.dev/api/runpod/webhook`
- `APP_WEBHOOK_SECRET=<same value as RUNPOD_WEBHOOK_SECRET in Cloudflare>`
- `TRAIN_RESOLUTION=1024`

Copy the endpoint ID. Put it into Cloudflare as `RUNPOD_TRAIN_ENDPOINT_ID`.

### 5. Add Your RunPod API Key To Cloudflare

Create a RunPod API key in the RunPod dashboard and store it in Cloudflare:

```bash
printf '%s' 'your-runpod-api-key' | npx wrangler secret put RUNPOD_API_KEY
```

### 6. Redeploy The App

After adding the new secrets:

```bash
pnpm run deploy
```

### 7. Test The Full Chain

Use this order:

1. Open `/characters`
2. Create a character
3. Use the Gemini button to draft the prompt fields
4. Save the character
5. Open the character page and start bootstrap generation
6. Approve enough references
7. Start training
8. Wait for the webhook to mark the LoRA version as ready
9. Open `/generate` and queue a generation job
10. Open `/gallery` to review outputs

## How Data Flows

### Bootstrap / Generate Worker

The bootstrap worker handles two job types:

- `bootstrap`
- `generate`

It should:

1. receive a RunPod job
2. generate images
3. upload them to R2
4. call the Cloudflare webhook

### Train Worker

The train worker should:

1. download approved training images from R2
2. train the SDXL LoRA
3. upload `lora.safetensors` and metadata back to R2
4. report completion back to the webhook

## Important Shared Values

These must line up between Cloudflare and RunPod:

- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET`
- R2 bucket name
- R2 S3 credentials
- RunPod endpoint IDs

If one side uses a different secret or wrong endpoint ID, jobs will submit but never complete correctly.

## Common Problems

### Prompt generation says Gemini is not configured

Set:

```bash
printf '%s' 'your-gemini-key' | npx wrangler secret put GEMINI_API_KEY
pnpm run deploy
```

### Bootstrap or training fails immediately

Usually one of these is wrong:

- `RUNPOD_API_KEY`
- `RUNPOD_BOOTSTRAP_ENDPOINT_ID`
- `RUNPOD_TRAIN_ENDPOINT_ID`
- RunPod endpoint image
- RunPod endpoint env vars

### RunPod job starts but Cloudflare never marks it complete

Check:

- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET`
- Cloudflare deploy URL
- RunPod worker logs

### RunPod worker cannot access R2

Check:

- `R2_ENDPOINT_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

## Useful Commands

```bash
pnpm test
pnpm build
pnpm run deploy
npx wrangler tail image-generator
npx wrangler secret list --name image-generator
npx wrangler d1 migrations apply image-generator-db --remote
```

## Official References

- Gemini text generation: https://ai.google.dev/gemini-api/docs/text-generation
- RunPod custom workers: https://docs.runpod.io/serverless/workers/custom-worker
- RunPod job operations: https://docs.runpod.io/serverless/endpoints/job-operations
- RunPod webhooks: https://docs.runpod.io/serverless/endpoints/webhooks
- Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/api/s3/api/
