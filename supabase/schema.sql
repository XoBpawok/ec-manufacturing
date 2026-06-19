-- supabase/schema.sql
create table if not exists public.prices (
  item_id    bigint primary key,
  price      double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.prices enable row level security;

create policy "anon read prices"   on public.prices for select to anon using (true);
create policy "anon insert prices" on public.prices for insert to anon with check (true);
create policy "anon update prices" on public.prices for update to anon using (true) with check (true);
