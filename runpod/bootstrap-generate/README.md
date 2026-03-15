# Bootstrap / Generate Worker

This worker handles both `bootstrap` and `generate` inference jobs.

Expected environment variables:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`
- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET`
- `MOCK_RUNPOD`

Current behavior:

- Validates the incoming payload contract.
- Returns deterministic mock image metadata when `MOCK_RUNPOD=true`.
- Leaves the actual SDXL pipeline wiring as a single `run_inference()` integration point.

Production integration tasks:

1. Load the base SDXL model once at startup.
2. Apply a LoRA adapter for `generate` jobs when `loraArtifactKey` is present.
3. Upload generated images to R2.
4. Return `output.images[]` in the webhook-compatible schema used by the Astro app.
