# GrowthPath — Technical Design (v2)

Self-study + test platform. Student accounts only — no parent, teacher, or
admin role exists anywhere in the system. This document extends the existing
RAG/test-generation system (`schema.sql`, `migration_001_...sql`) with:

1. Notes from uploaded files, textbook links, or textbook PDFs
2. Per-subject knowledge graphs with disambiguation ("learning flow")
3. Visible test/mastery progress over time
4. Behavioral engagement tracking + adaptive nudges (from the original synopsis), with the facial-cue module kept as an optional stretch add-on

Schema changes live in `migration_002_notes_knowledge_graph_engagement.sql`.
Read that file's header comments alongside this doc — the two are meant to
be read together.

---

## 1. Architecture (unchanged shape, extended pipeline)

Three-tier: React frontend, Python (FastAPI) or Node (Express) API, Postgres
(Supabase, pgvector enabled) for both relational data and embeddings — no
separate vector DB. Auth is Supabase Auth, student accounts only; every
table is row-level-secured to `auth.uid()`, so there's no separate
authorization layer to build for a second role, because there isn't one.

```
 Upload / paste link
        |
        v
  Ingestion pipeline  --->  document_chunks (embedded, topic-labelled)
        |                          |
        |                          v
        |                   Concept extraction --> concepts / concept_aliases
        |                          |                 / concept_edges
        v                          v
   Notes generation          Knowledge graph API  --> React graph view
   (grounded in chunks)
        |
        v
     notes table
```

Test generation, adaptive difficulty, and topic mastery already exist and
are untouched by this design — they now additionally read/write
`topic_mastery_history` for the progress view, and can pull `concept_edges`
to recommend "review this prerequisite" alongside "review this topic."

---

## 2. Notes from uploads, links, or textbook PDFs

`documents.source_type` is `upload` or `link`; `document_type` is
`textbook` or `notes`. A textbook link is fetched server-side (or the PDF is
uploaded directly), then goes through the *same* chunking + embedding
pipeline as any other document — no parallel ingestion path to maintain.

Two ways a `notes` row gets created:

- **Generated**: after a textbook document reaches `status = 'ready'`, an
  LLM call over its `document_chunks` (grouped by `topic`) produces a
  structured markdown note per topic or per section. `source_chunk_ids` is
  stored so every claim in the generated note can be traced back to the
  page/chunk it came from — this also reuses the same grounding pattern the
  test generator already uses for questions.
- **Freehand**: the student writes/pastes notes directly; `source_document_id`
  is null, `generated = false`.

Either way, notes live under a `subject_id`, same as documents — "separate
folders per subject" is already the `subjects` table from migration_001;
notes and documents both just hang off it.

---

## 3. Knowledge graph with disambiguation

**Goal stated by the student:** link related topics within a subject into a
learning flow, and do it without two failure modes — (a) the same term used
for two different things getting collapsed into one node, and (b) two
different terms for the same thing staying as duplicate nodes.

**Chosen approach: embedding similarity to find candidates, LLM judge to
decide.** Neither signal alone is trusted:

- Embedding similarity alone over-merges: "cache" (CPU cache) and "cache"
  (browser cache) are close in embedding space if the surrounding text is
  short, but are different concepts.
- String/keyword matching alone under-merges: "three-way handshake" and
  "TCP handshake" don't share tokens but are the same concept.

**Pipeline**, run during ingestion whenever a new candidate term surfaces
(topic labels from `document_chunks`, or explicit terms extracted by a
lightweight NER/keyphrase pass over each chunk):

1. Embed the term (same `all-MiniLM-L6-v2` model already used for chunks).
2. Call `match_concepts(embedding, subject_id)` — nearest existing concepts
   in *this subject only* (graphs don't span subjects, so "cell" in Biology
   and "cell" in a spreadsheets course never even become candidates for
   each other).
3. If nothing comes back above a similarity floor (e.g. 0.75): create a new
   `concepts` row, new `concept_aliases` row (`resolution_method = 'exact'`),
   done — no LLM call needed for the common case of a genuinely new topic.
4. If one or more candidates come back above the floor: write a row to
   `concept_resolution_candidates` and make one LLM call: *"Text A defines
   term X as: '...'. Existing concept Y is defined as: '...'. Same concept,
   different concept, or ambiguous?"* — passing the actual surrounding
   context from both sides, not just the bare term.
   - `same_concept` → new alias row pointing at the existing concept
     (`resolution_method = 'embedding_llm_confirmed'`); this is the
     "different terms, same idea" case.
   - `different_concept` → new concept row; this is the "same term, means
     something else here" case — the alias is scoped to the new concept, so
     both "cache" nodes coexist without colliding.
   - `ambiguous_needs_review` → left `pending`; surfaced in the UI so the
     student makes the call once, and that becomes a `user_confirmed` /
     `user_rejected` row (an explicit manual override path always exists,
     since no automated judge should be the unappealable final word here).

`concept_edges` (the actual "learning flow" lines in the graph) are proposed
the same LLM-in-the-loop way, scoped per subject: for concepts that
co-occur across chunks/topics, ask for a relation type
(`prerequisite` / `related` / `part_of` / `contrasts_with`) and a one-line
rationale, store the `weight`, and let the frontend fade out low-weight
edges by default so the graph doesn't turn into visual noise as a subject
grows.

This whole pipeline runs at ingestion/generation time, not on every page
load — `concepts`/`concept_aliases`/`concept_edges` are precomputed state
the graph view just reads.

---

## 4. Test progress

Already mostly built: `attempts`, `answers`, `topic_mastery` (current
per-topic estimate), spaced-repetition `next_review_at`. The one gap for
"show progress" is that `topic_mastery` only ever holds the *latest* value.
`topic_mastery_history` fixes that: one row per topic per graded attempt, so
the test section can render a trend line (mastery over time, per subject or
per topic) instead of a single static number. Write to it in the same
transaction that updates `topic_mastery`.

---

## 5. Behavioral engagement tracking (from the original synopsis)

Unchanged in spirit from the synopsis, adapted to a self-study context
(there's no instructor to flag — the signal now drives the student's *own*
adaptive nudges and their own dashboard, not a teacher's):

- `engagement_events` — raw log: time-on-task per section, quiz retry
  count, navigation (skip/revisit), idle time, scroll/click, keyed to a
  `session_ref` so events group into one study or test session.
- `engagement_scores` — a simple weighted rule over a session's events,
  validated against a small manually-labeled test set before being trusted
  (per the synopsis's feasibility notes — this is not assumed accurate out
  of the box).
- Adaptation is application logic, not new tables: score drops below
  threshold → suggest revisiting a concept (can now point at a specific
  `concept_edges` prerequisite, not just "review this topic" generically),
  or offer a hint after prolonged inactivity.
- `signal_source` (`behavioral` / `facial` / `combined`) keeps the optional
  browser-only facial-cue module (face-api.js or MediaPipe Face Mesh,
  opt-in camera permission, no video ever leaves the browser) as an
  additive comparison signal. The platform is fully functional on
  `behavioral` alone; `facial` rows only exist if the student opts in and
  the team gets to it — same "stretch goal, not a dependency" framing as
  the synopsis.

---

## 6. What's explicitly *not* in this schema

No teacher, parent, or admin table or role anywhere, on purpose — every
table above is scoped to `auth.users` via RLS with a single ownership
policy. If a future instructor-facing view is ever wanted, it would need a
new role and a set of read-only cross-user policies; nothing here assumes
that will happen.
