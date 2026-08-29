# GrowthPath

A personal study-growth platform: upload your own notes/textbook chapters, get an AI-generated test in the format and length you choose, get graded (MCQ instantly, theory via an LLM against a rubric), and track your own mastery, weak areas, and trajectory over time. Built for a single student per account - no teacher/admin roles.

Every service used here has a genuine free tier suitable for a portfolio project. Nothing below requires a credit card.

## Live Demo

The project is deployed and live - no setup needed to try it:

- **App**: https://growthpath-frontend.onrender.com
- **API health check**: https://growthpath-backend.onrender.com/api/health

Both services run on Render's free tier, so the first request after a period of inactivity can take 30-50 seconds to wake up (cold start) - reload if the first load seems stuck. Sign up with any email (Supabase emails a confirmation link) - there's only one account type, no separate teacher/admin login, since this is a self-study platform.

## Features

- **Test mode or study-guide mode** - for any uploaded document, choose to take a generated test (MCQ/theory, configurable total marks, optional adaptive difficulty) or generate a "study guide" that ranks the document's topics by how much of the material covers them, with a predicted question format and mark range per topic. The study guide is explicit that this is an estimate derived from the student's own material, not a leaked or guaranteed question.
- **Handwritten answers and per-question analytics** - during a non-adaptive test you can navigate back to a previous question to review or change your answer; the platform tracks how long you spent on each question and how many times you revisited it (shown on the Results page), and theory answers can be submitted as a photo of handwritten work, OCR'd into the editable answer box so you can fix any misreads before it's graded.
- **Subject folders** - documents can be filed into subjects (e.g. "Biology", "Organic Chemistry"); the Documents page, mastery tracking, and the Growth/progress dashboard can all be filtered to a single subject or viewed across all of them.
- **Document versioning** - a document can be replaced with an updated version of the same file (e.g. updated lecture notes) without losing its history; old chunks/embeddings are cleared and reprocessed, and the version number increments.
- **Notes from uploads or textbook links** - alongside uploading your own notes as a document, you can paste a link to a textbook (a direct PDF link, or a webpage) and GrowthPath ingests it the same way as an upload, then generate condensed, source-grounded study notes from any document with one click - distinct from "study guide" mode, which predicts exam emphasis rather than summarizing content.
- **Per-subject knowledge graph** - builds a graph of how the topics in a subject relate ("learning flow"), color-coded by your mastery of each concept. Disambiguates terminology automatically: an embedding-similarity + LLM-judgment pipeline decides whether a newly-seen term is a synonym of an existing concept (merged), a different concept that happens to share a name (kept distinct), or genuinely ambiguous (left for you to confirm in the UI) - so the graph never silently merges two different ideas or keeps duplicate nodes for one idea under two names.
- **Desktop-app UI** - a persistent sidebar with navigation, a top header, and a calming pastel teal/sky color theme, built to feel like a real desktop application rather than a mobile-first dashboard.

## What's actually happening under the hood

- **Document ingestion** (`backend/app/services/document_service.py`): parses PDFs/DOCX (with Tesseract OCR fallback for scanned pages), chunks the text, embeds chunks locally with `sentence-transformers` (no API cost), clusters chunks into topics with k-means, and labels each cluster with one LLM call.
- **Notes generation** (`notes_service.py`): one batched LLM call turns a document's already-clustered topic chunks into condensed, well-organized markdown notes grounded in the student's own material - a revision aid, separate from the study-guide's exam-emphasis predictions.
- **Knowledge graph** (`knowledge_graph_service.py`): reuses the topic labels ingestion already computed as candidate concept terms - no separate NLP pass. A new term is embedded and checked against existing concepts in the subject (`match_concepts`, pgvector cosine similarity); nothing close enough means a new concept with no LLM call needed, but a close match triggers an LLM judgment call (same concept/different concept/ambiguous) logged to a `concept_resolution_candidates` audit trail before any merge happens. Edges between concepts (prerequisite/related/part_of/contrasts_with) are proposed the same way, batched into one LLM call per graph build.
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
| Hosting | Render (backend Docker web service + frontend static site) | One platform/account, both have real free tiers |
| CI | GitHub Actions | Free minutes for public/small private repos |

