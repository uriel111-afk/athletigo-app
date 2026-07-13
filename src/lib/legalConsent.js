// ============================================================
// AthletiGo — Legal consent data layer (terms + privacy + photo)
//
// Persists the onboarding / returning-trainee consent section. Every
// consent is stored WITH its audit trail — value, timestamp, the
// document VERSION shown, and the signer identity — because we must be
// able to prove exactly what was accepted and when.
//
//   users.terms_accepted    jsonb  { accepted, accepted_at, doc_version, signer_id, signer_name, signer_relation, is_minor }
//   users.privacy_accepted  jsonb  { … same … }
//   users.photo_consent     jsonb  { documentation, marketing, …, doc_version, signer_id }  (shared with the gallery gate)
//
// Reused by the confirm-step ConsentSection, the returning-trainee
// ConsentDialog and the settings screen.
// ============================================================

import { supabase } from '@/lib/supabaseClient';
import { LEGAL_VERSIONS } from '@/content/legal';
import { CONSENT } from '@/lib/photoConsent';

// Load the three consent records for display / gating.
export async function loadLegalConsents(traineeId) {
  if (!traineeId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('terms_accepted, privacy_accepted, photo_consent, photo_consent_completed, birth_date, full_name')
    .eq('id', traineeId)
    .maybeSingle();
  if (error) { console.warn('[legalConsent] load failed:', error.message); return null; }
  return {
    terms:     data?.terms_accepted || null,
    privacy:   data?.privacy_accepted || null,
    photo:     data?.photo_consent || null,
    completed: !!data?.photo_consent_completed,
    birthDate: data?.birth_date || null,
    fullName:  data?.full_name || '',
  };
}

// True once the mandatory terms+privacy consent has been recorded.
export const hasAcceptedTerms = (c) => !!c?.terms?.accepted && !!c?.privacy?.accepted;

// Save the consent section. termsPrivacyAccepted is the single required
// checkbox (covers BOTH terms and privacy). photoAllowed is the optional
// checkbox (grants documentation + marketing together). For minors the
// caller passes signerName/relation/signature and isMinor=true.
export async function saveConsents(traineeId, coachId, {
  termsPrivacyAccepted,
  photoAllowed,
  isMinor = false,
  signerName = null,
  signerRelation = null,
  signatureData = null,
}) {
  if (!traineeId) throw new Error('missing traineeId');
  const now = new Date().toISOString();

  const audit = (docKey) => ({
    accepted: true,
    accepted_at: now,
    doc_version: LEGAL_VERSIONS[docKey],
    signer_id: traineeId,          // account the consent was signed under
    signer_name: isMinor ? (signerName || null) : null,
    signer_relation: isMinor ? (signerRelation || null) : null,
    is_minor: !!isMinor,
  });

  const photoStatus = photoAllowed ? CONSENT.ALLOWED : CONSENT.DENIED;
  const photoConsent = {
    documentation: photoStatus,
    marketing: photoStatus,
    is_minor: !!isMinor,
    signer_name: isMinor ? (signerName || null) : null,
    signer_relation: isMinor ? (signerRelation || null) : null,
    signature_data: isMinor ? (signatureData || null) : null,
    doc_version: LEGAL_VERSIONS.photo,
    signer_id: traineeId,
    decided_at: now,
    updated_at: now,
    source: 'onboarding_consents',
  };

  const update = {
    terms_accepted:   termsPrivacyAccepted ? audit('terms') : null,
    privacy_accepted: termsPrivacyAccepted ? audit('privacy') : null,
    photo_consent: photoConsent,
    photo_consent_completed: true,
  };

  // Bulk update, then a field-by-field fallback (mirrors Onboarding's
  // safeUpdate). This keeps the onboarding finish from hard-blocking in
  // the window where the 20260713_*.sql migrations haven't been applied
  // yet — whatever columns exist get written; the signed_documents
  // mirror + localStorage below still capture the consent either way.
  const { error } = await supabase.from('users').update(update).eq('id', traineeId);
  if (error) {
    console.warn('[legalConsent] bulk update failed, trying field-by-field:', error.message);
    for (const [key, value] of Object.entries(update)) {
      const { error: e } = await supabase.from('users').update({ [key]: value }).eq('id', traineeId);
      if (e) console.warn(`[legalConsent] ${key} failed (column may be missing until SQL runs):`, e.message);
    }
  }

  // Per-device flag so the returning-trainee dialog never re-prompts,
  // even if the cached user row lacks the new columns.
  try { localStorage.setItem(`athletigo_legal_consent_${traineeId}`, now); } catch {}

  // Best-effort audit mirror (non-fatal; mirrors the health pattern).
  try {
    await supabase.from('signed_documents').insert({
      trainee_id: traineeId,
      coach_id: coachId || null,
      document_type: 'legal_consents',
      document_data: {
        terms_accepted: !!termsPrivacyAccepted,
        privacy_accepted: !!termsPrivacyAccepted,
        photo: photoStatus,
        versions: LEGAL_VERSIONS,
        is_minor: !!isMinor,
        signer_name: isMinor ? signerName : null,
        signer_relation: isMinor ? signerRelation : null,
      },
      signature_data: isMinor ? (signatureData || null) : null,
      signed_at: now,
      status: 'signed',
      is_locked: true,
    });
  } catch (e) {
    console.warn('[legalConsent] signed_documents mirror failed:', e?.message);
  }

  return update;
}
