alter table public.notes add column if not exists archived_at timestamptz;
alter table public.user_preferences add column if not exists swipe_behavior text not null default 'archive';
alter table public.user_preferences drop constraint if exists user_preferences_swipe_behavior_check;
alter table public.user_preferences add constraint user_preferences_swipe_behavior_check check (swipe_behavior in ('archive', 'reveal_delete'));
