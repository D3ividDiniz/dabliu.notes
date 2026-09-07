alter table public.notes alter column model_id drop not null;
alter table public.notes drop constraint if exists notes_model_id_fkey;
alter table public.notes add constraint notes_model_id_fkey foreign key (model_id) references public.models(id) on delete set null;
alter table public.user_preferences add column if not exists font_family text not null default 'mono';
alter table public.user_preferences drop constraint if exists user_preferences_font_family_check;
alter table public.user_preferences add constraint user_preferences_font_family_check check (font_family in ('mono', 'sans', 'serif', 'rounded'));
