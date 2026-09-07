create extension if not exists pgcrypto;

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '✦',
  color text not null check (color in ('yellow', 'blue', 'pink', 'white', 'gray')),
  description text,
  enabled_fields text[] not null default array['title','description','date','tag'],
  organization_mode text not null default 'list' check (organization_mode in ('list', 'date', 'tags')),
  placeholders text[] not null default array['Write something down...'],
  visual_style text not null default 'minimal' check (visual_style in ('minimal', 'ambient')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete restrict,
  original_content text not null check (char_length(original_content) between 1 and 10000),
  title text,
  description text,
  note_date date,
  tags text[] not null default '{}',
  value numeric,
  number_value numeric,
  status text check (status in ('pending', 'in_progress', 'completed')),
  ai_metadata jsonb not null default '{}'::jsonb,
  ai_status text not null default 'not_requested' check (ai_status in ('not_requested','pending','complete','failed')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  visual_style text not null default 'minimal' check (visual_style in ('minimal', 'ambient')),
  ai_model text not null default 'gemini-3.6-flash',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_created_idx on public.notes(user_id, created_at desc);
create index if not exists notes_model_created_idx on public.notes(model_id, created_at desc);
create index if not exists notes_date_idx on public.notes(user_id, note_date desc);

alter table public.models enable row level security;
alter table public.notes enable row level security;
alter table public.user_preferences enable row level security;

create policy "models own rows" on public.models for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes own rows" on public.notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences own rows" on public.user_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists models_updated_at on public.models;
create trigger models_updated_at before update on public.models for each row execute function public.set_updated_at();
drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes for each row execute function public.set_updated_at();
drop trigger if exists preferences_updated_at on public.user_preferences;
create trigger preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
