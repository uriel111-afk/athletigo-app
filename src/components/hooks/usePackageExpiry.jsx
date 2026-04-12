import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Runs on app load and when packages screen opens.
 * Checks all active packages for expiry and marks them.
 */
export function usePackageExpiry(coachId) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!coachId || ranRef.current) return;
    ranRef.current = true;

    const checkExpiry = async () => {
      try {
        const active = await base44.entities.ClientService.filter({ coach_id: coachId, status: "פעיל" });
        if (!active?.length) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const pkg of active) {
          let shouldUpdate = false;
          let newStatus = null;

          // Check date expiry (group + online)
          if (pkg.expires_at) {
            const expiry = new Date(pkg.expires_at);
            expiry.setHours(0, 0, 0, 0);
            if (expiry < today) {
              shouldUpdate = true;
              newStatus = "expired";
            }
          }

          // Check session depletion (personal + online)
          if (!shouldUpdate && pkg.package_type !== "group") {
            const total = pkg.total_sessions || pkg.sessions_count || 0;
            const used = pkg.used_sessions || 0;
            if (total > 0 && used >= total) {
              shouldUpdate = true;
              newStatus = "completed";
            }
          }

          if (shouldUpdate && newStatus) {
            try {
              await base44.entities.ClientService.update(pkg.id, { status: newStatus });
              await base44.entities.ServiceTransaction.create({
                service_id: pkg.id,
                action_type: newStatus === "expired" ? "expired_auto" : "completed_auto",
                units_changed: 0,
                notes: newStatus === "expired" ? "פקיעה אוטומטית — עבר תאריך" : "הושלמה — כל המפגשים נוצלו",
                created_by: coachId,
              }).catch(() => {});
            } catch (e) {
              console.warn("[PackageExpiry] Failed to update:", pkg.id, e);
            }
          }
        }
      } catch (e) {
        console.warn("[PackageExpiry] Check failed:", e);
      }
    };

    checkExpiry();
  }, [coachId]);
}
