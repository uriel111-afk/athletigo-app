import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Deduct 1 unit from the linked service when a session is completed.
 * Returns { deducted: boolean } so caller knows if deduction happened.
 */
export async function deductSessionFromService(session, coachId) {
  if (!session.service_id || session.was_deducted) return { deducted: false };

  try {
    // 1. Fetch the service
    const services = await base44.entities.ClientService.filter({ id: session.service_id });
    const service = services?.[0];
    if (!service) return { deducted: false };

    // 2. Check auto-deduct
    if (service.auto_deduct_enabled === false) return { deducted: false };

    // 3. Calculate new remaining
    const currentUsed = service.used_sessions || 0;
    const totalSessions = service.total_sessions || 0;
    const prevRemaining = totalSessions - currentUsed;
    if (prevRemaining <= 0) return { deducted: false }; // Already exhausted

    const newUsed = currentUsed + 1;
    const newRemaining = totalSessions - newUsed;

    // 4. Update service
    await base44.entities.ClientService.update(service.id, {
      used_sessions: newUsed,
      sessions_remaining: newRemaining,
      status: newRemaining <= 0 ? "completed" : service.status,
    });

    // 5. Mark session as deducted
    await base44.entities.Session.update(session.id, { was_deducted: true });

    // 6. Log transaction
    try {
      await base44.entities.ServiceTransaction.create({
        service_id: service.id,
        session_id: session.id,
        action_type: "deduct",
        units_changed: -1,
        previous_remaining: prevRemaining,
        new_remaining: newRemaining,
        notes: "קיזוז אוטומטי — מפגש הושלם",
        created_by: coachId,
      });
    } catch {} // Transaction log is non-critical

    // 7. Notifications
    if (newRemaining === 1) {
      toast.info(`נותר מפגש אחד בחבילה "${service.package_name || service.service_type}"`);
    } else if (newRemaining === 0) {
      toast.warning(`חבילה "${service.package_name || service.service_type}" הסתיימה`);
      try {
        await base44.entities.Notification.create({
          user_id: coachId,
          type: "service_completed",
          title: "חבילה הסתיימה",
          message: `חבילה "${service.package_name || service.service_type}" של ${service.trainee_name || "מתאמן"} הסתיימה — שקול להציע חבילה חדשה`,
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
 * Restore 1 unit when a completed session is reverted (cancelled/no-show).
 */
export async function restoreSessionToService(session, coachId) {
  if (!session.service_id || !session.was_deducted) return { restored: false };

  try {
    const services = await base44.entities.ClientService.filter({ id: session.service_id });
    const service = services?.[0];
    if (!service) return { restored: false };

    const currentUsed = Math.max(0, (service.used_sessions || 0) - 1);
    const totalSessions = service.total_sessions || 0;
    const newRemaining = totalSessions - currentUsed;

    await base44.entities.ClientService.update(service.id, {
      used_sessions: currentUsed,
      sessions_remaining: newRemaining,
      status: service.status === "completed" ? "פעיל" : service.status,
    });

    await base44.entities.Session.update(session.id, { was_deducted: false });

    try {
      await base44.entities.ServiceTransaction.create({
        service_id: service.id,
        session_id: session.id,
        action_type: "restore",
        units_changed: 1,
        previous_remaining: newRemaining - 1,
        new_remaining: newRemaining,
        notes: "החזרה — מפגש בוטל או לא הגיע",
        created_by: coachId,
      });
    } catch {}

    return { restored: true, newRemaining };
  } catch (error) {
    console.error("[ServiceRestore] Error:", error);
    return { restored: false };
  }
}
