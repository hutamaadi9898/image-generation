FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

WORKDIR /app

ENV HF_HUB_DISABLE_XET=1
ENV HF_HUB_ENABLE_HF_TRANSFER=0
ENV HF_HOME=/workspace/huggingface
ENV HUGGINGFACE_HUB_CACHE=/workspace/huggingface/hub
ENV TRANSFORMERS_CACHE=/workspace/huggingface/transformers
ENV LOCAL_SDXL_MODEL_PATH=/workspace/models/sdxl-base

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

ADD https://raw.githubusercontent.com/huggingface/diffusers/v0.35.1/examples/dreambooth/train_dreambooth_lora_sdxl.py /app/train_dreambooth_lora_sdxl.py
COPY server.py .

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
