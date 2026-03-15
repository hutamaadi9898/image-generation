# Character Forge

Private Astro + Cloudflare control plane for:

- creating original adult-only character profiles
- curating reference images
- training SDXL LoRA versions on a dedicated training Pod
- generating final images through a ComfyUI Pod

The app also supports Gemini-assisted prompt drafting from the Characters page.

## Stack

- Astro SSR on Cloudflare Workers
- Cloudflare D1 for metadata and job state
- Cloudflare R2 for datasets, generations, and LoRA artifacts
- RunPod Pod with ComfyUI for bootstrap generation and final inference
- RunPod Pod with a small training API for LoRA jobs
- Gemini for drafting character prompt packs

## Repo Layout

- App and API routes: [src](/home/hutamaadi/Desktop/coding/image-generator/src)
- D1 schema: [migrations/0001_initial.sql](/home/hutamaadi/Desktop/coding/image-generator/migrations/0001_initial.sql)
- Training Pod service: [pods/train-service](/home/hutamaadi/Desktop/coding/image-generator/pods/train-service)
- Legacy serverless workers: [runpod](/home/hutamaadi/Desktop/coding/image-generator/runpod)

## Cloudflare Setup

Required bindings:

- `DB` -> D1
- `ARTIFACTS` -> R2
- `SESSION` -> KV

This repo is already configured in [wrangler.jsonc](/home/hutamaadi/Desktop/coding/image-generator/wrangler.jsonc) for:

- `DB` -> `image-generator-db`
- `ARTIFACTS` -> `image-generator-artifacts`
- `APP_BASE_URL` -> `https://image-generator.hutama39.workers.dev`
- `JOB_STATUS_POLL_ENABLED` -> `true`
- `GEMINI_MODEL` -> `gemini-3-flash-preview`

Apply the migration:

```bash
npx wrangler d1 migrations apply image-generator-db --remote
```

Regenerate Worker types after config changes:

```bash
pnpm generate-types
```

## Cloudflare Secrets

Set these Worker secrets:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `GEMINI_API_KEY`
- `COMFYUI_BASE_URL`
- `COMFYUI_BEARER_TOKEN` optional
- `COMFYUI_CHECKPOINT_FILENAME`
- `TRAIN_POD_BASE_URL`
- `TRAIN_POD_BEARER_TOKEN` optional

Commands:

```bash
printf '%s' 'your-admin-user' | npx wrangler secret put ADMIN_USERNAME
printf '%s' 'your-admin-password' | npx wrangler secret put ADMIN_PASSWORD
printf '%s' 'your-gemini-key' | npx wrangler secret put GEMINI_API_KEY
printf '%s' 'https://your-comfyui-pod-url' | npx wrangler secret put COMFYUI_BASE_URL
printf '%s' 'your-comfyui-token' | npx wrangler secret put COMFYUI_BEARER_TOKEN
printf '%s' 'your-checkpoint-filename.safetensors' | npx wrangler secret put COMFYUI_CHECKPOINT_FILENAME
printf '%s' 'https://your-train-pod-url' | npx wrangler secret put TRAIN_POD_BASE_URL
printf '%s' 'your-train-pod-token' | npx wrangler secret put TRAIN_POD_BEARER_TOKEN
```

## Recommended ComfyUI Checkpoint

Recommended starting checkpoint for anime-heavy NSFW styling:

- `Pony Diffusion V6 XL` from Civitai

This is an inference based on its continuing popularity in the anime/NSFW ComfyUI ecosystem, not a permanent truth. The app does not hardcode a filename. You must:

1. Download the checkpoint you want from Civitai onto the ComfyUI Pod.
2. Put it in `ComfyUI/models/checkpoints/`.
3. Set `COMFYUI_CHECKPOINT_FILENAME` to the exact filename on disk.

Example:

```text
COMFYUI_CHECKPOINT_FILENAME=ponyDiffusionV6XL_v6StartWithThisOne.safetensors
```

If you use a different checkpoint, only the filename secret needs to change.

## Pod Architecture

This repo now assumes two Pods:

1. ComfyUI Pod
Used for:
- bootstrap reference image generation
- final image generation

Cloudflare queues prompts to ComfyUI with:
- `POST /prompt`
- polling `GET /history/{prompt_id}`
- downloading images from `GET /view`

Cloudflare then stores the finished images in R2 and updates D1 job state.

2. Training Pod
Used for:
- LoRA training jobs

Cloudflare talks to the small API defined in [pods/train-service/server.py](/home/hutamaadi/Desktop/coding/image-generator/pods/train-service/server.py):

- `POST /jobs`
- `GET /jobs/{id}`

The training Pod downloads approved dataset images from R2, runs DreamBooth LoRA training, uploads the final `.safetensors` artifact back to R2, and Cloudflare polls for completion.

