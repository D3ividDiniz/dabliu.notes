alter table public.user_preferences
  add column if not exists ai_model text not null default 'gemini-3.6-flash';
