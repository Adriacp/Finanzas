-- =====================================================================
-- 0005 — Lista de la compra (compartida entre dispositivos)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0001–0004.
-- Es idempotente: se puede ejecutar más de una vez sin problema.
-- =====================================================================

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric(12,3) check (quantity is null or quantity > 0),
  note text check (note is null or char_length(note) <= 120),
  checked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shopping_user_idx on public.shopping_items (user_id, checked, sort_order);

drop trigger if exists touch_shopping_items on public.shopping_items;
create trigger touch_shopping_items before update on public.shopping_items for each row execute function public.touch_updated_at();

alter table public.shopping_items enable row level security;
drop policy if exists "own rows" on public.shopping_items;
create policy "own rows" on public.shopping_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Impedir enlazar un artículo con un producto de otro usuario
create or replace function public.check_shopping_ownership() returns trigger
language plpgsql security invoker as $$
begin
  if new.product_id is not null and not exists (select 1 from public.products p where p.id = new.product_id and p.user_id = new.user_id) then
    raise exception 'Producto no válido';
  end if;
  return new;
end $$;

drop trigger if exists shopping_ownership on public.shopping_items;
create trigger shopping_ownership before insert or update on public.shopping_items
  for each row execute function public.check_shopping_ownership();
