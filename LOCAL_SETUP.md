# Local Setup Guide (Supabase + API + Frontend)

This guide is the fastest way to run CaseDesk locally with Supabase.

It focuses on:

- starting local Supabase
- getting the correct local keys
- wiring env files
- creating your first user
- running API + worker + frontend

Use this as the **single source** for local bring-up.
The default command style is `npm run db:*` for consistency.

## 1) Prerequisites

Install and run:

1. Docker Desktop
2. Node.js (18+)
3. Python (3.10+)

From repo root:

```bash
cd /Users/tanmayk/Work/AllFather/laywer
```

## 2) Check Supabase local DB version

`pgvector` must be available for this project, so use Postgres 15+ in `supabase/config.toml`.

In `supabase/config.toml`:

```toml
[db]
major_version = 15
```

If it is `14`, change it to `15`.

## 3) Install dependencies (first)

From repo root:

```bash
npm install
npm --prefix frontend install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 4) Start local Supabase

Primary command:

```bash
npm run db:up
```

This starts local Supabase and applies migrations.

If you need to stop first:

```bash
npm run db:stop
```

Then check URLs + keys:

```bash
npm run db:info
```

You will see:

- API URL (usually `http://127.0.0.1:54321`)
- Studio URL (usually `http://127.0.0.1:54323`)
- DB URL (usually port `54322`)
- Authentication keys:
  - `Publishable` (`sb_publishable_...`)
  - `Secret` (`sb_secret_...`)

## 5) Which key goes where?

Use this mapping:

- `Publishable` -> frontend/public key
- `Secret` -> backend server key only

For this repo’s env names:

- `VITE_SUPABASE_ANON_KEY` = `sb_publishable_...`
- `SUPABASE_ANON_KEY` = `sb_publishable_...`
- `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_...`

## 6) Create env files

Backend:

```bash
cp -n .env.example .env
```

Set in `.env`:

```env
OPENAI_API_KEY=your_openai_key
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_JWT_AUDIENCE=authenticated
APP_RATE_LIMIT_PER_MINUTE=60
```

Frontend:

```bash
cp -n frontend/.env.example frontend/.env
```

Set in `frontend/.env`:

```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

## 7) Apply migrations

Clean local reset (recommended first time):

```bash
npm run db:reset
```

Or normal apply:

```bash
npm run db:up
```

## 8) Run services

Terminal A (API):

```bash
cd /Users/tanmayk/Work/AllFather/laywer
source .venv/bin/activate
uvicorn app.main:app --reload
```

Terminal B (worker):

```bash
cd /Users/tanmayk/Work/AllFather/laywer
source .venv/bin/activate
python -m app.worker
```

Terminal C (frontend):

```bash
cd /Users/tanmayk/Work/AllFather/laywer/frontend
npm run dev
```

## 9) Create your first user

You have two easy options.

### Option A: Use the app UI (recommended)

1. Open `http://127.0.0.1:5173`
2. Click Login -> switch to Register
3. Create account with email/password

### Option B: Use Supabase Auth API directly

```bash
curl -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: sb_publishable_..." \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

## 10) Test login path used by backend

The backend `/auth/login` supports local-auth and Supabase-auth fallback.

```bash
curl -X POST "http://127.0.0.1:8000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

If credentials are valid in Supabase local auth, this returns an access token.

## 11) Health checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/health/provider
```

## 12) Common issues

### A) `vector.control` missing

Cause: Postgres 14 image.
Fix: set `major_version = 15`, then:

```bash
npm run db:clean
```

### B) JWT/401 errors on backend routes

Check:

1. `SUPABASE_URL` matches frontend Supabase URL
2. anon/publishable key mapping is correct
3. your token is from this same local Supabase instance

### C) Quota errors from OpenAI (`429 insufficient_quota`)

Your OpenAI key/project billing/quota needs to be active.

## 13) Useful local commands

```bash
npm run db:info
npm run db:status
npm run db:new -- <name>
npm run db:clean
npm run db:reset
npm run db:stop
```
