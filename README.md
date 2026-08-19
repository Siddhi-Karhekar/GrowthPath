# GrowthPath

A personal study-growth platform: upload your own notes/textbook chapters, get an AI-generated test in the format and length you choose, get graded (MCQ instantly, theory via an LLM against a rubric), and track your own mastery, weak areas, and trajectory over time. Built for a single student per account - no teacher/admin roles.

Every service used here has a genuine free tier suitable for a portfolio project. Nothing below requires a credit card.

## Features

- **Test mode or study-guide mode** - for any uploaded document, choose to take a generated test (MCQ/theory, configurable total marks, optional adaptive difficulty) or generate a "study guide" that ranks the document's topics by how much of the material covers them, with a predicted question format and mark range per topic. The study guide is explicit that this is an estimate derived from the student's own material, not a leaked or guaranteed question.
- **Subject folders** - documents can be filed into subjects (e.g. "Biology", "Organic Chemistry"); the Documents page, mastery tracking, and the Growth/progress dashboard can all be filtered to a single subject or viewed across all of them.
- **Document versioning** - a document can be replaced with an updated version of the same file (e.g. updated lecture notes) without losing its history; old chunks/embeddings are cleared and reprocessed, and the version number increments.
- **Desktop-app UI** - a persistent sidebar with navigation, a top header, and a calming pastel teal/sky color theme, built to feel like a real desktop application rather than a mobile-first dashboard.

## What's actually happening under the hood

- **Document ingestion** (`backend/app/services/document_service.py`): parses PDFs/DOCX (with Tesseract OCR fallback for scanned pages), chunks the text, embeds chunks locally with `sentence-transformers` (no API cost), clusters chunks into topics with k-means, and labels each cluster with one LLM call.
- **Test generation** (`test_generation.py`): retrieves relevant chunks via pgvector similarity (or a broad sample if no topic focus is given), and asks Groq's free-tier LLM to generate MCQ/theory questions grounded in that material, each tagged with a topic and an initial difficulty estimate.
- **Grading** (`grading.py`): MCQ is graded deterministically (exact match, no LLM call). Theory answers are graded in a single batched LLM call against a rubric, returning a score, a confidence value, and feedback - low-confidence gradings are flagged for the student to double check rather than silently trusted.
- **Adaptive testing** (`adaptive_service.py`): when enabled, questions are served one at a time, each picked to have difficulty closest to the student's current estimated ability (a simplified CAT/Elo approach) - MCQ answers update the live in-session estimate instantly; theory answers feed into calibration after grading.
- **IRT-style calibration** (`ml/irt.py`, `calibration_service.py`): after every attempt, both the student's ability estimate and each answered question's difficulty estimate are nudged with an Elo-style update based on whether the outcome was "surprising."
- **Mastery + spaced repetition** (`ml/mastery.py`): a rolling per-topic mastery score updates after every attempt, and a simplified SM-2 schedule sets the next recommended review date - weaker topics get reviewed sooner.
- **Analytics/forecasting** (`analytics_service.py`, `ml/forecasting.py`): score history over time, per-topic trend, risk flags (low mastery or declining trend), upcoming revision reminders, and a transparent linear-regression forecast of the next likely score.

## Tech stack (all free tier)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Free, standard, fast dev loop |
| Backend | FastAPI (Python) | Same language as the ML/DL pieces - no separate ML microservice |
| DB + Auth + Storage + Vector search | Supabase free tier (Postgres + pgvector) | One free service instead of stitching together 4 |
| LLM | Groq free tier (`openai/gpt-oss-120b`) | Fast, generous free rate limits |
| Embeddings | sentence-transformers (local) | Runs on your own compute, $0 per call |
| Hosting | Vercel (frontend) + Render (backend) | Both have real free tiers |
| CI | GitHub Actions | Free minutes for public/small private repos |

## Setup

### 1. Supabase (database, auth, storage, vector search)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `docs/schema.sql` from this repo - it creates all tables, enables `pgvector`, sets up row-level security, and creates the similarity-search function.
3. Then run `docs/migration_001_subjects_and_study_guides.sql` - it's additive and adds the `subjects` table, document versioning columns, and the `study_guides` table used by the features above. Run it even on a brand-new project, right after `schema.sql`.
4. In **Storage**, create a bucket named `documents` (private, not public).
5. In **Settings -> API**, copy:
   - `Project URL` -> `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon public` key -> `VITE_SUPABASE_ANON_KEY`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY` (backend only, never in frontend code)
6. Newer Supabase projects sign auth tokens asymmetrically (JWT Signing Keys) rather than with a single shared secret - the backend verifies tokens against your project's JWKS endpoint automatically, with a legacy `SUPABASE_JWT_SECRET` shared-secret fallback for older projects (**Settings -> API -> JWT Settings**, if present).
7. In **Authentication -> Providers**, email/password sign-up is enabled by default - that's all this project uses. If you don't want to wire up email confirmation for local dev, you can disable "Confirm email" in the Email provider settings.

### 2. Groq (free LLM API)

1. Create a free account at [console.groq.com](https://console.groq.com/keys) and generate an API key -> `GROQ_API_KEY`.

### 3. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in the values from steps 1-2
uvicorn app.main:app --reload
```

The API is now at `http://localhost:8000` (interactive docs at `/docs`).

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in Supabase URL/anon key + API base URL
npm run dev
```

## Deployment (still free)

- **Backend -> Render**: New Web Service -> point at this repo's `backend/` directory (or use the included `Dockerfile`) -> set the same env vars as `.env` -> free instance type. Note: free Render services sleep after inactivity and take a few seconds to wake up on the next request.
- **Frontend -> Vercel**: New Project -> point at `frontend/` -> set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (your Render URL) as environment variables -> deploy.
- **CI**: `.github/workflows/ci.yml` runs an import check on the backend and a production build on the frontend on every push - free on GitHub Actions.

## Known MVP limitations (worth naming out loud, not hiding)

- Document ingestion runs as a FastAPI background task rather than a real task queue (Celery/Redis) - fine at hobby scale, would need a queue to handle concurrent uploads at real scale.
- The adaptive-testing ability estimate is session-local and MCQ-driven for live updates; theory questions only recalibrate ability after the full attempt is graded, since grading them live would mean an LLM call per question.
- Results currently render from in-memory navigation state right after submission; refreshing the results page directly isn't wired up yet (the data itself is persisted, just not re-fetched by attempt id).
- Study guide topic predictions are a single batched LLM call over the document's clustered chunks - they're a reasonable estimate of emphasis, not a substitute for reading the material.
