-- migration_003_answer_timing.sql
-- Adds per-question timing and revisit tracking to answers, so the Results
-- page (and future analytics) can show how long a student spent on each
-- question and how many times they returned to it before submitting - a
-- lightweight complement to the aggregate attempt-level time_taken_seconds
-- that already existed. Additive; run after migration_002.

alter table answers add column if not exists time_taken_seconds integer;
alter table answers add column if not exists revisit_count integer not null default 0;

-- No new RLS policy needed: "own answers" (schema.sql) already scopes all
-- access via attempts.user_id = auth.uid(), which covers these columns too.
