import { base44 } from '@/api/base44Client';

// Helper — silently swallow notification errors so they never break the main flow
async function createNotification(payload) {
  try {
    await base44.entities.Notification.create({
      ...payload,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[notificationTriggers] Failed to create notification:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// COACH → TRAINEE notifications
// ═══════════════════════════════════════════════════════════════

export async function notifySessionScheduled({ traineeId, sessionId, sessionDate, sessionTime, sessionType, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'session_scheduled',
    title: 'מפגש נקבע',
    message: `${coachName} קבע מפגש ${sessionType} בתאריך ${sessionDate} בשעה ${sessionTime}`,
    data: { session_id: sessionId, session_date: sessionDate, session_time: sessionTime },
  });
}

export async function notifySessionApproved({ traineeId, sessionId, sessionDate, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'session_approved',
    title: 'המפגש אושר',
    message: `${coachName || 'המאמן'} אישר את המפגש שלך בתאריך ${sessionDate}`,
    data: { session_id: sessionId },
  });
}

export async function notifySessionRejected({ traineeId, sessionId, sessionDate, coachName, notes }) {
  await createNotification({
    user_id: traineeId,
    type: 'session_rejected',
    title: 'בקשת המפגש נדחתה',
    message: `${coachName || 'המאמן'} דחה את בקשת המפגש בתאריך ${sessionDate}${notes ? '\nהערה: ' + notes : ''}`,
    data: { session_id: sessionId },
  });
}

export async function notifyPlanCreated({ traineeId, traineeName, planName, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'plan_created',
    title: 'תוכנית אימון חדשה',
    message: `${coachName} יצר עבורך תוכנית אימון חדשה: ${planName}`,
  });
}

export async function notifyPlanUpdated({ traineeId, planName, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'plan_updated',
    title: 'תוכנית אימון עודכנה',
    message: `${coachName} עדכן את תוכנית האימון: ${planName}`,
  });
}

export async function notifyExerciseUpdated({ traineeId, planName, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'exercise_updated',
    title: 'תרגיל עודכן',
    message: `${coachName} עדכן תרגיל בתוכנית: ${planName}`,
  });
}

export async function notifyRenewalRequest({ traineeId, coachName, packageName }) {
  await createNotification({
    user_id: traineeId,
    type: 'renewal_request',
    title: 'בקשת חידוש חבילה',
    message: `${coachName || 'המאמן'} שלח בקשת חידוש עבור חבילה "${packageName || 'חבילה'}"`,
  });
}

export async function notifySessionCompleted({ traineeId, sessionDate, sessionType, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'session_completed',
    title: 'מפגש בוצע',
    message: `${coachName} סימן את מפגש ה${sessionType} בתאריך ${sessionDate} כ"בוצע"`,
  });
}

export async function notifyTraineeMetricsUpdated({ traineeId, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'metrics_updated_by_coach',
    title: 'מדידות עודכנו על ידי המאמן',
    message: `${coachName} עדכן את המדידות שלך`,
  });
}

// ═══════════════════════════════════════════════════════════════
// TRAINEE → COACH notifications
// ═══════════════════════════════════════════════════════════════

export async function notifySessionRequest({ coachId, traineeId, traineeName, sessionId, sessionDate, sessionTime }) {
  await createNotification({
    user_id: coachId,
    type: 'session_request',
    title: 'בקשת מפגש חדשה',
    message: `${traineeName} ביקש מפגש חדש בתאריך ${sessionDate} בשעה ${sessionTime}`,
    data: { session_id: sessionId, trainee_id: traineeId },
    action_label: 'אשר',
    related_id: sessionId,
  });
}

export async function notifySessionConfirmed({ coachId, traineeName, sessionId, sessionDate }) {
  await createNotification({
    user_id: coachId,
    type: 'session_confirmed',
    title: 'מפגש אושר על ידי מתאמן',
    message: `${traineeName} אישר את המפגש בתאריך ${sessionDate}`,
    data: { session_id: sessionId },
  });
}

export async function notifyNewRecord({ coachId, traineeId, traineeName, recordName }) {
  await createNotification({
    user_id: coachId,
    type: 'new_record',
    title: 'שיא חדש',
    message: `${traineeName} הוסיף שיא חדש: ${recordName}`,
    data: { trainee_id: traineeId },
  });
}

export async function notifyNewBaseline({ coachId, traineeId, traineeName }) {
  await createNotification({
    user_id: coachId,
    type: 'new_baseline',
    title: 'בייסליין חדש',
    message: `${traineeName} הוסיף בייסליין חדש`,
    data: { trainee_id: traineeId },
  });
}

export async function notifyExerciseCompleted({ coachId, traineeName, traineeId, exerciseName }) {
  await createNotification({
    user_id: coachId,
    type: 'exercise_completed',
    title: 'תרגיל הושלם',
    message: `${traineeName} השלים את התרגיל: ${exerciseName}`,
  });
}

export async function notifyMetricsUpdated({ coachId, traineeName, traineeId }) {
  await createNotification({
    user_id: coachId,
    type: 'metrics_updated',
    title: 'מדידות עודכנו',
    message: `${traineeName} עדכן מדידות גוף`,
  });
}

export async function notifyNewMessage({ recipientId, senderName, messagePreview }) {
  await createNotification({
    user_id: recipientId,
    type: 'new_message',
    title: `הודעה חדשה מ-${senderName}`,
    message: messagePreview || '',
  });
}
