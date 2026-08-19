"""
Thin wrapper around Groq's free-tier LLM API. Kept as a single choke point so
swapping providers (e.g. adding a Gemini fallback) later only touches this file.
"""
from functools import lru_cache
from groq import Groq

from app.core.config import get_settings


@lru_cache
def get_groq() -> Groq:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError(
            "Groq is not configured. Set GROQ_API_KEY in your .env "
            "(get a free key at https://console.groq.com/keys)."
        )
    return Groq(api_key=settings.groq_api_key)


def chat_completion(messages: list[dict], *, temperature: float = 0.4, json_mode: bool = False) -> str:
    """Single entry point every service uses to call the LLM."""
    settings = get_settings()
    client = get_groq()
    response = client.chat.completions.create(
        model=settings.groq_model,
        messages=messages,
        temperature=temperature,
        response_format={"type": "json_object"} if json_mode else None,
    )
    return response.choices[0].message.content
