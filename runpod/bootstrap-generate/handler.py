from __future__ import annotations

import io
import json
import os
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

import boto3
import runpod
import torch

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HOME", "/tmp/huggingface")
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", "/tmp/huggingface/hub")
os.environ.setdefault("TRANSFORMERS_CACHE", "/tmp/huggingface/transformers")

if os.environ.get("HF_HUB_ENABLE_HF_TRANSFER") == "1":
    try:
        import hf_transfer  # noqa: F401
    except ImportError:
        os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"

from diffusers import StableDiffusionXLPipeline
from PIL import Image


DEFAULT_MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
DEFAULT_LOCAL_MODEL_PATH = "/opt/models/sdxl-base"
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "3:4": (1024, 1344),
    "16:9": (1344, 768),
}

PIPELINE: StableDiffusionXLPipeline | None = None
PIPELINE_MODEL_ID: str | None = None
PIPELINE_LORA_KEY: str | None = None


@dataclass
class InferenceConfig:
    artifact_bucket: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_endpoint_url: str
    r2_region: str
    webhook_url: str | None
    webhook_secret: str | None
    default_model_id: str
    hf_token: str | None
    bootstrap_steps: int
    generate_steps: int
    bootstrap_guidance: float
    generate_guidance: float
    device: str


def load_config() -> InferenceConfig:
    os.makedirs(os.environ["HF_HOME"], exist_ok=True)
    os.makedirs(os.environ["HUGGINGFACE_HUB_CACHE"], exist_ok=True)
    os.makedirs(os.environ["TRANSFORMERS_CACHE"], exist_ok=True)
    return InferenceConfig(
        artifact_bucket=os.environ.get("R2_BUCKET_NAME", ""),
        r2_access_key_id=os.environ.get("R2_ACCESS_KEY_ID", ""),
        r2_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY", ""),
        r2_endpoint_url=os.environ.get("R2_ENDPOINT_URL", ""),
        r2_region=os.environ.get("R2_REGION", "auto"),
        webhook_url=os.environ.get("APP_WEBHOOK_URL"),
        webhook_secret=os.environ.get("APP_WEBHOOK_SECRET"),
        default_model_id=os.environ.get("SDXL_BASE_MODEL", DEFAULT_MODEL_ID),
        hf_token=os.environ.get("HF_TOKEN"),
        bootstrap_steps=int(os.environ.get("BOOTSTRAP_INFERENCE_STEPS", "30")),
        generate_steps=int(os.environ.get("GENERATE_INFERENCE_STEPS", "32")),
        bootstrap_guidance=float(os.environ.get("BOOTSTRAP_GUIDANCE_SCALE", "7.5")),
        generate_guidance=float(os.environ.get("GENERATE_GUIDANCE_SCALE", "7.0")),
        device="cuda" if torch.cuda.is_available() else "cpu",
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_job_input(job_input: dict[str, Any]) -> None:
    job_type = str(job_input.get("type") or "")
    require(job_type in {"bootstrap", "generate"}, "`type` must be `bootstrap` or `generate`.")
    require(bool(job_input.get("seeds")), "At least one seed is required.")
    require(bool(job_input.get("outputPrefix")), "`outputPrefix` is required.")

    if job_type == "bootstrap":
        require(bool(job_input.get("promptProfile")), "Bootstrap jobs require `promptProfile`.")
        require(int(job_input.get("targetCount") or 0) > 0, "Bootstrap jobs require `targetCount`.")

    if job_type == "generate":
        require(bool(job_input.get("loraArtifactKey")), "Generate jobs require `loraArtifactKey`.")
        require(int(job_input.get("imageCount") or 0) > 0, "Generate jobs require `imageCount`.")


def get_s3_client(config: InferenceConfig):
    return boto3.client(
        "s3",
        endpoint_url=config.r2_endpoint_url,
        aws_access_key_id=config.r2_access_key_id,
        aws_secret_access_key=config.r2_secret_access_key,
        region_name=config.r2_region,
    )


def ensure_storage_config(config: InferenceConfig) -> None:
    require(bool(config.artifact_bucket), "R2_BUCKET_NAME is required.")
    require(bool(config.r2_access_key_id), "R2_ACCESS_KEY_ID is required.")
    require(bool(config.r2_secret_access_key), "R2_SECRET_ACCESS_KEY is required.")
    require(bool(config.r2_endpoint_url), "R2_ENDPOINT_URL is required.")


def collapse_parts(parts: list[str]) -> str:
    return ", ".join(part.strip() for part in parts if part and str(part).strip())


def resolve_model_source(model_id: str, fallback_model_id: str) -> str:
    local_model_path = os.environ.get("LOCAL_SDXL_MODEL_PATH", DEFAULT_LOCAL_MODEL_PATH)
    if not os.path.exists(local_model_path):
        return model_id

    normalized = model_id.strip()
    fallback = fallback_model_id.strip()
    if normalized in {DEFAULT_MODEL_ID, fallback, local_model_path}:
        return local_model_path

    return model_id


def build_bootstrap_prompt(job_input: dict[str, Any]) -> tuple[str, str]:
    character = job_input.get("character", {}) or {}
    prompt_profile = job_input.get("promptProfile", {}) or {}
    prompt = collapse_parts(
        [
            str(prompt_profile.get("promptTemplate") or ""),
            str(character.get("name") or ""),
            str(character.get("tagline") or ""),
            *(str(item) for item in (character.get("identityTraits") or [])),
            str(character.get("summary") or ""),
            str(character.get("outfitNotes") or ""),
            *(str(item) for item in (prompt_profile.get("styleTokens") or [])),
        ]
    )
    negative = collapse_parts(
        [
            str(prompt_profile.get("negativePrompt") or ""),
            "low quality",
            "blurry",
            "text",
            "watermark",
            "deformed",
            "extra limbs",
        ]
    )
    return prompt, negative


def build_generate_prompt(job_input: dict[str, Any]) -> tuple[str, str]:
    prompt = collapse_parts(
        [
            str(job_input.get("promptTemplate") or ""),
            *(str(item) for item in (job_input.get("styleTokens") or [])),
        ]
    )
    negative = collapse_parts(
        [
            str(job_input.get("negativePrompt") or ""),
            "low quality",
            "text",
            "watermark",
            "deformed",
        ]
    )
    return prompt, negative


def expand_seeds(seeds: list[Any], target_count: int) -> list[int]:
    source = [int(seed) for seed in seeds]
    expanded: list[int] = []
    for index in range(target_count):
        base = source[index % len(source)]
        offset = (index // len(source)) * 100_003
        expanded.append(base + offset)
    return expanded


def dimensions_for(job_input: dict[str, Any]) -> tuple[int, int]:
    if str(job_input.get("type")) == "bootstrap":
        return ASPECT_RATIOS["3:4"]
    aspect_ratio = str(job_input.get("aspectRatio") or "3:4")
    return ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])


