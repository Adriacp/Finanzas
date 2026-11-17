-- =====================================================================
-- Finanzas personales — esquema inicial
-- Ejecutar en Supabase → SQL Editor (o `supabase db push`).
-- Todas las tablas usan Row Level Security: cada usuario solo ve sus datos.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Perfil ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency text not null default 'EUR' check (char_length(currency) = 3),
  monthly_budget numeric(14,2) check (monthly_budget is null or monthly_budget >= 0),
  seeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Cuentas ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('checking','savings','cash','credit_card','debit_card','paypal','investment','other')),
  institution text,
  initial_balance numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  color text not null default '#6366f1',
  icon text not null default 'wallet',
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Categorías (parent_id null = categoría; no null = subcategoría) ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete cascade,
  kind text not null check (kind in ('expense','income')),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'tag',
  color text not null default '#64748b',
  description text,
  essential boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Pagos recurrentes y suscripciones ----------
create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  amount numeric(14,2) not null check (amount > 0),
  type text not null default 'expense' check (type in ('expense','income')),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','semiannual','annual')),
  next_date date not null,
  start_date date not null,
  end_date date,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  is_subscription boolean not null default true,
  is_fixed boolean not null default true,
  status text not null default 'active' check (status in ('active','cancelled')),
  usage text check (usage in ('high','medium','low')),
  merchant text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Movimientos ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('expense','income','transfer','refund')),
  amount numeric(14,2) not null check (amount > 0),
  concept text not null check (char_length(concept) between 1 and 120),
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.categories(id) on delete set null,
  date date not null,
  time time,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  payment_method text,
  merchant text,
  description text,
  tags text[] not null default '{}',
  is_fixed boolean not null default false,
  is_recurring boolean not null default false,
  recurring_id uuid references public.recurring(id) on delete set null,
  status text not null default 'paid' check (status in ('paid','pending','scheduled')),
  attachment_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_needs_destination check (type <> 'transfer' or (to_account_id is not null and to_account_id <> account_id))
);

-- ---------- Presupuestos (category_id null = global; month null = todos los meses) ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  month date check (month is null or extract(day from month) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists budgets_unique
  on public.budgets (user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(month, '1900-01-01'::date));

-- ---------- Objetivos de ahorro ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  deadline date,
  account_id uuid references public.accounts(id) on delete set null,
  color text not null default '#10b981',
  icon text not null default 'target',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Vistas de filtros guardadas ----------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Índices ----------
create index if not exists tx_user_date_idx on public.transactions (user_id, date desc);
create index if not exists tx_user_category_idx on public.transactions (user_id, category_id);
create index if not exists tx_user_account_idx on public.transactions (user_id, account_id);
create index if not exists tx_tags_idx on public.transactions using gin (tags);
create index if not exists cat_user_idx on public.categories (user_id, parent_id);
create index if not exists rec_user_idx on public.recurring (user_id, next_date);

-- ---------- updated_at automático ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','accounts','categories','recurring','transactions','budgets','goals','saved_views'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Crear perfil al registrarse ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurring','transactions','budgets','goals','saved_views'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Evita que un usuario referencie cuentas/categorías de otro usuario.
create or replace function public.check_tx_ownership() returns trigger
language plpgsql security invoker as $$
begin
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'Cuenta no válida';
  end if;
  if new.to_account_id is not null and not exists (select 1 from public.accounts a where a.id = new.to_account_id and a.user_id = new.user_id) then
    raise exception 'Cuenta de destino no válida';
  end if;
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'Categoría no válida';
  end if;
  if new.subcategory_id is not null and not exists (select 1 from public.categories c where c.id = new.subcategory_id and c.user_id = new.user_id) then
    raise exception 'Subcategoría no válida';
  end if;
  return new;
end $$;

drop trigger if exists tx_ownership on public.transactions;
create trigger tx_ownership before insert or update on public.transactions
  for each row execute function public.check_tx_ownership();

-- ---------- Storage: tickets y facturas (bucket privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

-- Los archivos se guardan en receipts/<user_id>/<archivo>
drop policy if exists "receipts read own" on storage.objects;
create policy "receipts read own" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts insert own" on storage.objects;
create policy "receipts insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts update own" on storage.objects;
create policy "receipts update own" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts delete own" on storage.objects;
create policy "receipts delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
