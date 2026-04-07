create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, user_id)
);

create or replace function public.is_tenant_member(tid uuid)
returns boolean
language sql
stable
as $$
  select
    tid = auth.uid()
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = tid and tm.user_id = auth.uid()
    );
$$;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  summary text not null default '',
  forum text not null default '',
  stage text not null default '',
  parties text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (case_id, contact_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  doc_type text not null default 'evidence',
  file_path text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  content_checksum text not null default '',
  processing_status text not null default 'uploaded',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number int not null,
  content text not null default '',
  content_hash text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, page_number)
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index int not null,
  page_from int not null default 1,
  page_to int not null default 1,
  content text not null default '',
  content_hash text not null default '',
  token_count int not null default 0,
  embedding_model text not null default 'text-embedding-3-small',
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, chunk_index, embedding_model)
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  priority int not null default 100,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  progress int not null default 0,
  error_message text,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null,
  title text not null,
  content text not null default '',
  version int not null default 1,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null default 'filing_bundle',
  file_path text not null,
  file_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  endpoint text not null,
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  version int not null,
  active boolean not null default true,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, name, version)
);

create table if not exists public.ai_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default auth.uid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create schema if not exists docs;

create table if not exists docs.page_section (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  doc_id uuid references public.documents(id) on delete cascade,
  chunk_id uuid references public.document_chunks(id) on delete cascade,
  source_key text not null,
  chunk_index int not null default 0,
  content_hash text not null,
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dim int not null default 1536,
  path text not null default '',
  bucket_id text not null default 'case-documents',
  content text,
  metadata jsonb not null default '{}'::jsonb,
  token_count int not null default 0,
  embedding extensions.vector(1536),
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, source_key, chunk_index, embedding_model)
);

create index if not exists idx_cases_tenant on public.cases(tenant_id);
create index if not exists idx_contacts_tenant on public.contacts(tenant_id);
create index if not exists idx_docs_case_tenant on public.documents(case_id, tenant_id);
create index if not exists idx_chunks_doc on public.document_chunks(document_id, chunk_index);
create index if not exists idx_jobs_tenant_status on public.jobs(tenant_id, status, created_at);
create index if not exists idx_usage_tenant_ts on public.llm_usage(tenant_id, created_at);
create index if not exists idx_ai_audit_tenant_ts on public.ai_audit_events(tenant_id, created_at);
create index if not exists page_section_embedding_idx on docs.page_section using hnsw (embedding extensions.vector_ip_ops);

