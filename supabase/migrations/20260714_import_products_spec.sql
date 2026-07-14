-- ═══════════════════════════════════════════════════════════════════
-- Import products — add the calculator spec column
-- ═══════════════════════════════════════════════════════════════════
-- The existing public.import_products table has:
--   id, user_id, name, status, notes, created_at, updated_at
-- The import calculator ("רווחיות → מוצרים") stores all of its inputs
-- (supplier cost + currency/fx, MOQ, shipping modes, insurance, customs,
-- import VAT, port fees, local transport, storage, customer shipping,
-- marketing per unit, planned sale price) in a single JSONB column so
-- the shape can evolve without further migrations.
--
-- Purely additive + idempotent. The table already exists — we only add
-- the column. No data is touched.
-- ═══════════════════════════════════════════════════════════════════

alter table public.import_products
  add column if not exists spec jsonb;
