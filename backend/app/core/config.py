"""
Central app configuration, loaded from environment variables (.env locally,
real env vars in Render/production). Nothing here should ever contain a
hardcoded secret - see ../../.env.example for the variables you need to set.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase (Postgres + Auth + Storage + pgvector), free tier
    supabase_url: str = ""
    supabase_service_role_key: str = ""  # server-side only, never expose to frontend
    supabase_jwt_secret: str = ""        # used to verify user JWTs issued by Supabase Auth

    # Groq (free-tier LLM inference)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # Embeddings model (runs locally, no API cost)
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Storage bucket name in Supabase Storage for uploaded documents
    documents_bucket: str = "documents"

    # App
    environment: str = "development"
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
