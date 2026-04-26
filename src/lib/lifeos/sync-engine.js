// ═══════════════════════════════════════════════════════════════════
// sync-engine — single entry point for all cross-app sync helpers.
// ═══════════════════════════════════════════════════════════════════
// The actual implementations live in lifeos-api.js (so they can be
// reused inside other API methods like addIncome/updateLead). This
// file just re-exports them under spec-aligned names so callers can
// import from one canonical place.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabaseClient";
import {
  syncPackageToIncome,
  syncTraineeToLead,
  syncFunnelOnConversion,
  syncCurrentMonthlyRevenue,
  syncCrossApp,
} from "@/lib/lifeos/lifeos-api";

// Spec-aligned aliases
export const syncSaleToIncome      = syncPackageToIncome;
export const syncNewTraineeToLead  = syncTraineeToLead;
export const syncIncomeToBusinessPlan = syncCurrentMonthlyRevenue;

// Lead → cross-app sync. Pro app uses Hebrew status "סגור עסקה",
// Growth app uses English "converted" — treat both as the same
// canonical state so a conversion in either app refreshes the funnel
// + monthly revenue rollup.
//
// The lifeos-api `updateLead()` already handles the income insert
// path when the row carries `revenue_if_converted`. This helper is
// for places (Pro convert flow, raw supabase updates) that bypass
// that and need the funnel / monthly recalc to still fire.
const isLeadConverted = (status) =>
  status === 'converted' || status === 'סגור עסקה';

export async function syncLeadConversion(lead) {
  const ownerId = lead?.coach_id || lead?.user_id;
  if (!ownerId || !isLeadConverted(lead?.status)) return;
  await syncFunnelOnConversion(ownerId, lead.interested_in);
  await syncCurrentMonthlyRevenue(ownerId);
}

// (5) Content published → activity_log row so the AI brain + heatmap
// can reflect it. Idempotent on (user_id, action_type, details->>id).
export async function syncContentToActivity(content) {
  if (!content?.user_id || content.status !== "published") return;
  try {
    // Dup check — same content row should only log once
    const { data: existing } = await supabase
      .from("activity_log")
      .select("id")
      .eq("user_id", content.user_id)
      .eq("action_type", "content_created")
      .filter("details->>content_id", "eq", String(content.id))
      .maybeSingle();
    if (existing?.id) {
      console.log("[syncContentToActivity] dup skipped:", existing.id);
      return existing;
    }
    const { data, error } = await supabase.from("activity_log").insert({
      user_id: content.user_id,
      action_type: "content_created",
      category: content.type || "content",
      details: {
        content_id: content.id,
        title: content.title || null,
        platform: content.platform || null,
      },
    }).select().maybeSingle();
    if (error) console.warn("[syncContentToActivity] failed:", error.message);
    return data || null;
  } catch (e) {
    console.warn("[syncContentToActivity] exception:", e?.message);
    return null;
  }
}

export { syncCrossApp };
export default {
  syncSaleToIncome,
  syncNewTraineeToLead,
  syncLeadConversion,
  syncIncomeToBusinessPlan,
  syncContentToActivity,
  syncCrossApp,
};
