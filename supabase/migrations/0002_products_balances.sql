-- =====================================================================
-- 0002 — Productos, desglose de movimientos y saldos iniciales
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0001_init.sql.
-- Es idempotente: se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- ---------- Perfil: nuevas marcas ----------
alter table public.profiles add column if not exists products_seeded boolean not null default false;
alter table public.profiles add column if not exists balances_confirmed boolean not null default false;

-- ---------- Catálogo de productos ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  unit text not null default 'ud' check (char_length(unit) between 1 and 20),
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Un mismo usuario no puede tener dos productos con el mismo nombre
create unique index if not exists products_user_name_unique on public.products (user_id, lower(name));

-- ---------- Desglose de cada movimiento (opcional) ----------
create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(14,4) not null,
  amount numeric(14,2) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_user_tx_idx on public.transaction_items (user_id, transaction_id);
create index if not exists items_user_product_idx on public.transaction_items (user_id, product_id);

-- ---------- updated_at automático ----------
drop trigger if exists touch_products on public.products;
create trigger touch_products before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists touch_transaction_items on public.transaction_items;
create trigger touch_transaction_items before update on public.transaction_items for each row execute function public.touch_updated_at();

-- ---------- Row Level Security: cada usuario solo ve lo suyo ----------
alter table public.products enable row level security;
drop policy if exists "own rows" on public.products;
create policy "own rows" on public.products for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.transaction_items enable row level security;
drop policy if exists "own rows" on public.transaction_items;
create policy "own rows" on public.transaction_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Impedir enlazar líneas a movimientos, productos o categorías de otro usuario
create or replace function public.check_item_ownership() returns trigger
language plpgsql security invoker as $$
begin
  if not exists (select 1 from public.transactions t where t.id = new.transaction_id and t.user_id = new.user_id) then
    raise exception 'Movimiento no válido';
  end if;
  if new.product_id is not null and not exists (select 1 from public.products p where p.id = new.product_id and p.user_id = new.user_id) then
    raise exception 'Producto no válido';
  end if;
  return new;
end $$;

drop trigger if exists item_ownership on public.transaction_items;
create trigger item_ownership before insert or update on public.transaction_items
  for each row execute function public.check_item_ownership();

create or replace function public.check_product_ownership() returns trigger
language plpgsql security invoker as $$
begin
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'Categoría no válida';
  end if;
  return new;
end $$;

drop trigger if exists product_ownership on public.products;
create trigger product_ownership before insert or update on public.products
  for each row execute function public.check_product_ownership();
