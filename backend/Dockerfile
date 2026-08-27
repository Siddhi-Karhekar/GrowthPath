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
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
