-- Migration 002: textbook links/notes ingestion, per-subject knowledge
-- graph (with disambiguation), and mastery history for progress charts.
-- Run this in Supabase SQL Editor AFTER schema.sql and migration_001 have
-- already been applied. Additive only - safe to run against a project with
-- existing data.
--
-- Design notes (read before running):
--
-- 1. Notes/textbook-link ingestion. `documents` already covers uploaded
--    files. We extend it with `source_type` (upload vs. link),
--    `source_url`, and `document_type` (textbook vs. notes) instead of a
--    parallel table, so the existing chunking/embedding/topic-labeling
--    pipeline (document_chunks, match_document_chunks) keeps working
--    unchanged for both intake paths. A new `notes` table holds the actual
--    note content a student reads/edits - either LLM-generated from a
--    textbook document's chunks (grounded; source_document_id links back to
--    it) or written freehand by the student (source_document_id null).
--
-- 2. Knowledge graph + disambiguation. Three tables:
--      concepts        - canonical nodes, one per distinct idea in a subject
--      concept_aliases  - every surface form seen in the text, mapped to
--                          the canonical concept it means
--      concept_edges    - the "learning flow" links between concepts
--    Disambiguation (embedding similarity to find candidates, LLM judgment
--    to decide) is never applied inline the moment a new term is seen.
--    Every new term first goes into concept_resolution_candidates against
--    its nearest embedding neighbor; an LLM call judges whether it's the
--    same concept under a different name (synonym -> merge as an alias), a
--    different concept that happens to overload the same term (homonym ->
--    new concept, kept distinct), or genuinely ambiguous (left pending for
--    the student to confirm in the UI). This is what prevents the graph
--    from silently merging two different ideas OR silently keeping
--    duplicate nodes for one idea under two names - the candidate table is
--    the audit trail for every judgment call made along the way.
--    Concept terms are reused from the topic labels ingestion already
--    computes per document (no separate NLP/NER pass needed).
--
-- 3. Progress over time. topic_mastery (migration_001) only holds the
--    *current* estimate per topic. topic_mastery_history snapshots it on
--    every graded attempt so the progress dashboard can plot a trend, not
--    just a single number, per topic.
--
-- No teacher/parent/admin role is introduced anywhere below, on purpose -
-- every new table is scoped to auth.users via RLS with the same "own rows
-- only" policy used throughout schema.sql, consistent with this being a
-- self-study-only platform.

-- ---------------------------------------------------------------------------
-- documents: distinguish how content arrived (upload vs. a textbook link)
-- and what kind of content it is (source textbook vs. a notes doc)
-- ---------------------------------------------------------------------------
alter table documents add column if not exists source_type text not null default 'upload'
    check (source_type in ('upload', 'link'));
alter table documents add column if not exists source_url text;
alter table documents add column if not exists document_type text not null default 'textbook'
    check (document_type in ('textbook', 'notes'));

-- ---------------------------------------------------------------------------
-- notes: the actual note content a student studies from - either generated
-- from a textbook document's chunks (grounded/citable) or written directly.
-- Lives in a subject folder like documents/study_guides do.
-- ---------------------------------------------------------------------------
create table if not exists notes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid references subjects(id) on delete set null,
    source_document_id uuid references documents(id) on delete set null, -- null = freehand note
    title text not null,
    content text not null,                 -- markdown
    generated boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists notes_subject_idx on notes (subject_id);
create index if not exists notes_source_document_idx on notes (source_document_id);

alter table notes enable row level security;
create policy "own notes" on notes
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- concepts: canonical knowledge-graph nodes, one per distinct idea within a
-- subject. embedding is kept for nearest-neighbor candidate lookup when a
-- new term shows up (see match_concepts below). canonical_name is NOT
-- globally unique per subject on purpose - two genuinely different
-- concepts can (rarely) end up with very similar names right after the LLM
-- disambiguation step runs; a hard uniqueness constraint would turn that
-- edge case into a failed ingestion instead of just an imperfect label.
-- ---------------------------------------------------------------------------
create table if not exists concepts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid not null references subjects(id) on delete cascade,
    canonical_name text not null,
    description text,
    embedding vector(384),
    created_at timestamptz not null default now()
);

create index if not exists concepts_subject_idx on concepts (subject_id);
create index if not exists concepts_embedding_idx
    on concepts using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table concepts enable row level security;
