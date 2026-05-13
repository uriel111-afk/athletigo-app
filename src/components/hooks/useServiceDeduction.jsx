import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { syncPackageStatus } from "@/lib/packageStatus";
import { supabase } from "@/lib/supabaseClient";

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
 * Multi-participant deduction. Walks `session_participants` rows linked
 * to this session and charges each one against their own package — fully
 * independent of the main trainee's deduction above. A row without a
 * resolvable active package is left at `deducted=false` so a coach can
 * link a package later and re-run completion; nothing throws.
 */
export async function deductSessionFromAllParticipants(session, coachId) {
  if (!session?.id) return { results: [] };
  try {
    const { data: parts, error } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', session.id)
      .eq('deducted', false);
    if (error) {
      console.warn('[ParticipantsDeduct] fetch failed:', error.message);
      return { results: [] };
    }
    if (!parts || parts.length === 0) return { results: [] };

    const results = [];
    for (const p of parts) {
      try {
        // Resolve the package: prefer the explicit link on the row;
        // fall back to the trainee's oldest active package so coaches
        // who skipped the dropdown still get deduction.
        let pkg = null;
        if (p.package_id) {
          const { data } = await supabase
            .from('client_services')
            .select('*')
            .eq('id', p.package_id)
            .maybeSingle();
          pkg = data;
        }
        if (!pkg) {
          const { data } = await supabase
            .from('client_services')
            .select('*')
            .eq('trainee_id', p.trainee_id)
            .in('status', ['active', 'פעיל'])
            .order('created_at', { ascending: true })
            .limit(1);
          pkg = data?.[0] || null;
        }
        if (!pkg || pkg.package_type === 'group') {
          results.push({ trainee_id: p.trainee_id, deducted: false, reason: pkg ? 'group_pkg' : 'no_pkg' });
          continue;
        }
        const total = pkg.total_sessions || pkg.sessions_count || 0;
        const used = pkg.used_sessions || 0;
        if (total <= 0 || used >= total) {
          results.push({ trainee_id: p.trainee_id, deducted: false, reason: 'depleted' });
          continue;
        }
        const prevRemaining = total - used;
        const newUsed = used + 1;
        const newRemaining = total - newUsed;
        const finalStatus = newRemaining <= 0 ? 'completed' : pkg.status;

        await supabase
          .from('client_services')
          .update({
            used_sessions: newUsed,
            sessions_remaining: newRemaining,
            status: finalStatus,
          })
          .eq('id', pkg.id);
        try { await syncPackageStatus(pkg.id); } catch {}

        await supabase
          .from('session_participants')
          .update({ deducted: true })
          .eq('id', p.id);

        try {
          await base44.entities.ServiceTransaction.create({
            service_id: pkg.id,
            session_id: session.id,
            action_type: 'deduct',
            units_changed: -1,
            previous_remaining: prevRemaining,
            new_remaining: newRemaining,
            notes: `קיזוז משתתף נוסף — ${pkg.package_name || pkg.service_type || ''}`.trim(),
            created_by: coachId,
          });
        } catch {}

        results.push({ trainee_id: p.trainee_id, deducted: true, newRemaining });
      } catch (e) {
        console.warn('[ParticipantsDeduct] per-participant failed:', e?.message);
        results.push({ trainee_id: p.trainee_id, deducted: false, reason: 'threw' });
      }
    }
    return { results };
  } catch (error) {
    console.error('[ParticipantsDeduct] Error:', error);
    return { results: [] };
  }
}

/**
 * Mirror of restoreSessionToService for the multi-participant rows.
 * Reverses anything already marked `deducted=true` and clears the flag
 * so a re-completion later re-deducts cleanly.
 */
export async function restoreSessionFromAllParticipants(session, coachId) {
  if (!session?.id) return { results: [] };
  try {
    const { data: parts, error } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', session.id)
      .eq('deducted', true);
    if (error || !parts || parts.length === 0) return { results: [] };

    const results = [];
    for (const p of parts) {
      try {
        if (!p.package_id) {
          // Can't safely restore without knowing which package was
          // hit — leave the flag set so manual reconciliation works.
          results.push({ trainee_id: p.trainee_id, restored: false, reason: 'no_pkg_link' });
          continue;
        }
        const { data: pkg } = await supabase
          .from('client_services')
          .select('*')
          .eq('id', p.package_id)
          .maybeSingle();
        if (!pkg || pkg.package_type === 'group') {
          results.push({ trainee_id: p.trainee_id, restored: false, reason: pkg ? 'group_pkg' : 'no_pkg' });
          continue;
        }
        const newUsed = Math.max(0, (pkg.used_sessions || 0) - 1);
        const total = pkg.total_sessions || pkg.sessions_count || 0;
        const newRemaining = total - newUsed;
        await supabase
          .from('client_services')
          .update({
            used_sessions: newUsed,
            sessions_remaining: newRemaining,
            status: pkg.status === 'completed' ? 'פעיל' : pkg.status,
          })
          .eq('id', pkg.id);
        try { await syncPackageStatus(pkg.id); } catch {}

        await supabase
          .from('session_participants')
          .update({ deducted: false })
          .eq('id', p.id);

        try {
          await base44.entities.ServiceTransaction.create({
            service_id: pkg.id,
            session_id: session.id,
            action_type: 'restore',
            units_changed: 1,
            previous_remaining: newRemaining - 1,
            new_remaining: newRemaining,
            notes: 'החזרה — מפגש בוטל (משתתף נוסף)',
            created_by: coachId,
          });
        } catch {}

        results.push({ trainee_id: p.trainee_id, restored: true, newRemaining });
      } catch (e) {
        console.warn('[ParticipantsRestore] per-participant failed:', e?.message);
        results.push({ trainee_id: p.trainee_id, restored: false, reason: 'threw' });
      }
    }
    return { results };
  } catch (error) {
    console.error('[ParticipantsRestore] Error:', error);
    return { results: [] };
  }
}

/**
 * Replace-all sync of the session_participants rows. Called after a
 * session is created/edited so the UI's `additional_participants`
 * array becomes the source of truth — except rows already flagged
 * `deducted=true` are preserved so an audit trail can't be erased
 * by editing the form.
 */
export async function syncSessionParticipants(sessionId, participants) {
  if (!sessionId) return { ok: false };
  const list = Array.isArray(participants) ? participants : [];
  try {
    // Drop only the unsettled rows; deducted ones stay as evidence.
    await supabase
      .from('session_participants')
      .delete()
      .eq('session_id', sessionId)
      .eq('deducted', false);

    if (list.length === 0) return { ok: true };

    // Skip dupes: if a trainee already has a deducted row, don't
    // double-insert — the existing row owns this session for them.
    const { data: existingDeducted } = await supabase
      .from('session_participants')
      .select('trainee_id')
      .eq('session_id', sessionId)
      .eq('deducted', true);
    const alreadyDeducted = new Set((existingDeducted || []).map(r => r.trainee_id));

    const rows = list
      .filter(p => p?.trainee_id && !alreadyDeducted.has(p.trainee_id))
      .map(p => ({
        session_id: sessionId,
        trainee_id: p.trainee_id,
        package_id: p.package_id || null,
        deducted: false,
      }));
    if (rows.length > 0) {
      await supabase.from('session_participants').insert(rows);
    }
    return { ok: true };
  } catch (e) {
    console.warn('[ParticipantsSync] failed:', e?.message);
    return { ok: false, error: e };
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
