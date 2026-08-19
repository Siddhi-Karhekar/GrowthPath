from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import documents, tests, attempts, analytics, subjects, study_guides

settings = get_settings()

app = FastAPI(
    title="GrowthPath API",
    description="Personal study-growth platform: upload material, generate "
                 "tests, track your own progress over time.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(tests.router, prefix="/api/tests", tags=["tests"])
app.include_router(attempts.router, prefix="/api/attempts", tags=["attempts"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(study_guides.router, prefix="/api/study-guides", tags=["study-guides"])


@app.get("/api/health")
def health():
    return {"status": "ok", "environment": settings.environment}
