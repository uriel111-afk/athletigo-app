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

// Lead → income happens automatically inside updateLead() when status
// flips to 'converted'. Expose a callable here for places that mutate
// the row directly without going through updateLead.
export async function syncLeadConversion(lead) {
  if (!lead?.user_id || lead.status !== "converted") return;
  await syncFunnelOnConversion(lead.user_id, lead.interested_in);
  await syncCurrentMonthlyRevenue(lead.user_id);
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
