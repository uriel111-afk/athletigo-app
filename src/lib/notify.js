import { supabase } from '@/lib/supabaseClient';

export const NOTIFICATION_TYPES = {
  session_request:        { label: 'בקשת מפגש ממתאמן',  recommended: true,  category: 'אימונים' },
  session_confirmed:      { label: 'מתאמן אישר מפגש',    recommended: true,  category: 'אימונים' },
  reschedule_request:     { label: 'בקשת שינוי מועד',    recommended: true,  category: 'אימונים' },
  new_lead:               { label: 'ליד חדש',            recommended: true,  category: 'מכירות' },
  package_expiring:       { label: 'חבילה עומדת להיגמר', recommended: true,  category: 'מכירות' },
  new_record:             { label: 'מתאמן שבר שיא',      recommended: true,  category: 'הישגים' },
  exercise_completed:     { label: 'מתאמן סיים תרגיל',   recommended: false, category: 'רעש' },
  workout_completion:     { label: 'מתאמן סיים אימון',   recommended: false, category: 'רעש' },
  session_status_changed: { label: 'שינוי סטטוס מפגש',   recommended: false, category: 'רעש' },
  metrics_updated:        { label: 'עדכון מדדים',        recommended: false, category: 'רעש' },
  subscription:           { label: 'עדכון חבילה',        recommended: false, category: 'רעש' },
};

export function isEnabled(type, prefs) {
  if (prefs && Object.prototype.hasOwnProperty.call(prefs, type)) return prefs[type] === true;
  return NOTIFICATION_TYPES[type]?.recommended ?? true;
}

/**
 * Insert a coach "חבילה הסתיימה" (service_completed) notification, de-duplicated
 * per package. Two completion code paths — useServiceDeduction.deductSessionFromService
 * and TraineeProfile's session-status mutation — can both fire for the same event;
 * this guard skips the insert when an unread service_completed for the same
 * coach + package (via related_id) already exists, so the coach never gets two
 * identical alerts. Also blocks re-fires from toggling a session attended/unattended.
 */
export async function notifyServiceCompletedOnce({ coachId, packageId, packageName, traineeName }) {
  if (!coachId) return null;
  try {
    let q = supabase
      .from('notifications')
      .select('id')
      .eq('user_id', coachId)
      .eq('type', 'service_completed')
      .eq('is_read', false);
    // related_id carries the package id so both call sites converge on one guard.
    if (packageId) q = q.eq('related_id', packageId);
    const { data: existing } = await q.limit(1);
    if (existing && existing.length > 0) return null;

    const { data: row, error } = await supabase
      .from('notifications')
      .insert({
        user_id: coachId,
        type: 'service_completed',
        title: 'חבילה הסתיימה',
        message: `חבילה "${packageName || 'חבילה'}" של ${traineeName || 'מתאמן'} הסתיימה`,
        related_id: packageId || null,
        data: traineeName ? { trainee_name: traineeName } : {},
        is_read: false,
      })
      .select()
      .single();
    if (error) { console.error('[notify] service_completed error:', error); return null; }
    return row;
  } catch (e) {
    console.error('[notify] service_completed exception:', e);
    return null;
  }
}

export async function createNotification({ userId, type, message, data = {}, traineeId = null, traineeName = null }) {
  try {
    const { data: u } = await supabase
      .from('users')
      .select('notification_prefs')
      .eq('id', userId)
      .single();
    if (!isEnabled(type, u?.notification_prefs || {})) {
      console.log('[notify] skipped:', type);
      return null;
    }
    // Denormalize trainee id + name into data so the coach's
    // notifications page can title each group WITHOUT a users lookup
    // (that lookup is fragile — one bad id 400s the whole batch — and
    // old rows carry no name at all).
    const enrichedData = {
      ...data,
      ...(traineeId ? { trainee_id: data.trainee_id || traineeId } : {}),
      ...(traineeName ? { trainee_name: data.trainee_name || traineeName } : {}),
    };
    const { data: row, error } = await supabase
      .from('notifications')
      .insert({ user_id: userId, type, message, data: enrichedData, trainee_id: traineeId, is_read: false })
      .select()
      .single();
    if (error) { console.error('[notify] error:', error); return null; }
    return row;
  } catch (e) {
    console.error('[notify] exception:', e);
    return null;
  }
}
