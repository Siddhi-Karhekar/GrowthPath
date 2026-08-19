-- GrowthPath database schema (Supabase Postgres, free tier)
-- Run this in Supabase Studio -> SQL Editor after creating your project.
-- Enables pgvector for embeddings so we don't need a separate vector DB.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- documents: one row per uploaded study document
-- ---------------------------------------------------------------------------
create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    filename text not null,
    storage_path text not null,           -- path inside the "documents" Supabase Storage bucket
    status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
    page_count integer,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- document_chunks: parsed + embedded text chunks, used for RAG-grounded
-- question generation via pgvector similarity search
-- ---------------------------------------------------------------------------
create table if not exists document_chunks (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    chunk_index integer not null,
    content text not null,
    topic text,                            -- lightweight topic label, LLM-assigned at ingest time
    embedding vector(384),                 -- all-MiniLM-L6-v2 output dimension
    created_at timestamptz not null default now()
);

create index if not exists document_chunks_embedding_idx
    on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- tests: one row per generated test
-- ---------------------------------------------------------------------------
create table if not exists tests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    document_id uuid not null references documents(id) on delete cascade,
    format text not null check (format in ('mcq', 'theory', 'mixed')),
    total_marks integer not null,
    adaptive boolean not null default false,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- questions: generated questions belonging to a test
-- ---------------------------------------------------------------------------
create table if not exists questions (
    id uuid primary key default gen_random_uuid(),
    test_id uuid not null references tests(id) on delete cascade,
    order_index integer not null,
    format text not null check (format in ('mcq', 'theory')),
    prompt text not null,
    options jsonb,                         -- array of option strings, MCQ only
    correct_option text,                   -- MCQ only
    rubric text,                           -- theory only: grading guidance for the LLM grader
    marks integer not null,
    difficulty real not null default 0.5,  -- 0 (easiest) - 1 (hardest), IRT-style estimate
    topic text
);

-- ---------------------------------------------------------------------------
-- attempts: one row per time the student takes a test
-- ---------------------------------------------------------------------------
create table if not exists attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    test_id uuid not null references tests(id) on delete cascade,
    total_score real,
    max_score integer,
    time_taken_seconds integer,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- answers: one row per question answered within an attempt
-- ---------------------------------------------------------------------------
create table if not exists answers (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references attempts(id) on delete cascade,
    question_id uuid not null references questions(id) on delete cascade,
    response text,
    score real,
    is_correct boolean,
    confidence real,                       -- LLM grading confidence, theory only
    feedback text,
    needs_review boolean not null default false
);

-- ---------------------------------------------------------------------------
-- topic_mastery: rolling per-topic mastery estimate, updated after each
-- graded attempt. Powers the "weak area" analytics and revision reminders.
-- ---------------------------------------------------------------------------
create table if not exists topic_mastery (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    topic text not null,
    mastery real not null default 0.5,     -- 0-1 rolling estimate
    attempts_count integer not null default 0,
    last_attempt_at timestamptz,
    next_review_at timestamptz,            -- spaced-repetition (SM-2 style) next due date
    unique (user_id, topic)
);

-- ---------------------------------------------------------------------------
-- user_profile: one row per user, holds the Elo-style "ability" estimate
-- used to calibrate question difficulty over time (IRT-inspired).
-- ---------------------------------------------------------------------------
create table if not exists user_profile (
    user_id uuid primary key references auth.users(id) on delete cascade,
    ability real not null default 0.5,     -- 0-1, rolling estimate of overall student ability
    updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;
create policy "own profile" on user_profile
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is scoped so a user can only ever touch
-- their own rows. This matters more than usual here since there is no
-- separate teacher/admin role to fall back on for access control.
-- ---------------------------------------------------------------------------
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table tests enable row level security;
alter table attempts enable row level security;
alter table answers enable row level security;
alter table topic_mastery enable row level security;

create policy "own documents" on documents
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own chunks" on document_chunks
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tests" on tests
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own attempts" on attempts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own topic_mastery" on topic_mastery
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- questions/answers are scoped indirectly through their parent test/attempt,
-- so we check ownership via a subquery instead of a direct user_id column.
alter table questions enable row level security;
create policy "own questions" on questions
    for all using (
        exists (select 1 from tests where tests.id = questions.test_id and tests.user_id = auth.uid())
    );

create policy "own answers" on answers
    for all using (
        exists (select 1 from attempts where attempts.id = answers.attempt_id and attempts.user_id = auth.uid())
    );

-- Note: the backend uses the Supabase *service role* key, which bypasses RLS
-- by design - RLS here is the safety net for any future direct/anon access
-- (e.g. if you ever call Supabase straight from the frontend for reads).

-- ---------------------------------------------------------------------------
-- match_document_chunks: pgvector cosine-similarity search, exposed as an
-- RPC function because supabase-py's query builder can't express vector
-- operators directly. Called from services/retrieval.py.
-- ---------------------------------------------------------------------------
create or replace function match_document_chunks(
    query_embedding vector(384),
    match_document_id uuid,
    match_count int default 6
)
returns table (
    id uuid,
    content text,
    topic text,
    similarity float
)
language sql stable
as $$
    select
        document_chunks.id,
        document_chunks.content,
        document_chunks.topic,
        1 - (document_chunks.embedding <=> query_embedding) as similarity
    from document_chunks
    where document_chunks.document_id = match_document_id
    order by document_chunks.embedding <=> query_embedding
    limit match_count;
$$;