def upload_png(client, bucket: str, key: str, image: Image.Image) -> None:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    client.put_object(Bucket=bucket, Key=key, Body=buffer.getvalue(), ContentType="image/png")


def download_r2_object(client, bucket: str, key: str, destination: str) -> None:
    client.download_file(bucket, key, destination)


def get_pipeline(config: InferenceConfig, model_id: str) -> StableDiffusionXLPipeline:
    global PIPELINE, PIPELINE_MODEL_ID, PIPELINE_LORA_KEY

    if PIPELINE is None or PIPELINE_MODEL_ID != model_id:
        torch_dtype = torch.float16 if config.device == "cuda" else torch.float32
        PIPELINE = StableDiffusionXLPipeline.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            use_safetensors=True,
            token=config.hf_token,
        )
        PIPELINE.set_progress_bar_config(disable=True)
        if config.device == "cuda":
            PIPELINE = PIPELINE.to("cuda")
        PIPELINE_MODEL_ID = model_id
        PIPELINE_LORA_KEY = None

    return PIPELINE


def ensure_lora_loaded(client, config: InferenceConfig, pipeline: StableDiffusionXLPipeline, lora_key: str | None) -> None:
    global PIPELINE_LORA_KEY

    if PIPELINE_LORA_KEY == lora_key:
        return

    unload = getattr(pipeline, "unload_lora_weights", None)
    if callable(unload):
        unload()
    PIPELINE_LORA_KEY = None

    if not lora_key:
        return

    with tempfile.TemporaryDirectory() as tmpdir:
        local_path = os.path.join(tmpdir, os.path.basename(lora_key))
        download_r2_object(client, config.artifact_bucket, lora_key, local_path)
        pipeline.load_lora_weights(tmpdir, weight_name=os.path.basename(local_path), adapter_name="character")
        set_adapters = getattr(pipeline, "set_adapters", None)
        if callable(set_adapters):
            set_adapters(["character"], adapter_weights=[1.0])
    PIPELINE_LORA_KEY = lora_key


