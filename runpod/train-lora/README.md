# Train LoRA Worker

This worker is the RunPod queue consumer for `train_lora` jobs.

Expected environment variables:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`
- `APP_WEBHOOK_SECRET`
- `MOCK_RUNPOD`

Current behavior:

- Validates the expected training payload.
- Returns deterministic metadata when `MOCK_RUNPOD=true`.
- Leaves a single `run_training()` integration point for the diffusers SDXL DreamBooth LoRA flow.

Production integration tasks:

1. Download approved dataset keys from R2 into local scratch storage.
2. Launch the SDXL DreamBooth LoRA training script with the provided hyperparameters.
3. Upload `lora.safetensors` plus JSON metadata back to R2.
4. Return `output.artifactR2Key` and `output.metadata` so the Astro webhook can finalize the version row.
