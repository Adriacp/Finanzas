-- =====================================================================
-- 0003 — Variantes de producto (marcas) y formato del envase
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002. Es idempotente.
--
--   Bebida energética (se mide en litros)
--    ├─ Powerking  · package_size = 1    (1 l)
--    └─ V          · package_size = 0.5  (500 ml)
-- =====================================================================

alter table public.products add column if not exists parent_id uuid references public.products(id) on delete set null;
alter table public.products add column if not exists package_size numeric(12,4) check (package_size is null or package_size > 0);
create index if not exists products_user_parent_idx on public.products (user_id, parent_id);

-- El nombre es único dentro de su nivel: puede haber «Brik 1 l» en «Leche» y en «Zumo»
drop index if exists public.products_user_name_unique;
create unique index if not exists products_user_parent_name_unique
  on public.products (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Un producto no puede ser variante de sí mismo
alter table public.products drop constraint if exists products_not_own_parent;
alter table public.products add constraint products_not_own_parent check (parent_id is null or parent_id <> id);

-- La categoría y el producto genérico deben ser del mismo usuario
create or replace function public.check_product_ownership() returns trigger
language plpgsql security invoker as $$
begin
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'Categoría no válida';
  end if;
  if new.parent_id is not null and not exists (select 1 from public.products p where p.id = new.parent_id and p.user_id = new.user_id) then
    raise exception 'Producto genérico no válido';
  end if;
  return new;
end $$;
