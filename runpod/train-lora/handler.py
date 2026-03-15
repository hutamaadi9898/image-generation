from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3
import runpod

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HOME", "/tmp/huggingface")
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", "/tmp/huggingface/hub")
os.environ.setdefault("TRANSFORMERS_CACHE", "/tmp/huggingface/transformers")

if os.environ.get("HF_HUB_ENABLE_HF_TRANSFER") == "1":
    try:
        import hf_transfer  # noqa: F401
    except ImportError:
        os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"


TRAIN_SCRIPT_PATH = "/app/train_dreambooth_lora_sdxl.py"
DEFAULT_MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
DEFAULT_LOCAL_MODEL_PATH = "/opt/models/sdxl-base"


@dataclass
class TrainingConfig:
    artifact_bucket: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_endpoint_url: str
    r2_region: str
    webhook_url: str | None
    webhook_secret: str | None
    hf_token: str | None
    train_resolution: int
    train_script_path: str


def load_config() -> TrainingConfig:
    os.makedirs(os.environ["HF_HOME"], exist_ok=True)
    os.makedirs(os.environ["HUGGINGFACE_HUB_CACHE"], exist_ok=True)
    os.makedirs(os.environ["TRANSFORMERS_CACHE"], exist_ok=True)
    return TrainingConfig(
        artifact_bucket=os.environ.get("R2_BUCKET_NAME", ""),
        r2_access_key_id=os.environ.get("R2_ACCESS_KEY_ID", ""),
        r2_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY", ""),
        r2_endpoint_url=os.environ.get("R2_ENDPOINT_URL", ""),
        r2_region=os.environ.get("R2_REGION", "auto"),
        webhook_url=os.environ.get("APP_WEBHOOK_URL"),
        webhook_secret=os.environ.get("APP_WEBHOOK_SECRET"),
        hf_token=os.environ.get("HF_TOKEN"),
        train_resolution=int(os.environ.get("TRAIN_RESOLUTION", "1024")),
        train_script_path=os.environ.get("TRAIN_SCRIPT_PATH", TRAIN_SCRIPT_PATH),
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_job_input(job_input: dict[str, Any]) -> None:
    required = [
        "characterId",
        "characterSlug",
        "loraVersionId",
        "baseModelId",
        "approvedR2Keys",
        "outputPath",
        "instancePrompt",
    ]
    missing = [field for field in required if not job_input.get(field)]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")


def ensure_storage_config(config: TrainingConfig) -> None:
    require(bool(config.artifact_bucket), "R2_BUCKET_NAME is required.")
    require(bool(config.r2_access_key_id), "R2_ACCESS_KEY_ID is required.")
    require(bool(config.r2_secret_access_key), "R2_SECRET_ACCESS_KEY is required.")
    require(bool(config.r2_endpoint_url), "R2_ENDPOINT_URL is required.")


def get_s3_client(config: TrainingConfig):
    return boto3.client(
        "s3",
        endpoint_url=config.r2_endpoint_url,
        aws_access_key_id=config.r2_access_key_id,
        aws_secret_access_key=config.r2_secret_access_key,
        region_name=config.r2_region,
    )


def download_dataset(client, bucket: str, keys: list[str], destination: str) -> None:
    for index, key in enumerate(keys):
        suffix = Path(key).suffix or ".png"
        filename = os.path.join(destination, f"image-{index:04d}{suffix}")
        client.download_file(bucket, key, filename)


def upload_file(client, bucket: str, local_path: str, remote_key: str) -> None:
    with open(local_path, "rb") as handle:
        client.put_object(
            Bucket=bucket,
            Key=remote_key,
            Body=handle.read(),
            ContentType="application/octet-stream",
        )


def resolve_model_source(model_id: str) -> str:
    local_model_path = os.environ.get("LOCAL_SDXL_MODEL_PATH", DEFAULT_LOCAL_MODEL_PATH)
    normalized = model_id.strip()
    if os.path.exists(local_model_path) and normalized in {DEFAULT_MODEL_ID, local_model_path}:
        return local_model_path
    return model_id


def send_callback(
    config: TrainingConfig,
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
        "type": str(job_input.get("type") or "train_lora"),
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


def build_training_command(
    config: TrainingConfig,
    job_input: dict[str, Any],
    dataset_dir: str,
    output_dir: str,
) -> list[str]:
    hyperparameters = job_input.get("hyperparameters", {}) or {}
    model_source = resolve_model_source(str(job_input["baseModelId"]))
    return [
        sys.executable,
        config.train_script_path,
        "--pretrained_model_name_or_path",
        model_source,
        "--instance_data_dir",
        dataset_dir,
        "--output_dir",
        output_dir,
        "--instance_prompt",
        str(job_input["instancePrompt"]),
        "--resolution",
        str(config.train_resolution),
        "--train_batch_size",
        "1",
        "--gradient_accumulation_steps",
        "1",
        "--max_train_steps",
        str(int(hyperparameters.get("steps") or 1200)),
        "--learning_rate",
        str(float(hyperparameters.get("learningRate") or 0.0001)),
        "--rank",
        str(int(hyperparameters.get("rank") or 16)),
        "--lr_scheduler",
        "constant",
        "--lr_warmup_steps",
        "0",
        "--gradient_checkpointing",
        "--center_crop",
        "--report_to",
        "none",
        "--mixed_precision",
        "fp16",
        "--seed",
        "42",
    ]


def find_lora_artifact(output_dir: str) -> str:
    direct_path = os.path.join(output_dir, "pytorch_lora_weights.safetensors")
    if os.path.exists(direct_path):
        return direct_path

    candidates = glob.glob(os.path.join(output_dir, "*.safetensors"))
    require(bool(candidates), "Training completed without producing a .safetensors artifact.")
    return candidates[0]


def run_training(job_input: dict[str, Any], config: TrainingConfig) -> dict[str, Any]:
    ensure_storage_config(config)
    require(os.path.exists(config.train_script_path), f"Training script not found at {config.train_script_path}.")

    client = get_s3_client(config)
    approved_keys = [str(item) for item in (job_input.get("approvedR2Keys") or [])]
    require(bool(approved_keys), "`approvedR2Keys` must not be empty.")

    with tempfile.TemporaryDirectory() as tmpdir:
        dataset_dir = os.path.join(tmpdir, "dataset")
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(dataset_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        download_dataset(client, config.artifact_bucket, approved_keys, dataset_dir)
        command = build_training_command(config, job_input, dataset_dir, output_dir)

        env = os.environ.copy()
        if config.hf_token:
            env["HF_TOKEN"] = config.hf_token

        result = subprocess.run(command, capture_output=True, text=True, env=env, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                "LoRA training failed.\n"
                f"stdout:\n{result.stdout[-4000:]}\n"
                f"stderr:\n{result.stderr[-4000:]}"
            )

        artifact_path = find_lora_artifact(output_dir)
        output_key = str(job_input["outputPath"])
        upload_file(client, config.artifact_bucket, artifact_path, output_key)

        metadata = {
            "baseModelId": str(job_input["baseModelId"]),
            "approvedImageCount": len(approved_keys),
            "instancePrompt": str(job_input["instancePrompt"]),
            "hyperparameters": job_input.get("hyperparameters", {}),
            "resolution": config.train_resolution,
            "artifactFilename": os.path.basename(artifact_path),
        }
        return {"artifactR2Key": output_key, "metadata": metadata}


def handler(job: dict[str, Any]) -> dict[str, Any]:
    config = load_config()
    job_input = job.get("input", {}) or {}
    provider_event_id = str(job.get("id") or "")
    validate_job_input(job_input)

    try:
        output = run_training(job_input, config)
        send_callback(config, job_input, "COMPLETED", provider_event_id, output=output)
        return {"ok": True, "output": output}
    except Exception as exc:  # noqa: BLE001
        send_callback(config, job_input, "FAILED", provider_event_id, error=str(exc))
        raise


runpod.serverless.start({"handler": handler})