create or replace function docs.match_page_sections(
    query_embedding extensions.vector(1536),
    match_count int default 10,
    filter jsonb default '{}'::jsonb
) returns table (
    id uuid,
    case_id uuid,
    doc_id uuid,
    chunk_id uuid,
    chunk_index int,
    content text,
    metadata jsonb,
    similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    case_id,
    doc_id,
    chunk_id,
    chunk_index,
    content,
    metadata,
    1 - (page_section.embedding <=> query_embedding) as similarity
  from docs.page_section
  where
    (
      not (filter ? 'tenant_id')
      or page_section.tenant_id = (filter->>'tenant_id')::uuid
    )
    and (
      not (filter ? 'case_id')
      or page_section.case_id = (filter->>'case_id')::uuid
    )
    and (
      not (filter ? 'doc_id')
      or page_section.doc_id = (filter->>'doc_id')::uuid
    )
    and (
      not (filter ? 'metadata')
      or page_section.metadata @> (filter->'metadata')
    )
  order by page_section.embedding <=> query_embedding
  limit match_count;
end;
$$;

drop trigger if exists trg_cases_updated_at on public.cases;
create trigger trg_cases_updated_at before update on public.cases for each row execute function public.set_updated_at();

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at before update on public.documents for each row execute function public.set_updated_at();

drop trigger if exists trg_chats_updated_at on public.chats;
create trigger trg_chats_updated_at before update on public.chats for each row execute function public.set_updated_at();

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();

create or replace function public.touch_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.chats
  set updated_at = timezone('utc', now())
  where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_chat_updated_at on public.messages;
create trigger trg_touch_chat_updated_at after insert on public.messages for each row execute function public.touch_chat_updated_at();

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.cases enable row level security;
alter table public.contacts enable row level security;
alter table public.case_contacts enable row level security;
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.jobs enable row level security;
alter table public.artifacts enable row level security;
alter table public.exports enable row level security;
alter table public.llm_usage enable row level security;
alter table public.prompt_templates enable row level security;
alter table public.ai_audit_events enable row level security;
alter table docs.page_section enable row level security;

drop policy if exists "tenant_memberships_select" on public.tenant_members;
create policy "tenant_memberships_select" on public.tenant_members
for select using (user_id = auth.uid() or public.is_tenant_member(tenant_id));

drop policy if exists "tenant_memberships_insert" on public.tenant_members;
create policy "tenant_memberships_insert" on public.tenant_members
for insert with check (public.is_tenant_member(tenant_id) and user_id = auth.uid());

drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select" on public.tenants
for select using (public.is_tenant_member(id));

drop policy if exists "tenants_insert" on public.tenants;
create policy "tenants_insert" on public.tenants
for insert with check (created_by = auth.uid());

drop policy if exists "cases_access" on public.cases;
create policy "cases_access" on public.cases
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "contacts_access" on public.contacts;
create policy "contacts_access" on public.contacts
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "case_contacts_access" on public.case_contacts;
create policy "case_contacts_access" on public.case_contacts
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "documents_access" on public.documents;
create policy "documents_access" on public.documents
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "document_pages_access" on public.document_pages;
create policy "document_pages_access" on public.document_pages
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "document_chunks_access" on public.document_chunks;
create policy "document_chunks_access" on public.document_chunks
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "chats_access" on public.chats;
create policy "chats_access" on public.chats
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "messages_access" on public.messages;
create policy "messages_access" on public.messages
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "jobs_access" on public.jobs;
create policy "jobs_access" on public.jobs
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "artifacts_access" on public.artifacts;
create policy "artifacts_access" on public.artifacts
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "exports_access" on public.exports;
create policy "exports_access" on public.exports
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "llm_usage_access" on public.llm_usage;
create policy "llm_usage_access" on public.llm_usage
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "prompt_templates_select" on public.prompt_templates;
create policy "prompt_templates_select" on public.prompt_templates
for select using (tenant_id is null or public.is_tenant_member(tenant_id));

drop policy if exists "prompt_templates_insert" on public.prompt_templates;
create policy "prompt_templates_insert" on public.prompt_templates
for insert with check ((tenant_id is null or public.is_tenant_member(tenant_id)) and created_by = auth.uid());

drop policy if exists "ai_audit_access" on public.ai_audit_events;
create policy "ai_audit_access" on public.ai_audit_events
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());

drop policy if exists "docs_page_section_access" on docs.page_section;
create policy "docs_page_section_access" on docs.page_section
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('case-exports', 'case-exports', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "case_documents_read_own" on storage.objects;
create policy "case_documents_read_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'case-documents'
  and (owner = auth.uid() or name like auth.uid()::text || '/%')
);

drop policy if exists "case_documents_upload_own" on storage.objects;
create policy "case_documents_upload_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'case-documents' and owner = auth.uid());

drop policy if exists "case_documents_update_own" on storage.objects;
create policy "case_documents_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'case-documents' and owner = auth.uid())
with check (bucket_id = 'case-documents' and owner = auth.uid());

drop policy if exists "case_documents_delete_own" on storage.objects;
create policy "case_documents_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'case-documents' and owner = auth.uid());

drop policy if exists "case_exports_read_own" on storage.objects;
create policy "case_exports_read_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'case-exports'
  and (owner = auth.uid() or name like auth.uid()::text || '/%')
);

drop policy if exists "case_exports_upload_own" on storage.objects;
create policy "case_exports_upload_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'case-exports' and owner = auth.uid());
