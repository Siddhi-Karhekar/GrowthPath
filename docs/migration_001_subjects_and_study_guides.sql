-- Migration 001: subject folders, document versioning, study guides
-- Run this in Supabase SQL Editor AFTER schema.sql has already been applied.
-- Additive only - safe to run against a project with existing data.

-- ---------------------------------------------------------------------------
-- subjects: user-created folders for organizing documents (e.g. "Biology")
-- ---------------------------------------------------------------------------
create table if not exists subjects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now(),
    unique (user_id, name)
);

alter table subjects enable row level security;
create policy "own subjects" on subjects
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- documents: add subject assignment + versioning for "update over time"
-- ---------------------------------------------------------------------------
alter table documents add column if not exists subject_id uuid references subjects(id) on delete set null;
alter table documents add column if not exists version integer not null default 1;
alter table documents add column if not exists updated_at timestamptz not null default now();

create index if not exists documents_subject_idx on documents (subject_id);

-- ---------------------------------------------------------------------------
-- topic_mastery: scope mastery/reports per subject, not just globally.
-- subject_id is nullable (null = document wasn't filed under a subject).
-- Replaces the old (user_id, topic) unique constraint with one that also
-- accounts for subject, since the same topic name could plausibly recur
-- across two different subjects' documents.
-- ---------------------------------------------------------------------------
alter table topic_mastery add column if not exists subject_id uuid references subjects(id) on delete set null;

alter table topic_mastery drop constraint if exists topic_mastery_user_id_topic_key;

-- Two partial unique indexes instead of one plain composite constraint,
-- because standard SQL treats every NULL as distinct - a plain
-- unique(user_id, subject_id, topic) would silently allow duplicate rows
-- whenever subject_id is null (the "uncategorized" case).
create unique index if not exists topic_mastery_unique_with_subject
    on topic_mastery (user_id, subject_id, topic) where subject_id is not null;
create unique index if not exists topic_mastery_unique_no_subject
    on topic_mastery (user_id, topic) where subject_id is null;

-- ---------------------------------------------------------------------------
-- study_guides: persisted "important topics" predictions per document, so
-- students don't burn another LLM call re-generating the same guide every
-- time they revisit it.
-- ---------------------------------------------------------------------------
create table if not exists study_guides (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    document_id uuid not null references documents(id) on delete cascade,
    topics jsonb not null,   -- [{topic, importance, predicted_format, predicted_marks_range, rationale}]
    created_at timestamptz not null default now()
);

alter table study_guides enable row level security;
create policy "own study_guides" on study_guides
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
