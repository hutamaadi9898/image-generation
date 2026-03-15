from __future__ import annotations

import glob
import os
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any

import boto3
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel


os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HOME", "/workspace/huggingface")
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", "/workspace/huggingface/hub")
os.environ.setdefault("TRANSFORMERS_CACHE", "/workspace/huggingface/transformers")

TRAIN_SCRIPT_PATH = "/app/train_dreambooth_lora_sdxl.py"
DEFAULT_MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
DEFAULT_LOCAL_MODEL_PATH = "/workspace/models/sdxl-base"

app = FastAPI()
JOBS: dict[str, dict[str, Any]] = {}


class Hyperparameters(BaseModel):
    rank: int = 16
    learningRate: float = 0.0001
    steps: int = 1200


class TrainingJobInput(BaseModel):
    type: str = "train_lora"
    characterId: str
    characterSlug: str
    loraVersionId: str
    baseModelId: str
    approvedR2Keys: list[str]
    outputPath: str
    instancePrompt: str
    hyperparameters: Hyperparameters


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def require_auth(authorization: str | None) -> None:
    expected = os.environ.get("TRAIN_POD_BEARER_TOKEN")
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("R2_ENDPOINT_URL", ""),
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID", ""),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY", ""),
        region_name=os.environ.get("R2_REGION", "auto"),
    )


def artifact_bucket() -> str:
    bucket = os.environ.get("R2_BUCKET_NAME", "")
    require(bool(bucket), "R2_BUCKET_NAME is required.")
    require(bool(os.environ.get("R2_ACCESS_KEY_ID")), "R2_ACCESS_KEY_ID is required.")
    require(bool(os.environ.get("R2_SECRET_ACCESS_KEY")), "R2_SECRET_ACCESS_KEY is required.")
    require(bool(os.environ.get("R2_ENDPOINT_URL")), "R2_ENDPOINT_URL is required.")
    return bucket


def resolve_model_source(model_id: str) -> str:
    local_model_path = os.environ.get("LOCAL_SDXL_MODEL_PATH", DEFAULT_LOCAL_MODEL_PATH)
    if os.path.exists(local_model_path) and model_id.strip() in {DEFAULT_MODEL_ID, local_model_path}:
        return local_model_path
    return model_id


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


def find_lora_artifact(output_dir: str) -> str:
    direct_path = os.path.join(output_dir, "pytorch_lora_weights.safetensors")
    if os.path.exists(direct_path):
        return direct_path

    candidates = glob.glob(os.path.join(output_dir, "*.safetensors"))
    require(bool(candidates), "Training completed without producing a .safetensors artifact.")
    return candidates[0]


def build_training_command(job_input: TrainingJobInput, dataset_dir: str, output_dir: str) -> list[str]:
    hp = job_input.hyperparameters
    model_source = resolve_model_source(job_input.baseModelId)
    return [
        sys.executable,
        TRAIN_SCRIPT_PATH,
        "--pretrained_model_name_or_path",
        model_source,
        "--instance_data_dir",
        dataset_dir,
        "--output_dir",
        output_dir,
        "--instance_prompt",
        job_input.instancePrompt,
        "--resolution",
        str(int(os.environ.get("TRAIN_RESOLUTION", "1024"))),
        "--train_batch_size",
        "1",
        "--gradient_accumulation_steps",
        "1",
        "--max_train_steps",
        str(hp.steps),
        "--learning_rate",
        str(hp.learningRate),
        "--rank",
        str(hp.rank),
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


def run_training(job_id: str, job_input: TrainingJobInput) -> None:
    JOBS[job_id]["status"] = "RUNNING"
    bucket = artifact_bucket()
    client = get_s3_client()
    require(bool(job_input.approvedR2Keys), "`approvedR2Keys` must not be empty.")

    with tempfile.TemporaryDirectory() as tmpdir:
        dataset_dir = os.path.join(tmpdir, "dataset")
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(dataset_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        download_dataset(client, bucket, job_input.approvedR2Keys, dataset_dir)
        command = build_training_command(job_input, dataset_dir, output_dir)

        env = os.environ.copy()
        if os.environ.get("HF_TOKEN"):
          env["HF_TOKEN"] = os.environ["HF_TOKEN"]

        result = subprocess.run(command, capture_output=True, text=True, env=env, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                "LoRA training failed.\n"
                f"stdout:\n{result.stdout[-4000:]}\n"
                f"stderr:\n{result.stderr[-4000:]}"
            )

        artifact_path = find_lora_artifact(output_dir)
        upload_file(client, bucket, artifact_path, job_input.outputPath)

        JOBS[job_id]["status"] = "COMPLETED"
        JOBS[job_id]["output"] = {
            "artifactR2Key": job_input.outputPath,
            "metadata": {
                "baseModelId": job_input.baseModelId,
                "approvedImageCount": len(job_input.approvedR2Keys),
                "instancePrompt": job_input.instancePrompt,
                "hyperparameters": job_input.hyperparameters.model_dump(),
                "artifactFilename": os.path.basename(artifact_path),
            },
        }


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/jobs")
def create_job(job_input: TrainingJobInput, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"id": job_id, "status": "QUEUED", "output": None, "error": None}

    def target() -> None:
        try:
            run_training(job_id, job_input)
        except Exception as exc:  # noqa: BLE001
            JOBS[job_id]["status"] = "FAILED"
            JOBS[job_id]["error"] = str(exc)

    threading.Thread(target=target, daemon=True).start()
    return {"id": job_id, "status": "QUEUED"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]
