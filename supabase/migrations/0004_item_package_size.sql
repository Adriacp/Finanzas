-- =====================================================================
-- 0004 — Formato del envase en cada compra
-- Permite que la misma marca se compre en distintos tamaños
-- (p. ej. Powerking 500 ml un día y 750 ml otro).
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0003. Es idempotente.
-- =====================================================================

alter table public.transaction_items
  add column if not exists package_size numeric(12,4) check (package_size is null or package_size > 0);
