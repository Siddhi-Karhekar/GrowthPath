FROM python:3.11-slim

# Tesseract is needed at runtime for OCR fallback on scanned PDF pages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# sentence-transformers pulls in torch as a dependency. Installed plain, pip
# grabs PyPI's default GPU/CUDA build, which is unnecessary here (CPU-only
# inference) and adds hundreds of MB of RAM overhead - easily enough to blow
# past Render's free-tier 512MB limit on its own. Installing the CPU-only
# wheel first (from PyTorch's own index) satisfies sentence-transformers'
# torch requirement without ever pulling the GPU build.
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Bake the embedding model's weights into the image at build time instead of
# letting the first request on a fresh container download them from Hugging
# Face over the network. Without this, every deploy AND every free-tier
# cold start (Render spins the instance down after inactivity) pays that
# download on the very first document a student uploads - this makes that
# first request instant instead, since sentence-transformers finds the
# weights already cached locally. Must match EMBEDDING_MODEL_NAME in
# render.yaml / .env.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
