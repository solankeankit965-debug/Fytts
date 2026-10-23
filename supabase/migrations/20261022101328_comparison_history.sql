create table public.comparisons (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comparisons_owner_created on public.comparisons(owner_id, created_at desc);
alter table public.comparisons enable row level security;
create policy own_comparisons on public.comparisons for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.comparisons to authenticated;
