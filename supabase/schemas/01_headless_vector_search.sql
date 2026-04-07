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

alter table docs.page_section enable row level security;

drop policy if exists "docs_page_section_access" on docs.page_section;
create policy "docs_page_section_access" on docs.page_section
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));