## ComfyUI Pod Setup

Create a RunPod Pod using a ComfyUI template or your own ComfyUI image.

Requirements:

- ComfyUI reachable over HTTP
- the ComfyUI API exposed
- your chosen checkpoint placed in `models/checkpoints/`
- generated LoRAs placed in `models/loras/`

Set these Pod-side env vars only if you protect the Pod with a bearer token:

- `COMFYUI_BEARER_TOKEN`

Then set the Worker secrets:

- `COMFYUI_BASE_URL=https://<your-comfyui-pod-host>`
- `COMFYUI_CHECKPOINT_FILENAME=<exact checkpoint filename>`

## Training Pod Setup

Build the training API image from this repo:

```bash
docker build -t your-user/character-forge-train-pod:latest ./pods/train-service
docker push your-user/character-forge-train-pod:latest
```

Run a Pod from that image and expose port `8000`.

Set these env vars on the training Pod:

- `R2_BUCKET_NAME=image-generator-artifacts`
- `R2_ACCESS_KEY_ID=<cloudflare-r2-access-key-id>`
- `R2_SECRET_ACCESS_KEY=<cloudflare-r2-secret-access-key>`
- `R2_ENDPOINT_URL=https://<your-account-id>.r2.cloudflarestorage.com`
- `TRAIN_POD_BEARER_TOKEN=<optional shared bearer token>`
- `HF_TOKEN=<optional if your base model requires auth>`
- `TRAIN_RESOLUTION=1024`

Then set the Worker secret:

```bash
printf '%s' 'https://your-training-pod-url' | npx wrangler secret put TRAIN_POD_BASE_URL
```

If you use bearer auth:

```bash
printf '%s' 'your-train-pod-token' | npx wrangler secret put TRAIN_POD_BEARER_TOKEN
```

## Important LoRA Sync Step

ComfyUI can load a LoRA only if the `.safetensors` file exists locally in `models/loras/`.

This repo does not yet auto-copy the trained LoRA from R2 into the ComfyUI Pod.

Current workflow:

1. Train a version from the character page.
2. Wait for the training job to finish and upload the artifact to R2.
3. Copy that `.safetensors` file into the ComfyUI Pod `models/loras/` directory using the same filename.
4. Open `/generate` and choose that ready version.

The app expects the LoRA filename on the ComfyUI Pod to match the basename of the stored R2 key.

Example artifact key:

```text
mara-vale/v3/mara-vale-v3.safetensors
```

Expected ComfyUI filename:

```text
mara-vale-v3.safetensors
```

## End-To-End Flow

1. Create or edit a character on `/characters`
2. Use Gemini prompt drafting if needed
3. Open the character page and launch bootstrap generation
4. Review references and approve at least 20 images
5. Launch training from the character page
6. Wait for the training Pod to finish and upload the LoRA to R2
7. Copy the LoRA file into the ComfyUI Pod `models/loras/`
8. Open `/generate`
9. Choose the ready version and queue generation
10. Cloudflare polls ComfyUI history and writes final images to R2

## Local Commands

Install:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
```

Build:

```bash
pnpm build
```

Deploy:

```bash
pnpm run deploy
```

## Troubleshooting

### ComfyUI Pod is reachable but generation never completes

Check:

- `COMFYUI_BASE_URL`
- the Pod HTTP service is exposed
- the checkpoint filename matches exactly
- the LoRA filename exists in `models/loras/`

### Training completes but generation fails on missing LoRA

The Worker only knows the artifact key in R2. ComfyUI still needs the same file on local disk.

Copy the file into:

```text
ComfyUI/models/loras/
```

### Prompt generation says Gemini is not configured

Set:

- `GEMINI_API_KEY`

### Jobs stay queued or running forever

Check:

- `JOB_STATUS_POLL_ENABLED`
- ComfyUI Pod `/history/{prompt_id}` responds
- Training Pod `/jobs/{id}` responds

## Current Limitations

- LoRA sync from R2 into the ComfyUI Pod is still manual.
- The legacy `runpod/` serverless workers remain in the repo but are no longer the recommended path.
- The app keeps the historical `runpodEndpointId` and `runpodJobId` database columns to avoid a migration, even though Pod URLs and Pod job ids are now used there.

## References

- Gemini text generation: https://ai.google.dev/gemini-api/docs/text-generation
- RunPod Pod overview: https://docs.runpod.io/pods/overview
- RunPod Pod pricing: https://docs.runpod.io/pods/pricing
- RunPod ComfyUI on Pods: https://docs.runpod.io/tutorials/serverless/comfyui
- ComfyUI API example: https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/basic_api_example.py
- ComfyUI websocket/history example: https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example.py
