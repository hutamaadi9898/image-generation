# Train LoRA Worker

This worker is the RunPod queue consumer for `train_lora` jobs.

Expected environment variables:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT_URL`
- `APP_WEBHOOK_URL`
- `APP_WEBHOOK_SECRET` (optional fallback)
- `HF_TOKEN` (optional, needed if the base model requires Hugging Face auth)
- `TRAIN_RESOLUTION` (optional, defaults to `1024`)

Current behavior:

- Validates the expected training payload.
- Downloads approved reference images from R2.
- Launches the official Hugging Face `train_dreambooth_lora_sdxl.py` script.
- Uploads the resulting `.safetensors` artifact back to R2.
- Calls the Astro webhook directly with completion metadata.

Production integration tasks:

1. Ensure the endpoint uses a GPU tier that can handle SDXL LoRA training.
2. Set `HF_TOKEN` if the base model cannot be downloaded anonymously.
3. Tune hyperparameters and `TRAIN_RESOLUTION` for your budget and VRAM target.
