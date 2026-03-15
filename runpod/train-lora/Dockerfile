FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

WORKDIR /app

COPY . /src
RUN if [ -f /src/requirements.txt ]; then cp /src/requirements.txt /app/requirements.txt; else cp /src/runpod/train-lora/requirements.txt /app/requirements.txt; fi
RUN if [ -f /src/handler.py ]; then cp /src/handler.py /app/handler.py; else cp /src/runpod/train-lora/handler.py /app/handler.py; fi
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r /app/requirements.txt

ADD https://raw.githubusercontent.com/huggingface/diffusers/v0.35.1/examples/dreambooth/train_dreambooth_lora_sdxl.py /app/train_dreambooth_lora_sdxl.py

CMD ["python", "-u", "handler.py"]
