-- Rounds can now be 30 s to 10 min in 30-second steps (previously fixed at 180 s).
alter table public.workout_sessions
  drop constraint if exists workout_sessions_round_duration_seconds_check,
  drop constraint if exists workout_sessions_duration_seconds_check;

alter table public.workout_sessions
  add constraint workout_sessions_round_length_check
    check (
      round_duration_seconds between 30 and 600
      and round_duration_seconds % 30 = 0
    ),
  add constraint workout_sessions_duration_within_round_check
    check (duration_seconds >= 0 and duration_seconds <= round_duration_seconds);
