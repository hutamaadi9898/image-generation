FROM runpod/base:0.7.0-cuda12.1.0

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ADD https://raw.githubusercontent.com/huggingface/diffusers/v0.35.1/examples/dreambooth/train_dreambooth_lora_sdxl.py /app/train_dreambooth_lora_sdxl.py

COPY handler.py .

CMD ["python", "-u", "handler.py"]
