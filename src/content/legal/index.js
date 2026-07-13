// ============================================================
// Legal documents registry — single import point.
//
// Keyed by short id used across the consent UI, settings and the
// consent audit record. Add a doc → add it here.
// ============================================================

import { termsOfUse } from './termsOfUse';
import { privacyPolicy } from './privacyPolicy';
import { photoMediaConsent } from './photoMediaConsent';
import { healthDeclaration } from './healthDeclaration';

export const LEGAL_DOCS = {
  terms:   termsOfUse,
  privacy: privacyPolicy,
  photo:   photoMediaConsent,
  health:  healthDeclaration,
};

export const LEGAL_DOC_LIST = [
  LEGAL_DOCS.terms,
  LEGAL_DOCS.privacy,
  LEGAL_DOCS.health,
  LEGAL_DOCS.photo,
];

export function getLegalDoc(key) {
  return LEGAL_DOCS[key] || null;
}

// Versions recorded alongside each consent for legal proof.
export const LEGAL_VERSIONS = {
  terms:   termsOfUse.version,
  privacy: privacyPolicy.version,
  photo:   photoMediaConsent.version,
};
