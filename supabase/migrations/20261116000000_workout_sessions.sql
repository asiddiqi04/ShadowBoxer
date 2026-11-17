-- Completed workout summaries for signed-in users. Guests keep using IndexedDB.
-- Columns mirror the validated schemaVersion 1 summary so metrics can be queried directly.
create table if not exists public.workout_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  schema_version smallint not null default 1 check (schema_version = 1),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  round_duration_seconds integer not null check (round_duration_seconds = 180),
  duration_seconds double precision not null check (duration_seconds between 0 and 180),
  speed text not null check (speed in ('form', 'casual', 'intense')),
  combos_succeeded integer not null check (combos_succeeded >= 0),
  combos_failed integer not null check (combos_failed >= 0),
  combos_total integer not null check (combos_total = combos_succeeded + combos_failed),
  jabs integer not null check (jabs >= 0),
  crosses integer not null check (crosses >= 0),
  hooks integer not null check (hooks >= 0),
  uppercuts integer not null check (uppercuts >= 0),
  created_at timestamptz not null default now(),
  -- Client-generated IDs are scoped per user so one account can never collide with another.
  primary key (user_id, id)
);

create index if not exists workout_sessions_user_ended_idx
  on public.workout_sessions (user_id, ended_at desc);

alter table public.workout_sessions enable row level security;

-- Workouts are immutable: users can read, add, and delete their own rows, never edit them.
create policy "Users read their own workouts"
  on public.workout_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own workouts"
  on public.workout_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own workouts"
  on public.workout_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);
