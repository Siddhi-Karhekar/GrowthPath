"""
Local, free embedding generation via ONNX Runtime - no per-call API cost,
unlike hosted embedding APIs, and no torch/transformers dependency, which
kept crashing this app's free-tier Render instance out of memory (torch +
transformers + accelerate pull in a full training-capable ML framework just
to run one small, fixed model for CPU inference).

The ONNX export and tokenizer for the embedding model are baked into the
Docker image at build time (see Dockerfile) into MODEL_DIR below, rather
than downloaded here at runtime - this file only ever reads them from local
disk. Both the ONNX session and the tokenizer are loaded once (lazily) and
cached for the life of the process, same as the old SentenceTransformer
singleton was.

Replicates exactly what sentence-transformers' SentenceTransformer.encode
(..., normalize_embeddings=True) did for this same model: mean-pool the
per-token embeddings using the attention mask, then L2-normalize - verified
against a real run of this exact pipeline (384-dim output, unit norm, and a
sane near-zero cosine similarity between two unrelated sentences) before
this was wired into the app.
"""
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

MODEL_DIR = Path(__file__).resolve().parent.parent / "model_assets" / "embedding"
MAX_SEQ_LENGTH = 256
_HF_BASE = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main"


def _ensure_model_files() -> None:
    # In production the Docker build already baked these in (see
    # Dockerfile), so this is a no-op there. Locally (e.g. `uvicorn
    # --reload` outside Docker) there's no equivalent bake step, so this
    # downloads them once on first use and caches them on disk from then
    # on - the same one-time-download-then-cached behavior the old
    # SentenceTransformer had locally.
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = MODEL_DIR / "model.onnx"
    tokenizer_path = MODEL_DIR / "tokenizer.json"
    if not onnx_path.exists():
        urllib.request.urlretrieve(f"{_HF_BASE}/onnx/model.onnx", onnx_path)
    if not tokenizer_path.exists():
        urllib.request.urlretrieve(f"{_HF_BASE}/tokenizer.json", tokenizer_path)


@lru_cache
def _get_session() -> ort.InferenceSession:
    _ensure_model_files()
    return ort.InferenceSession(str(MODEL_DIR / "model.onnx"), providers=["CPUExecutionProvider"])


@lru_cache
def _get_tokenizer() -> Tokenizer:
    _ensure_model_files()
    tok = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
    tok.enable_padding(pad_id=0, pad_token="[PAD]")
    tok.enable_truncation(max_length=MAX_SEQ_LENGTH)
    return tok


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    tokenizer = _get_tokenizer()
    encodings = tokenizer.encode_batch(texts)

    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
    token_type_ids = np.zeros_like(input_ids)

    session = _get_session()
    outputs = session.run(
        None,
        {"input_ids": input_ids, "attention_mask": attention_mask, "token_type_ids": token_type_ids},
    )
    token_embeddings = outputs[0]  # (batch, seq_len, hidden)

    # Mean pooling over real (non-padding) tokens, then L2-normalize - the
    # same pooling strategy sentence-transformers uses for this model.
    mask = attention_mask[..., None].astype(np.float32)
    summed = (token_embeddings * mask).sum(axis=1)
    counts = np.clip(mask.sum(axis=1), a_min=1e-9, a_max=None)
    pooled = summed / counts
    norms = np.linalg.norm(pooled, axis=1, keepdims=True)
    normalized = pooled / np.clip(norms, a_min=1e-9, a_max=None)

    return [v.tolist() for v in normalized]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
