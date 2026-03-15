# Bootstrap / Generate Worker

This worker handles both `bootstrap` and `generate` inference jobs.

Expected environment variables:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`
- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET` (optional fallback)
- `SDXL_BASE_MODEL` (optional, defaults to `stabilityai/stable-diffusion-xl-base-1.0`)
- `HF_TOKEN` (optional, needed if the base model requires Hugging Face auth)

Current behavior:

- Validates the incoming payload contract.
- Loads SDXL on first request and reuses it across warm jobs.
- Downloads LoRA weights from R2 for `generate` jobs.
- Uploads generated PNG files back to R2.
- Calls the Astro webhook directly with the internal job id and completion payload.

Production integration tasks:

1. Set the endpoint GPU class high enough for SDXL.
2. Provide valid R2 credentials and `APP_WEBHOOK_URL`.
3. Set `HF_TOKEN` if your chosen base model is gated.
