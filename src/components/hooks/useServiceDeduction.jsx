import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { syncPackageStatus } from "@/lib/packageStatus";

/**
 * Smart deduction based on package type:
 * - personal: deduct 1 session
 * - group: no deduction (subscription-based, time only)
 * - online: deduct 1 session (time also checked separately)
 */
export async function deductSessionFromService(session, coachId) {
  if (!session.service_id || session.was_deducted) return { deducted: false };

  try {
    const services = await base44.entities.ClientService.filter({ id: session.service_id });
    const service = services?.[0];
    if (!service) return { deducted: false };

    // Group packages: no session deduction (subscription model)
    if (service.package_type === "group") return { deducted: false };

    // Check auto-deduct flag
    if (service.auto_deduct_enabled === false) return { deducted: false };

    // Calculate new remaining
    const currentUsed = service.used_sessions || 0;
    const totalSessions = service.total_sessions || service.sessions_count || 0;
    if (totalSessions <= 0) return { deducted: false };

    const prevRemaining = totalSessions - currentUsed;
    if (prevRemaining <= 0) return { deducted: false };

    const newUsed = currentUsed + 1;
    const newRemaining = totalSessions - newUsed;

    // Check if online package also expired by date
    let finalStatus = service.status;
    if (service.expires_at) {
      const expiryDate = new Date(service.expires_at);
      if (expiryDate < new Date()) finalStatus = "expired";
    }
    if (newRemaining <= 0) finalStatus = "completed";

    // Update service
    await base44.entities.ClientService.update(service.id, {
      used_sessions: newUsed,
      sessions_remaining: newRemaining,
      status: finalStatus !== service.status ? finalStatus : service.status,
    });
    await syncPackageStatus(service.id);

    // Mark session as deducted
    await base44.entities.Session.update(session.id, { was_deducted: true });

    // Log transaction
    try {
      await base44.entities.ServiceTransaction.create({
        service_id: service.id,
        session_id: session.id,
        action_type: "deduct",
        units_changed: -1,
        previous_remaining: prevRemaining,
        new_remaining: newRemaining,
        notes: `קיזוז — ${service.package_type === "online" ? "אונליין" : "אישי"}`,
        created_by: coachId,
      });
    } catch {}

    // Notifications
    const pkgName = service.package_name || service.service_type || "חבילה";
    if (newRemaining === 1) {
      toast.info(`נותר מפגש אחד בחבילה "${pkgName}"`);
      // Open the LastSessionAlert popup so the coach can pick a renewal
      // message tone (friendly / professional / motivation) to send.
      try {
        window.dispatchEvent(new CustomEvent('athletigo:last-session', {
          detail: {
            coachId,
            traineeId: service.trainee_id,
            traineeName: service.trainee_name,
            packageName: pkgName,
          },
        }));
      } catch {}
    }
    if (newRemaining <= 0) {
      toast.warning(`חבילה "${pkgName}" הסתיימה`);
      try {
        await base44.entities.Notification.create({
          user_id: coachId,
          type: "service_completed",
          title: "חבילה הסתיימה",
          message: `חבילה "${pkgName}" של ${service.trainee_name || "מתאמן"} הסתיימה`,
          is_read: false,
        });
      } catch {}
    }

    return { deducted: true, newRemaining };
  } catch (error) {
    console.error("[ServiceDeduction] Error:", error);
    return { deducted: false };
  }
}

/**
 * Restore 1 unit when a completed session is reverted.
 */
export async function restoreSessionToService(session, coachId) {
  if (!session.service_id || !session.was_deducted) return { restored: false };

  try {
    const services = await base44.entities.ClientService.filter({ id: session.service_id });
    const service = services?.[0];
    if (!service) return { restored: false };

    // Group packages: nothing to restore
    if (service.package_type === "group") return { restored: false };

    const currentUsed = Math.max(0, (service.used_sessions || 0) - 1);
    const totalSessions = service.total_sessions || service.sessions_count || 0;
    const newRemaining = totalSessions - currentUsed;

    await base44.entities.ClientService.update(service.id, {
      used_sessions: currentUsed,
      sessions_remaining: newRemaining,
      status: service.status === "completed" ? "פעיל" : service.status,
    });
    await syncPackageStatus(service.id);

    await base44.entities.Session.update(session.id, { was_deducted: false });

    try {
      await base44.entities.ServiceTransaction.create({
        service_id: service.id,
        session_id: session.id,
        action_type: "restore",
        units_changed: 1,
        previous_remaining: newRemaining - 1,
        new_remaining: newRemaining,
        notes: "החזרה — מפגש בוטל",
        created_by: coachId,
      });
    } catch {}

    return { restored: true, newRemaining };
  } catch (error) {
    console.error("[ServiceRestore] Error:", error);
    return { restored: false };
  }
}

/**
 * Auto-suggest the best matching package for a session.
 * Rules: match by type, prefer oldest active package.
 */
export function suggestPackageForSession(sessionType, activeServices) {
  if (!activeServices?.length) return null;

  // Map session type to package type
  const typeMap = {
    "אישי": "personal", "personal": "personal",
    "קבוצתי": "group", "קבוצה": "group", "group": "group",
    "אונליין": "online", "online": "online",
  };
  const targetType = typeMap[sessionType] || "personal";

  // Filter matching packages with remaining capacity
  const matching = activeServices.filter(s => {
    if (s.status !== "פעיל" && s.status !== "active") return false;
    if (s.package_type && s.package_type !== targetType) return false;
    // For personal/online: need remaining sessions
    if (targetType !== "group") {
      const remaining = (s.total_sessions || s.sessions_count || 0) - (s.used_sessions || 0);
      if (remaining <= 0) return false;
    }
    // For group/online: check expiry
    if (targetType !== "personal" && s.expires_at) {
      if (new Date(s.expires_at) < new Date()) return false;
    }
    return true;
  });

  // Return oldest (first created)
  return matching.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0] || null;
}
