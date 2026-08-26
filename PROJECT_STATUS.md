# Project status (continuity notes)

Read this first in any new session working on GrowthPath - it's the fast way to get
back up to speed without relying on old chat history. Keep it updated as things change.

## What this project is

A full-stack, single-student edutech platform (React/Vite/TS frontend, FastAPI backend,
Supabase for DB/auth/storage/vector search, Groq free-tier LLM). See `README.md` for the
full feature list, architecture ("What's actually happening under the hood"), and setup
steps - that doc is kept current and is the real source of truth on *how the system works*.
This file is only for *where things currently stand*.

## Where the code lives

- **Local working copy**: `D:\GrowthPath` on the user's Windows machine - this is where
  `npm run dev` / `uvicorn` actually run, and where `.env` files with real secrets live.
  Note: the Claude Code device bridge used in cloud sessions runs a separate Linux VM with
  this folder mounted - `backend/.venv` is a native Windows venv and `frontend/node_modules`
  has Windows-only native bindings (e.g. `@rolldown/binding-win32-x64-msvc`), so neither
  `uvicorn` nor `npm run build`/`npm run dev` can actually execute from inside the device
  bridge shell. `npx tsc -b --noEmit` (pure TS, no native bindings) does work there and is
  the right way for a cloud session to typecheck frontend changes; actually running/building
  the app needs the user's real Windows terminal (or a fresh `npm install` on a Linux CI/host
  like Vercel/Render, which pulls the correct native binaries for that platform).
- **GitHub**: https://github.com/Siddhi-Karhekar/GrowthPath - the versioned backup. Push
  to it from `D:\GrowthPath` using normal local git (see README/commit history), not from
  a cloud sandbox - cloud sessions are ephemeral and don't have push access to this repo.
- **Secrets** (`backend/.env`, `frontend/.env`): intentionally gitignored, not on GitHub.
  They exist only on the local machine. If they're ever lost, values need to be
  regenerated from Supabase (Settings -> API) and Groq (console.groq.com/keys) - there's
  no other backup by design (don't put real secrets in git).

## How to resume work in a new session

1. Open the Claude desktop app so the device bridge is available, and grant/reconnect
   access to the folder containing `D:\GrowthPath` if asked.
2. Point the new session at this file and `README.md` - e.g. "Continue working on my
   GrowthPath project at D:\GrowthPath, read PROJECT_STATUS.md and README.md first."
3. From there, a new session can list/read files directly off `D:\GrowthPath` via the
   device bridge, same as this one did - no need to re-upload anything.
4. Alternatively, work from the GitHub repo in a fresh cloud sandbox, then sync changes
   back to `D:\GrowthPath` with the device bridge (stage -> edit -> commit-to-device flow).

## Current state / open items

- [ ] Deployment target decided: **Render only** (both backend Docker web service and frontend static site), not Render+Vercel - one `render.yaml` Blueprint deploys both. Chosen after ruling out a past Render IP-allowlisting issue with an unrelated geolocation API not applying here (Groq/Supabase don't require static-IP allowlisting).
- [ ] **Nothing is deployed yet, and no Supabase/Groq project exists yet** - `backend/.env`
      and `frontend/.env` are present locally but unfilled (or filled with placeholders).
      This is the main open item: create the free Supabase project, run all three
      `docs/*.sql` files against it, get a free Groq API key, then deploy backend -> Render
      and frontend -> Vercel per the README's Setup/Deployment sections. All of this is
      designed to be free-tier end to end.
- [ ] **Confirm `docs/migration_002_notes_and_knowledge_graph.sql` has been run** in the
      Supabase SQL Editor, in addition to `schema.sql` and `migration_001` - without it,
      `/api/notes/*` and `/api/concepts/*` return 500s.
- [x] Confirmed the first local `git push` to GitHub succeeded - `git remote -v` shows
      `origin` pointing at the GitHub repo and the local `main` branch is up to date with
      `origin/main`.
- [x] UI redesign complete: persistent sidebar, logo, pastel teal/sky theme, larger
      base font, smooth transitions - applied across all pages, frontend build verified
      clean (`npm run build`, run on the user's actual Windows machine - see the native
      bindings note above for why a cloud session can't run this itself).
- [x] Feature set implemented (original scope): subject folders, document versioning/
      re-upload, study-guide ("important topics") mode as an alternative to taking a test.
- [x] Feature set implemented (this pass, not yet run against a live DB - see open items
      above): textbook ingestion from a link (direct PDF link or webpage) in addition to
      file upload (`document_type`/`source_type` on `documents`, `POST /api/documents/from-link`);
      generated study notes per document (`notes` table, `notes_service.py`,
      `/notes/:documentId` page); a per-subject knowledge graph with LLM-assisted
      disambiguation (`concepts`/`concept_aliases`/`concept_edges`/
      `concept_resolution_candidates`, `knowledge_graph_service.py`, `/knowledge-graph`
      page - custom dependency-free force-directed SVG layout, color-coded by mastery,
      edge style by relation type); two additional Progress-dashboard charts (mastery-by-
      topic bar chart, weekly study-activity bar chart) built from data already collected,
      no new tracking pipeline added this pass.
- [x] Known, deliberate MVP limitations are listed in `README.md` under
      "Known MVP limitations" - not bugs, just scoped-out for now.
- Deliberately NOT built this pass: a separate behavioral-engagement-tracking pipeline
  (time-on-task/idle/scroll event logging + a computed engagement score) from the original
  capstone synopsis. Scoped out as a larger, separate subsystem this round rather than
  bolted on quickly - `docs/GrowthPath_Technical_Design.md` still documents a design for it
  if it's wanted later.

## Conventions worth knowing

- Backend LLM model is `openai/gpt-oss-120b` (Groq) - `llama-3.3-70b-versatile` was
  deprecated on the free tier as of Aug 16, 2026; don't switch back to it.
  If the free tier changes again, current model is set in
  `backend/app/core/config.py` (`groq_model`) and `backend/.env.example`.
- Auth tokens are verified via Supabase's JWKS endpoint first, with a legacy shared-secret
  (`SUPABASE_JWT_SECRET`) fallback - see `backend/app/core/security.py` if auth breaks.
- Color theme: Tailwind's built-in `teal`/`sky`/`emerald` palettes, not custom tokens.
  Stick to those for consistency rather than introducing new colors. The knowledge graph's
  mastery colors (rose/amber/teal) intentionally match the Progress dashboard's risk-flag
  thresholds (<45% / 45-70% / >=70%) so the two views never disagree with each other.
- Backend services always go through the Supabase Python client's query builder
  (`supabase.table(...).select/insert/update/delete/rpc`), never a raw SQL/ORM layer - keep
  new services consistent with that (see `knowledge_graph_service.py` / `notes_service.py`
  for the pattern with a new, more involved service).
- No teacher/parent/admin role exists anywhere in the schema or codebase, by design - this
  is a self-study-only platform. Every table is RLS-scoped to `auth.uid()`.
