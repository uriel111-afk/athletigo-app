// Pure helpers for the wizard draft. No React, no JSX.
// The draft is a scratch shape that only lives inside the wizard; the moment
// the user saves it is converted into the EXISTING scenario shape.

import { DEFAULT_FACTORS, SERVICE_OPTIONS } from '../profitabilityConstants';
import { makeCategory, makeRow } from '../profitabilityModel';

export function emptyDraft() {
  return {
    audiences: [],
    services: {},   // { [audience]: [serviceLabel] }
    pricing: {},    // { [pairKey]: { qty, price } }
    factors: { ...DEFAULT_FACTORS },
  };
}

export function pairKey(audience, service) {
  return `${audience}||${service}`;
}

export function pairsOf(draft) {
  const audiences = (draft && draft.audiences) || [];
  const services = (draft && draft.services) || {};
  const out = [];
  audiences.forEach((audience) => {
    (services[audience] || []).forEach((service) => {
      out.push({ audience, service, key: pairKey(audience, service) });
    });
  });
  return out;
}

export function lineTypeFor(serviceLabel) {
  const found = SERVICE_OPTIONS.find((s) => s.label === serviceLabel);
  return found ? found.lineType : 'single';
}

// Draft → the scenario shape found in `calculator_data.data`.
export function draftToScenario(draft) {
  const services = (draft && draft.services) || {};
  const pricing = (draft && draft.pricing) || {};

  const items = ((draft && draft.audiences) || []).map((audience) => {
    const category = makeCategory(audience);
    category.lines = (services[audience] || []).map((service) => {
      const cell = pricing[pairKey(audience, service)] || {};
      return makeRow({
        name: service,
        lineType: lineTypeFor(service),
        qty: Number(cell.qty) || 0,
        price: Number(cell.price) || 0,
      });
    });
    return category;
  });

  return {
    items,
    factors: { ...DEFAULT_FACTORS, ...((draft && draft.factors) || {}) },
  };
}
