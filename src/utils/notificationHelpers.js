// Shared notification metadata helpers — used by both coach and trainee
// notification views. Keeps icon/color/title/response wording consistent.

export const getTypeIcon = (type) => {
  switch (type) {
    case 'session_request':
    case 'session_scheduled': return '📅';
    case 'session_approved':
    case 'session_confirmed': return '✅';
    case 'session_rejected':
    case 'session_cancelled_by_trainee': return '❌';
    case 'reschedule_request': return '🔄';
    case 'package_expiring':
    case 'low_balance':
    case 'renewal_alert':
    case 'renewal_request': return '💰';
    case 'package_expired':
    case 'service_completed': return '💸';
    case 'plan_assigned':
    case 'plan_created':
    case 'plan_updated':
    case 'plan_completed': return '📋';
    case 'task': return '📝';
    case 'record_broken':
    case 'new_record': return '🏆';
    case 'measurement_added':
    case 'metrics_updated': return '📐';
    case 'new_baseline': return '⚡';
    case 'goal_reached': return '🎯';
    case 'note':
    case 'coach_message':
    case 'new_message': return '💬';
    default: return '🔔';
  }
};

export const getTypeTitle = (type) => {
  switch (type) {
    case 'session_request': return 'בקשת מפגש';
    case 'session_scheduled': return 'מפגש נקבע';
    case 'session_approved':
    case 'session_confirmed': return 'מפגש אושר';
    case 'session_rejected': return 'מפגש נדחה';
    case 'session_cancelled_by_trainee': return 'מפגש בוטל';
    case 'reschedule_request': return 'בקשת שינוי מועד';
    case 'package_expiring':
    case 'low_balance':
    case 'renewal_alert': return 'חבילה עומדת להסתיים';
    case 'renewal_request': return 'בקשת חידוש';
    case 'package_expired':
    case 'service_completed': return 'חבילה הסתיימה';
    case 'plan_assigned':
    case 'plan_created': return 'תוכנית חדשה';
    case 'plan_updated': return 'תוכנית עודכנה';
    case 'plan_completed': return 'תוכנית הושלמה';
    case 'task': return 'משימה';
    case 'record_broken':
    case 'new_record': return 'שיא חדש';
    case 'new_baseline': return 'בייסליין חדש';
    case 'measurement_added': return 'מדידה חדשה';
    case 'metrics_updated': return 'מדדים עודכנו';
    case 'goal_reached': return 'יעד הושג';
    case 'note':
    case 'coach_message':
    case 'new_message': return 'הודעה מהמאמן';
    default: return 'התראה';
  }
};

export const getTypeColor = (type) => {
  if (type?.includes('session') || type === 'reschedule_request') return '#FF6F20';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return '#dc2626';
  if (type?.includes('plan')) return '#16a34a';
  if (type === 'task') return '#7F47B5';
  if (type?.includes('record') || type?.includes('goal') || type === 'new_record') return '#EAB308';
  if (type?.includes('baseline') || type?.includes('measurement') || type === 'metrics_updated') return '#7F47B5';
  if (type === 'note' || type === 'coach_message' || type === 'new_message') return '#1976D2';
  return '#FF6F20';
};

export const getTypeBg = (type) => {
  if (type?.includes('session') || type === 'reschedule_request') return '#FFF0E4';
  if (type?.includes('package') || type?.includes('renewal') || type === 'low_balance' || type === 'service_completed') return '#FFEBEE';
  if (type?.includes('plan')) return '#E8F5E9';
  if (type === 'task') return '#F3E8FF';
  if (type?.includes('record') || type?.includes('goal') || type === 'new_record') return '#FEF9C3';
  if (type?.includes('baseline') || type?.includes('measurement') || type === 'metrics_updated') return '#F3E8FF';
  if (type === 'note' || type === 'coach_message' || type === 'new_message') return '#E3F2FD';
  return '#FFF0E4';
};

// Response options shown to the trainee in the popup, varying by type.
export const getResponseOptions = (type) => {
  switch (type) {
    case 'session_request':
    case 'session_scheduled':
      return [
        { value: 'approved',  label: 'מאשר',     icon: '✅', primary: true  },
        { value: 'rejected',  label: 'לא מתאים', icon: '❌', primary: false },
        { value: 'reschedule', label: 'הצע שינוי', icon: '🔄', primary: false },
      ];
    case 'plan_assigned':
    case 'plan_created':
    case 'plan_completed':
      return [
        { value: 'read',     label: 'נקרא',      icon: '👀', primary: true  },
        { value: 'started',  label: 'התחלתי',    icon: '🏃', primary: false },
        { value: 'question', label: 'יש לי שאלה', icon: '❓', primary: false },
      ];
    case 'package_expiring':
    case 'package_expired':
    case 'low_balance':
    case 'renewal_alert':
    case 'service_completed':
      return [
        { value: 'interested', label: 'כן, מעוניין לחדש', icon: '✅', primary: true  },
        { value: 'not_now',    label: 'לא כרגע',          icon: '⏳', primary: false },
      ];
    case 'task':
      return [
        { value: 'done',          label: 'בוצע',       icon: '✅', primary: true  },
        { value: 'in_progress',   label: 'בתהליך',     icon: '🔄', primary: false },
        { value: 'didnt_manage',  label: 'לא הספקתי',  icon: '😅', primary: false },
      ];
    default:
      return [
        { value: 'read',   label: 'נקרא', icon: '👀', primary: true  },
        { value: 'thanks', label: 'תודה', icon: '❤️', primary: false },
      ];
  }
};

export const getResponseLabel = (response) => {
  switch (response) {
    case 'approved':     return '✅ אושר';
    case 'rejected':     return '❌ נדחה';
    case 'reschedule':   return '🔄 הצע שינוי';
    case 'read':         return '👀 נקרא';
    case 'started':      return '🏃 התחיל';
    case 'question':     return '❓ שאלה';
    case 'interested':   return '✅ מעוניין';
    case 'not_now':      return '⏳ לא כרגע';
    case 'done':         return '✅ בוצע';
    case 'in_progress':  return '🔄 בתהליך';
    case 'didnt_manage': return '😅 לא הספיק';
    case 'thanks':       return '❤️ תודה';
    default: return response;
  }
};

export const getResponseBadgeBg = (response) => {
  switch (response) {
    case 'approved': case 'done': case 'interested': case 'started':  return '#E8F5E9';
    case 'rejected': case 'didnt_manage':                             return '#FFEBEE';
    case 'read':     case 'thanks':                                   return '#E3F2FD';
    case 'reschedule': case 'in_progress': case 'not_now': case 'question': return '#FFF0E4';
    default: return '#F0F0F0';
  }
};

export const getResponseBadgeColor = (response) => {
  switch (response) {
    case 'approved': case 'done': case 'interested': case 'started':  return '#16a34a';
    case 'rejected': case 'didnt_manage':                             return '#dc2626';
    case 'read':     case 'thanks':                                   return '#1976D2';
    case 'reschedule': case 'in_progress': case 'not_now': case 'question': return '#FF6F20';
    default: return '#888';
  }
};

export const timeAgo = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString('he-IL');
};

export const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};
