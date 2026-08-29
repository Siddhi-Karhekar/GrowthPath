from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.routers import analytics, attempts, concepts, documents, notes, study_guides, subjects, tests

settings = get_settings()

app = FastAPI(
    title="GrowthPath API",
    description="Personal study-growth platform: upload material, generate "
                 "tests, build a knowledge graph, and track your own progress over time.",
    version="0.1.0",
    # Hide interactive API docs/schema in production - they're a convenience
    # for local development, not something that needs to be publicly
    # browsable once real user data is involved.
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_and_https(request: Request, call_next):
    # Render terminates TLS at its edge and forwards the original scheme via
    # X-Forwarded-Proto - a plain HTTP request reaching the app in
    # production means it came in over HTTP, so bounce it to HTTPS rather
    # than serving it. Skipped outside production so local `uvicorn --reload`
    # over http://localhost keeps working.
    if settings.environment == "production" and request.headers.get("x-forwarded-proto") == "http":
        https_url = request.url.replace(scheme="https")
        return RedirectResponse(str(https_url), status_code=308)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(tests.router, prefix="/api/tests", tags=["tests"])
app.include_router(attempts.router, prefix="/api/attempts", tags=["attempts"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(study_guides.router, prefix="/api/study-guides", tags=["study-guides"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(concepts.router, prefix="/api/concepts", tags=["concepts"])


@app.get("/api/health")
def health():
    return {"status": "ok", "environment": settings.environment}
