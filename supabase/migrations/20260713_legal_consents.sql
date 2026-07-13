-- ═══════════════════════════════════════════════════════════════════
-- Legal consents — terms of use + privacy policy (audit records)
-- ═══════════════════════════════════════════════════════════════════
-- The onboarding consent section records a mandatory terms+privacy
-- consent and (reusing users.photo_consent from 20260713_photo_consent)
-- the optional photo consent. For legal proof each record stores the
-- value, timestamp, the document VERSION shown and the signer identity.
--
-- users.terms_accepted / users.privacy_accepted shape (jsonb):
--   {
--     accepted: true,
--     accepted_at: iso,
--     doc_version: text,        -- version of the doc shown
--     signer_id: uuid,          -- account the consent was signed under
--     signer_name: text|null,   -- guardian (minors)
--     signer_relation: text|null,
--     is_minor: boolean
--   }
--
-- Purely additive + idempotent. Depends on 20260713_photo_consent.sql
-- (photo_consent + photo_consent_completed already added there).
-- ═══════════════════════════════════════════════════════════════════

alter table public.users
  add column if not exists terms_accepted   jsonb,
  add column if not exists privacy_accepted jsonb;

-- Fast lookup for "trainees who still owe terms/privacy consent".
create index if not exists idx_users_terms_pending
  on public.users (id)
  where terms_accepted is null;
