# CaseDesk

CaseDesk is a case workspace for legal teams, centered on three core entities:

- **Cases**: the main workspaces for each legal case.
- **Contacts**: people or organizations linked to cases.
- **Documents**: uploaded files and generated case outputs.

This repository includes:

- React frontend (`/frontend`)
- FastAPI backend (`/app`)
- Async worker for long-running processing jobs (`python -m app.worker`)
- Supabase for Auth, Postgres, Storage, and RLS
- OpenAI for chat, summary, and embedding workflows

## 1) Architecture

- Frontend authenticates users with Supabase Auth.
- Frontend stores and reads core data in Supabase tables (`cases`, `contacts`, `documents`, `chats`, `messages`).
- Frontend calls backend for AI flows (chat proxy, summary generation, vector indexing, processing jobs).
- Backend validates Supabase JWT locally using JWKS.
- Backend uses `supabase-py` for database/storage operations.
- Worker executes queued processing jobs and writes generated case documents back to Supabase.

## 2) Entity Naming

Use these names consistently across product and docs:

- `case`: legal workspace container
- `contact`: person/entity linked to one or more cases
- `document`: uploaded file or generated output for a case
- `chat`: conversation thread (general or case-linked)
- `message`: individual chat message
- `job`: async processing task

## 3) Prerequisites

Install the following locally:

1. Docker Desktop (required for local Supabase)
2. Node.js 18+ and npm
3. Python 3.10+
4. Supabase CLI (or use `npx supabase` via npm scripts)

Optional but recommended:

- `make` (if you later add a Makefile)
- `jq` for JSON inspection

## 4) Repository Layout

```txt
/app                 FastAPI backend + worker
/frontend            React + Tailwind frontend
/supabase/migrations SQL migrations (source of truth)
/supabase/functions  Supabase Edge Functions (if used)
/docs                Design/reference docs
/scripts             Helper scripts
```

## 5) Environment Setup

### 5.1 Backend env (`.env`)

From repo root:

```bash
cp .env.example .env
```

Set values in `.env`:

- `OPENAI_API_KEY`
- `OPENAI_EMBED_MODEL` (default: `text-embedding-3-small`)
- `SUPABASE_URL` (local default: `http://127.0.0.1:54321`)
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_AUDIENCE` (default: `authenticated`)
- `APP_RATE_LIMIT_PER_MINUTE` (default: `60`)

### 5.2 Frontend env (`frontend/.env`)

```bash
cp frontend/.env.example frontend/.env
```

Set values in `frontend/.env`:

- `VITE_API_BASE=http://127.0.0.1:8000`
- `VITE_SUPABASE_URL=http://127.0.0.1:54321`
- `VITE_SUPABASE_ANON_KEY=...`

## 6) Supabase Migrations (Option A, Imperative SQL)

Migrations are the **single source of truth**.

- Use only files under `supabase/migrations/*.sql` for applied schema changes.
- Do not rely on generated schema concatenation for real migration history.

### Rules

1. Never edit an old migration that has already been applied remotely.
2. Add a new migration for every DB change.
3. Validate migration chain with a full reset before merging.
4. Keep RLS policies, triggers, functions, and extensions in migrations.

### Standard commands

```bash
npm run db:up
npm run db:new -- add_case_indexes
npm run db:reset
npm run db:status
npm run db:push
npm run db:stop
```

These commands map to:

- `db:up` -> `supabase start && supabase migration up --local`
- `db:new` -> `supabase migration new <name>`
- `db:reset` -> `supabase db reset --local`
- `db:status` -> `supabase migration list --local`
- `db:push` -> `supabase db push`
- `db:stop` -> `supabase stop`

## 7) First-Time Local Setup (Step by Step)

Run from repository root in this order.

### Step 1: Install dependencies

```bash
npm install
npm --prefix frontend install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Start Supabase locally and apply migrations

```bash
npm run db:up
```

If you need a clean rebuild:

```bash
npm run db:reset
```

### Step 3: Start backend API

In terminal A:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Step 4: Start background worker

In terminal B:

```bash
source .venv/bin/activate
python -m app.worker
```

### Step 5: Start frontend

In terminal C:

```bash
cd frontend
npm run dev
```

Open:

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8000/health`
- Backend provider health: `http://127.0.0.1:8000/health/provider`

## 8) Local Development Workflow

### Daily loop

1. `npm run db:up`
2. run API + worker + frontend
3. create/update schema with `npm run db:new -- <name>`
4. test migration chain with `npm run db:reset`
5. commit code + migration together

### When changing schema

Always include in migration:

- tables/columns/constraints
- indexes (including pgvector index changes)
- RLS policies
- SQL functions/triggers
- required extensions

## 9) Auth and Security Model

- Supabase Auth issues JWTs.
- Backend validates JWT locally against Supabase JWKS.
- Tenant isolation is enforced by RLS and tenant-aware columns.
- Storage buckets are private.
- API enforces per-user rate limits for chat endpoints.

## 10) Main Product Flows

### Cases

- Create a case with name, summary, forum/stage/parties, linked contacts.
- View case summary + details + linked contacts + case documents.
- Run processing jobs for summary/structured outputs.

### Contacts

- Create contacts independently.
- Search and browse all contacts.
- Link multiple contacts to a case.

### Documents

- Upload documents to a case (private storage).
- Documents are indexed for case-grounded chat/search.
- Generated case outputs are stored and presented as case documents.
- Export final filing bundle when needed.

## 11) Troubleshooting

### `429 insufficient_quota` from OpenAI

- Check project billing and quota in OpenAI platform.
- Confirm correct `OPENAI_API_KEY` in `.env`.
- Restart API after updating env vars.

### `Cannot find project ref` during `db:push`

- Run `supabase link` and ensure correct target project.

### `failed to connect to local postgres`

- Ensure Docker Desktop is running.
- Run `npm run db:up` again.

### Frontend can sign in but backend says unauthorized

- Confirm frontend uses Supabase token and backend has same `SUPABASE_URL`/audience.
- Check `SUPABASE_JWT_AUDIENCE` (usually `authenticated`).

## 12) Remote Deploy Flow

1. Ensure local migration chain is clean:

```bash
npm run db:reset
```

2. Link correct project:

```bash
supabase link
```

3. Push migrations:

```bash
npm run db:push
```

4. Deploy backend/frontend with production env values.

## 13) Quick Verification Checklist

- [ ] `npm run db:up` succeeds
- [ ] API health endpoints return OK
- [ ] Worker starts and polls jobs
- [ ] Frontend opens and can sign in
- [ ] Can create case
- [ ] Can create contact
- [ ] Can upload document
- [ ] Can start chat and receive response
- [ ] Can run processing and see generated case documents

---

If you add new platform behavior, update this README in the same PR as code + migration.
