from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import runpod


@dataclass
class TrainingConfig:
    mock_mode: bool
    callback_secret: str | None


def load_config() -> TrainingConfig:
    return TrainingConfig(
        mock_mode=os.environ.get("MOCK_RUNPOD", "false").lower() == "true",
        callback_secret=os.environ.get("APP_WEBHOOK_SECRET"),
    )


def validate_job_input(job_input: dict[str, Any]) -> None:
    required = ["characterId", "loraVersionId", "baseModelId", "approvedR2Keys", "outputPath"]
    missing = [field for field in required if not job_input.get(field)]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")


def run_training(job_input: dict[str, Any], config: TrainingConfig) -> dict[str, Any]:
    if config.mock_mode:
        return {
            "artifactR2Key": job_input["outputPath"],
            "metadata": {
                "baseModelId": job_input["baseModelId"],
                "approvedImageCount": len(job_input["approvedR2Keys"]),
                "hyperparameters": job_input.get("hyperparameters", {}),
            },
        }

    raise NotImplementedError(
        "Hook this worker up to the diffusers SDXL DreamBooth LoRA training script and upload the final safetensors artifact to R2."
    )


def handler(job: dict[str, Any]) -> dict[str, Any]:
    config = load_config()
    job_input = job.get("input", {})
    validate_job_input(job_input)
    output = run_training(job_input, config)
    return {"ok": True, "output": output}


runpod.serverless.start({"handler": handler})
