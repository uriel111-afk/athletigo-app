// ============================================================
// AthletiGo — Photo consent data layer
//
// Canonical store is users.photo_consent (JSONB) + the fast flag
// users.photo_consent_completed (see 20260713_photo_consent.sql).
// A best-effort mirror row is also written to signed_documents for
// the audit trail / documents tab. Reused by the onboarding step,
// the returning-trainee dialog, the settings card and the gallery.
// ============================================================

import { supabase } from '@/lib/supabaseClient';

export const CONSENT = { ALLOWED: 'allowed', DENIED: 'denied' };

export const hasDocumentationConsent = (pc) => pc?.documentation === CONSENT.ALLOWED;
export const hasMarketingConsent     = (pc) => pc?.marketing === CONSENT.ALLOWED;

// Compute minor status from a birth date (mirrors Onboarding.isMinor).
export function isMinorFromBirthDate(birthDate) {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  let a = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
  return a < 18;
}

// Load the trainee's consent + the fields needed to render the dialog.
export async function loadPhotoConsent(traineeId) {
  if (!traineeId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('photo_consent, photo_consent_completed, birth_date, full_name')
    .eq('id', traineeId)
    .maybeSingle();
  if (error) { console.warn('[photoConsent] load failed:', error.message); return null; }
  return {
    consent:   data?.photo_consent || null,
    completed: !!data?.photo_consent_completed,
    birthDate: data?.birth_date || null,
    fullName:  data?.full_name || '',
  };
}

// Persist canonical consent to users, then best-effort audit mirror.
// For minors, signer name/relation/signature are required by the caller
// (PhotoConsentStep) before this runs.
export async function savePhotoConsent(traineeId, coachId, {
  documentation,
  marketing,
  isMinor = false,
  signerName = null,
  signerRelation = null,
  signatureData = null,
  source = 'onboarding',
}) {
  if (!traineeId) throw new Error('missing traineeId');
  const now = new Date().toISOString();
  const consent = {
    documentation,
    marketing: marketing || CONSENT.DENIED,
    is_minor: !!isMinor,
    signer_name:     isMinor ? (signerName || null) : null,
    signer_relation: isMinor ? (signerRelation || null) : null,
    signature_data:  isMinor ? (signatureData || null) : null,
    decided_at: now,
    updated_at: now,
    source,
  };

  const { error } = await supabase
    .from('users')
    .update({ photo_consent: consent, photo_consent_completed: true })
    .eq('id', traineeId);
  if (error) throw error;

  // Per-device flag so the returning-trainee dialog never re-prompts
  // even if a cached user row lacks the column.
  try { localStorage.setItem(`athletigo_photo_consent_${traineeId}`, now); } catch {}

  // Audit mirror — minimal columns, non-fatal on failure (mirrors the
  // health-declaration pattern; older signed_documents schemas 400 on
  // extra columns).
  try {
    await supabase.from('signed_documents').insert({
      trainee_id: traineeId,
      coach_id: coachId || null,
      document_type: 'photo_consent',
      document_data: {
        documentation,
        marketing: consent.marketing,
        is_minor: !!isMinor,
        signer_name: consent.signer_name,
        signer_relation: consent.signer_relation,
        source,
      },
      signature_data: isMinor ? (signatureData || null) : null,
      signed_at: now,
      status: 'signed',
      is_locked: false,
    });
  } catch (e) {
    console.warn('[photoConsent] signed_documents mirror failed:', e?.message);
  }

  return consent;
}
