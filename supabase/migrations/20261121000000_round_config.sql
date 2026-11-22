-- Optional round settings recorded with each workout. Null for sessions saved before
-- advanced settings existed (those were always orthodox, all punches, curated combos).
-- Apply this BEFORE deploying the app version that selects these columns.
-- Safe to re-run.
alter table public.workout_sessions
  add column if not exists stance text check (stance in ('orthodox', 'southpaw')),
  add column if not exists punch_set text[]
    check (punch_set <@ array['jab', 'cross', 'hook', 'uppercut']::text[] and cardinality(punch_set) >= 1),
  add column if not exists combo_length_min smallint check (combo_length_min between 1 and 6),
  add column if not exists combo_length_max smallint check (combo_length_max between 1 and 6);

alter table public.workout_sessions
  drop constraint if exists workout_sessions_round_settings_check;

-- Matches the app: the four settings are recorded together or not at all, and min <= max.
alter table public.workout_sessions
  add constraint workout_sessions_round_settings_check
    check (
      (stance is null and punch_set is null and combo_length_min is null and combo_length_max is null)
      or (
        stance is not null and punch_set is not null
        and combo_length_min is not null and combo_length_max is not null
        and combo_length_min <= combo_length_max
      )
    );
