# Dabliu.notes

Minimal personal notes app built around **open → choose model → write → save**.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then run the SQL in `supabase/migrations/20260907170000_initial_schema.sql` in the Supabase SQL editor (or through the Supabase CLI). Enable Google and/or email authentication in Supabase Auth.

AI is optional. Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL` to enable structured note interpretation. Notes save immediately even when AI is disabled or unavailable.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

The application is prepared for `dabliunotes.space`; connect that domain at the selected hosting provider and add the same environment variables there. No deployment provider was present in the original repository.
