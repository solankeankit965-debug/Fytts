create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{"displayName":"","preferredFit":"Relaxed"}'::jsonb
);
create table public.garments (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 image_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index garments_owner_created on public.garments(owner_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.garments enable row level security;
create policy own_profile on public.profiles for all to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy own_garments on public.garments for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
grant select,insert,update,delete on public.profiles,public.garments to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('garments','garments',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy own_garment_images on storage.objects for all to authenticated using (bucket_id='garments' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='garments' and (storage.foldername(name))[1]=(select auth.uid())::text);
