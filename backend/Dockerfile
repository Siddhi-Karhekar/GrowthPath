FROM python:3.11-slim

# Tesseract is needed at runtime for OCR fallback on scanned PDF pages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# Embeddings run on ONNX Runtime, not torch/transformers - a lean CPU
# inference engine instead of a full training-capable ML framework, since
# this app only ever runs one small, fixed model for inference. That
# framework swap is what keeps this comfortably inside Render's free-tier
# 512MB RAM limit; the torch/transformers/accelerate stack this used to
# run on repeatedly exceeded it and got OOM-killed in production.
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Bake the embedding model's ONNX export + tokenizer into the image at
# build time instead of letting the first request on a fresh container
# download them from Hugging Face over the network. Without this, every
# deploy AND every free-tier cold start (Render spins the instance down
# after inactivity) pays that download on the very first document a
# student uploads - this makes that first request instant instead, since
# embedding_service.py finds the files already on local disk. Must match
# MODEL_DIR in app/services/embedding_service.py.
RUN python -c "\
import os, urllib.request; \
out_dir = 'app/model_assets/embedding'; \
os.makedirs(out_dir, exist_ok=True); \
base = 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main'; \
urllib.request.urlretrieve(base + '/onnx/model.onnx', out_dir + '/model.onnx'); \
urllib.request.urlretrieve(base + '/tokenizer.json', out_dir + '/tokenizer.json'); \
print('EMBEDDING_MODEL_BAKED_OK')"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
