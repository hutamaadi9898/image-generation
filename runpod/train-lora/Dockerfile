FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

WORKDIR /app

ENV HF_HUB_DISABLE_XET=1
ENV HF_HUB_ENABLE_HF_TRANSFER=0
ENV HF_HOME=/opt/huggingface
ENV HUGGINGFACE_HUB_CACHE=/opt/huggingface/hub
ENV TRANSFORMERS_CACHE=/opt/huggingface/transformers
ENV LOCAL_SDXL_MODEL_PATH=/opt/models/sdxl-base

COPY . /src
RUN if [ -f /src/requirements.txt ]; then cp /src/requirements.txt /app/requirements.txt; else cp /src/runpod/train-lora/requirements.txt /app/requirements.txt; fi
RUN if [ -f /src/handler.py ]; then cp /src/handler.py /app/handler.py; else cp /src/runpod/train-lora/handler.py /app/handler.py; fi
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r /app/requirements.txt

ADD https://raw.githubusercontent.com/huggingface/diffusers/v0.35.1/examples/dreambooth/train_dreambooth_lora_sdxl.py /app/train_dreambooth_lora_sdxl.py
RUN python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id="stabilityai/stable-diffusion-xl-base-1.0",
    local_dir="/opt/models/sdxl-base",
)
PY
RUN rm -rf /opt/huggingface/hub

CMD ["python", "-u", "handler.py"]
