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

export async function createNotification({ userId, type, message, data = {}, traineeId = null }) {
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
    const { data: row, error } = await supabase
      .from('notifications')
      .insert({ user_id: userId, type, message, data, trainee_id: traineeId, is_read: false })
      .select()
      .single();
    if (error) { console.error('[notify] error:', error); return null; }
    return row;
  } catch (e) {
    console.error('[notify] exception:', e);
    return null;
  }
}
