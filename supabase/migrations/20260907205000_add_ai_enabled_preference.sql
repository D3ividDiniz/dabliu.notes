alter table public.user_preferences
  add column if not exists ai_enabled boolean not null default true;
