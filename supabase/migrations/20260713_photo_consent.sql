-- ═══════════════════════════════════════════════════════════════════
-- Photo consent — onboarding step + gallery gating
-- ═══════════════════════════════════════════════════════════════════
-- Until now photo_consent lived ONLY inside signed_documents JSON as a
-- single marketing field. The onboarding step needs a queryable,
-- per-trainee record with TWO separate consents (documentation +
-- marketing) so the gallery can gate uploads and sharing. We store the
-- canonical value as JSONB on users + a fast boolean flag.
--
-- users.photo_consent shape:
--   {
--     documentation:   'allowed' | 'denied',
--     marketing:       'allowed' | 'denied',
--     is_minor:        boolean,
--     signer_name:     text | null,     -- guardian (minors)
--     signer_relation: text | null,
--     signature_data:  text | null,     -- base64 (minors)
--     decided_at:      iso, updated_at: iso, source: text
--   }
--
-- Purely additive + idempotent. No changes to the health declaration.
-- ═══════════════════════════════════════════════════════════════════

alter table public.users
  add column if not exists photo_consent           jsonb,
  add column if not exists photo_consent_completed  boolean not null default false;

-- Fast lookup for the "trainees still missing photo consent" gate.
create index if not exists idx_users_photo_consent_pending
  on public.users (id)
  where photo_consent_completed = false;