def send_callback(
    config: InferenceConfig,
    job_input: dict[str, Any],
    status: str,
    provider_event_id: str | None,
    output: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    callback = job_input.get("callback", {}) or {}
    internal_job_id = str(callback.get("internalJobId") or "")
    webhook_secret = str(callback.get("webhookSecret") or config.webhook_secret or "")
    if not config.webhook_url or not internal_job_id or not webhook_secret:
        return

    payload = {
        "jobId": internal_job_id,
        "type": str(job_input.get("type") or "generate"),
        "status": status,
        "output": output,
        "error": error,
        "providerEventId": provider_event_id,
    }

    request = urllib.request.Request(
        config.webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-runpod-webhook-secret": webhook_secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20):
            return
    except urllib.error.URLError as exc:
        print(f"Webhook callback failed: {exc}")


def run_inference(job_input: dict[str, Any], config: InferenceConfig) -> dict[str, Any]:
    ensure_storage_config(config)
    client = get_s3_client(config)

    if str(job_input.get("type")) == "bootstrap":
        target_count = int(job_input.get("targetCount") or 1)
        seeds = expand_seeds(list(job_input.get("seeds") or []), target_count)
        prompt, negative_prompt = build_bootstrap_prompt(job_input)
        lora_key = None
        steps = config.bootstrap_steps
        guidance_scale = config.bootstrap_guidance
    else:
        image_count = int(job_input.get("imageCount") or len(job_input.get("seeds") or []))
        seeds = expand_seeds(list(job_input.get("seeds") or []), image_count)[:image_count]
        prompt, negative_prompt = build_generate_prompt(job_input)
        lora_key = str(job_input.get("loraArtifactKey") or "")
        steps = config.generate_steps
        guidance_scale = config.generate_guidance

    width, height = dimensions_for(job_input)
    output_prefix = str(job_input.get("outputPrefix"))
    requested_model_id = str(job_input.get("baseModelId") or config.default_model_id)
    model_id = resolve_model_source(requested_model_id, config.default_model_id)
    pipeline = get_pipeline(config, model_id)
    ensure_lora_loaded(client, config, pipeline, lora_key)

    images: list[dict[str, Any]] = []
    for seed in seeds:
        generator = torch.Generator(device=config.device).manual_seed(int(seed))
        with torch.inference_mode():
            result = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                width=width,
                height=height,
                generator=generator,
            )
        image = result.images[0]
        key = f"{output_prefix}/seed-{seed}.png"
        upload_png(client, config.artifact_bucket, key, image)
        images.append(
            {
                "r2Key": key,
                "seed": int(seed),
                "promptSnapshot": prompt,
                "width": width,
                "height": height,
            }
        )

    return {"images": images}


def handler(job: dict[str, Any]) -> dict[str, Any]:
    config = load_config()
    job_input = job.get("input", {}) or {}
    provider_event_id = str(job.get("id") or "")
    validate_job_input(job_input)

    try:
        output = run_inference(job_input, config)
        send_callback(config, job_input, "COMPLETED", provider_event_id, output=output)
        return {"ok": True, "output": output}
    except Exception as exc:  # noqa: BLE001
        send_callback(config, job_input, "FAILED", provider_event_id, error=str(exc))
        raise


runpod.serverless.start({"handler": handler})
