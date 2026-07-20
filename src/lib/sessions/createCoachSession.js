import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { syncSessionParticipants } from '@/components/hooks/useServiceDeduction';
import { invalidateDashboard } from '@/components/utils/queryKeys';
import { notifySessionScheduled } from '@/functions/notificationTriggers';

// ═══════════════════════════════════════════════════════════════════
// createCoachSession — the SINGLE source of truth for creating a coach
// session that trainees see. Extracted verbatim from the proven
// Sessions.jsx (מפגשים) create path so both מפגשים and the Focus
// Calendar run identical logic:
//   trainee-required check → casual client_status gate → strip the
//   dialog-only additional_participants → status precedence →
//   base44 Session.create → syncSessionParticipants → trainee
//   notifications → query invalidations.
// Takes the SAME `sessionData` shape SessionFormDialog emits (incl. the
// `participants` jsonb + denormalized `trainee_id`), so the trainee side
// (participants.some(p => p.trainee_id === me)) picks it up exactly like
// a session created from מפגשים.
// Throws on validation failure so the caller can keep its form open.
// ═══════════════════════════════════════════════════════════════════
export async function createCoachSession({ coach, sessionData, queryClient }) {
  if (!coach || !coach.id) {
    throw new Error('שגיאה: לא ניתן לטעון את פרטי המאמן. אנא רענן את הדף.');
  }

  const hasTrainee = !!sessionData?.trainee_id
    || (Array.isArray(sessionData?.participants) && sessionData.participants.some((p) => p?.trainee_id));
  if (!hasTrainee) throw new Error('יש לבחור מתאמן למפגש');

  // Casual gate: if ANY participant is casual, the session waits for
  // their approval (same safer-side rule as מפגשים).
  let traineeStatus = null;
  const traineeIds = [];
  if (sessionData?.trainee_id) traineeIds.push(sessionData.trainee_id);
  if (Array.isArray(sessionData?.participants)) {
    for (const p of sessionData.participants) if (p?.trainee_id) traineeIds.push(p.trainee_id);
  }
  if (traineeIds.length > 0) {
    try {
      const { data } = await supabase.from('users').select('client_status').in('id', traineeIds);
      if ((data || []).some((row) => row?.client_status === 'casual')) traineeStatus = 'casual';
    } catch (e) {
      console.warn('[createCoachSession] client_status lookup failed:', e?.message);
    }
  }

  const { additional_participants, ...sessionDataNoExtras } = sessionData;
  const fullSessionData = {
    ...sessionDataNoExtras,
    location: sessionDataNoExtras.location || 'לא צוין',
    duration: sessionDataNoExtras.duration || 60,
    coach_id: coach.id,
    status: sessionDataNoExtras.status === 'הושלם'
      ? 'הושלם'
      : (traineeStatus === 'casual' ? 'pending_approval' : 'ממתין לאישור'),
  };

  const created = await base44.entities.Session.create(fullSessionData);
  const savedId = created?.id || null;

  if (savedId && Array.isArray(additional_participants)) {
    try { await syncSessionParticipants(savedId, additional_participants); }
    catch (e) { console.warn('[createCoachSession] participants sync failed:', e?.message); }
  }

  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
    invalidateDashboard(queryClient);
  }

  // Notify each participant trainee — same as the מפגשים create flow.
  if (created?.participants && coach) {
    for (const participant of created.participants) {
      try {
        await notifySessionScheduled({
          traineeId: participant.trainee_id,
          sessionId: created.id,
          sessionDate: created.date,
          sessionTime: created.time,
          sessionType: created.session_type,
          coachName: coach.full_name,
        });
      } catch (e) { console.warn('[createCoachSession] notify failed:', e?.message); }
    }
    if (queryClient) queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  toast.success('✅ המפגש נוצר בהצלחה');
  return created;
}