## Setup

### 1. Supabase (database, auth, storage, vector search)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `docs/schema.sql` from this repo - it creates all tables, enables `pgvector`, sets up row-level security, and creates the similarity-search function.
3. Then run `docs/migration_001_subjects_and_study_guides.sql` - it's additive and adds the `subjects` table, document versioning columns, and the `study_guides` table used by the features above. Run it even on a brand-new project, right after `schema.sql`.
4. Then run `docs/migration_002_notes_and_knowledge_graph.sql` - additive, adds link-ingestion columns on `documents`, the `notes` table, the knowledge-graph tables (`concepts`, `concept_aliases`, `concept_edges`, `concept_resolution_candidates`), `topic_mastery_history`, and the `match_concepts` function. Also run on a brand-new project, right after migration_001.
5. Then run `docs/migration_003_answer_timing.sql` - additive, adds `time_taken_seconds` and `revisit_count` columns to `answers` so per-question timing/revisit data has somewhere to land. Also run on a brand-new project, right after migration_002.
6. In **Storage**, create a bucket named `documents` (private, not public).
7. In **Settings -> API**, copy:
   - `Project URL` -> `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon public` key -> `VITE_SUPABASE_ANON_KEY`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY` (backend only, never in frontend code)
8. Newer Supabase projects sign auth tokens asymmetrically (JWT Signing Keys) rather than with a single shared secret - the backend verifies tokens against your project's JWKS endpoint automatically, with a legacy `SUPABASE_JWT_SECRET` shared-secret fallback for older projects (**Settings -> API -> JWT Settings**, if present).
9. In **Authentication -> Providers**, email/password sign-up is enabled by default - that's all this project uses. If you don't want to wire up email confirmation for local dev, you can disable "Confirm email" in the Email provider settings.

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

## Deployment (still free, one platform)

Both the backend and frontend deploy from Render, using the `render.yaml` Blueprint at the repo root - no Vercel/Netlify/etc. needed.

1. In the Render dashboard: **New -> Blueprint** -> point it at this repo. Render reads `render.yaml` and creates two services: `growthpath-backend` (a Docker web service built from `backend/Dockerfile`, free plan, health check at `/api/health`) and `growthpath-frontend` (a static site built with `npm install && npm run build` from `frontend/`, with an SPA rewrite rule so client-side routes like `/progress` don't 404 on refresh).
2. On this first deploy, Render will prompt for the env vars marked `sync: false` in `render.yaml` - fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GROQ_API_KEY` on the backend, and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` on the frontend. Leave `CORS_ORIGINS` (backend) and `VITE_API_BASE_URL` (frontend) blank for now - each needs the *other* service's URL, which doesn't exist until after this first deploy.
3. Once both services have deployed once, copy their `https://<name>.onrender.com` URLs from the Render dashboard: set the backend's `CORS_ORIGINS` to the frontend's URL, and the frontend's `VITE_API_BASE_URL` to the backend's URL. Trigger a manual redeploy of both (Render dashboard -> service -> Manual Deploy) to pick up the change.
4. Free Render services sleep after inactivity and take a few seconds to wake up on the next request - normal on the free tier, not a bug.
- **CI**: `.github/workflows/ci.yml` runs an import check on the backend and a production build on the frontend on every push - free on GitHub Actions.

## Known MVP limitations (worth naming out loud, not hiding)

- Document ingestion runs as a FastAPI background task rather than a real task queue (Celery/Redis) - fine at hobby scale, would need a queue to handle concurrent uploads at real scale.
- The adaptive-testing ability estimate is session-local and MCQ-driven for live updates; theory questions only recalibrate ability after the full attempt is graded, since grading them live would mean an LLM call per question.
- Results currently render from in-memory navigation state right after submission; refreshing the results page directly isn't wired up yet (the data itself is persisted, just not re-fetched by attempt id).
- Study guide topic predictions are a single batched LLM call over the document's clustered chunks - they're a reasonable estimate of emphasis, not a substitute for reading the material.
