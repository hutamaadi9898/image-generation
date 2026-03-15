from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import runpod


@dataclass
class InferenceConfig:
    artifact_bucket: str
    webhook_url: str | None
    webhook_secret: str | None
    mock_mode: bool


def load_config() -> InferenceConfig:
    return InferenceConfig(
        artifact_bucket=os.environ.get("R2_BUCKET_NAME", ""),
        webhook_url=os.environ.get("APP_WEBHOOK_URL"),
        webhook_secret=os.environ.get("APP_WEBHOOK_SECRET"),
        mock_mode=os.environ.get("MOCK_RUNPOD", "false").lower() == "true",
    )


def validate_job_input(job_input: dict[str, Any]) -> None:
    job_type = job_input.get("type")
    if job_type not in {"bootstrap", "generate"}:
        raise ValueError("`type` must be `bootstrap` or `generate`.")

    if not job_input.get("seeds"):
        raise ValueError("At least one seed is required.")

    if job_type == "bootstrap" and not job_input.get("promptProfile"):
        raise ValueError("Bootstrap jobs require `promptProfile`.")

    if job_type == "generate" and not job_input.get("loraArtifactKey"):
        raise ValueError("Generate jobs require `loraArtifactKey`.")


def make_mock_images(job_input: dict[str, Any]) -> list[dict[str, Any]]:
    prefix = job_input.get("outputPrefix", "mock/output")
    prompt = job_input.get("promptTemplate") or job_input.get("promptProfile", {}).get("promptTemplate", "")
    return [
        {
            "r2Key": f"{prefix}/seed-{seed}.png",
            "seed": seed,
            "promptSnapshot": prompt,
            "width": 1024,
            "height": 1365,
        }
        for seed in job_input["seeds"]
    ]


def run_inference(job_input: dict[str, Any], config: InferenceConfig) -> dict[str, Any]:
    if config.mock_mode:
        return {"images": make_mock_images(job_input)}

    raise NotImplementedError(
        "Hook this worker up to SDXL inference, upload outputs to R2, and return generated keys."
    )


def handler(job: dict[str, Any]) -> dict[str, Any]:
    config = load_config()
    job_input = job.get("input", {})
    validate_job_input(job_input)
    output = run_inference(job_input, config)
    return {"ok": True, "output": output}


runpod.serverless.start({"handler": handler})