create policy "own concepts" on concepts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- concept_aliases: every surface form ("TCP handshake", "three-way
-- handshake") mapped to the one concept it resolves to. This is what makes
-- "different terms, same idea" not create duplicate graph nodes.
-- ---------------------------------------------------------------------------
create table if not exists concept_aliases (
    id uuid primary key default gen_random_uuid(),
    concept_id uuid not null references concepts(id) on delete cascade,
    alias text not null,
    source_document_id uuid references documents(id) on delete set null,
    resolution_method text not null default 'embedding_llm_confirmed'
        check (resolution_method in ('exact', 'embedding_llm_confirmed', 'manual')),
    confidence real,                       -- embedding similarity at time of resolution
    created_at timestamptz not null default now()
);

create index if not exists concept_aliases_concept_idx on concept_aliases (concept_id);
create index if not exists concept_aliases_alias_idx on concept_aliases (alias);

alter table concept_aliases enable row level security;
create policy "own concept_aliases" on concept_aliases
    for all using (
        exists (select 1 from concepts where concepts.id = concept_aliases.concept_id and concepts.user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- concept_edges: the "learning flow" - directed links between concepts in
-- the same subject (prerequisite chains, related topics, contrasts).
-- ---------------------------------------------------------------------------
create table if not exists concept_edges (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid not null references subjects(id) on delete cascade,
    source_concept_id uuid not null references concepts(id) on delete cascade,
    target_concept_id uuid not null references concepts(id) on delete cascade,
    relation_type text not null check (relation_type in ('prerequisite', 'related', 'part_of', 'contrasts_with')),
    weight real not null default 0.5,      -- LLM confidence, used to fade out weak edges in the UI
    rationale text,                        -- short LLM explanation, shown as a tooltip
    created_at timestamptz not null default now(),
    check (source_concept_id != target_concept_id)
);

create index if not exists concept_edges_subject_idx on concept_edges (subject_id);
create index if not exists concept_edges_source_idx on concept_edges (source_concept_id);
create index if not exists concept_edges_target_idx on concept_edges (target_concept_id);

alter table concept_edges enable row level security;
create policy "own concept_edges" on concept_edges
    for all using (
        exists (select 1 from concepts where concepts.id = concept_edges.source_concept_id and concepts.user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- concept_resolution_candidates: the disambiguation audit trail. Every time
-- graph-building sees a term whose embedding lands close to an existing
-- concept, it's logged here BEFORE any merge happens. The LLM judge call
-- fills in llm_verdict; 'ambiguous_needs_review' rows surface in the UI for
-- the student to confirm manually rather than being auto-resolved either way.
-- ---------------------------------------------------------------------------
create table if not exists concept_resolution_candidates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid not null references subjects(id) on delete cascade,
    new_alias text not null,
    candidate_concept_id uuid not null references concepts(id) on delete cascade,
    embedding_similarity real not null,
    llm_verdict text check (llm_verdict in ('same_concept', 'different_concept', 'ambiguous_needs_review')),
    llm_rationale text,
    status text not null default 'pending'
        check (status in ('pending', 'auto_resolved', 'user_confirmed', 'user_rejected')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create index if not exists concept_resolution_candidates_pending_idx
    on concept_resolution_candidates (subject_id) where status = 'pending';

alter table concept_resolution_candidates enable row level security;
create policy "own concept_resolution_candidates" on concept_resolution_candidates
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- topic_mastery_history: snapshot of topic_mastery taken on every graded
-- attempt, so the progress dashboard can chart mastery over time instead of
-- only showing the current value.
-- ---------------------------------------------------------------------------
create table if not exists topic_mastery_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid references subjects(id) on delete set null,
    topic text not null,
    mastery real not null,
    attempt_id uuid references attempts(id) on delete set null,
    recorded_at timestamptz not null default now()
);

create index if not exists topic_mastery_history_user_topic_idx
    on topic_mastery_history (user_id, topic, recorded_at);

alter table topic_mastery_history enable row level security;
create policy "own topic_mastery_history" on topic_mastery_history
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- match_concepts: nearest-neighbor lookup used by the graph-building
-- pipeline to find candidate concepts for a newly-seen term's embedding,
-- before the LLM judge call decides same/different/ambiguous. Mirrors
-- match_document_chunks from schema.sql.
-- ---------------------------------------------------------------------------
create or replace function match_concepts(
    query_embedding vector(384),
    match_subject_id uuid,
    match_count int default 3
)
returns table (
    id uuid,
    canonical_name text,
    similarity float
)
language sql stable
as $$
    select
        concepts.id,
        concepts.canonical_name,
        1 - (concepts.embedding <=> query_embedding) as similarity
    from concepts
    where concepts.subject_id = match_subject_id
    order by concepts.embedding <=> query_embedding
    limit match_count;
$$;

-- Note: as with schema.sql, the backend uses the Supabase service role key
-- (bypasses RLS by design); RLS above is the safety net for any future
-- direct/anon frontend access. There is still no teacher/parent/admin role
-- anywhere in this schema - by design, this is a self-study-only platform.
