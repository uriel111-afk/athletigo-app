import { base44 } from '@/api/base44Client';

// Helper — silently swallow notification errors so they never break the main flow
async function createNotification(payload) {
  try {
    await base44.entities.Notification.create(payload);
  } catch (err) {
    console.warn('[notificationTriggers] Failed to create notification:', err);
  }
}

export async function notifySessionScheduled({ traineeId, sessionDate, sessionTime, sessionType, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'session_scheduled',
    title: 'מפגש נקבע',
    message: `${coachName} קבע מפגש ${sessionType} בתאריך ${sessionDate} בשעה ${sessionTime}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyPlanCreated({ traineeId, traineeName, planName, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'plan_created',
    title: 'תוכנית אימון חדשה',
    message: `${coachName} יצר עבורך תוכנית אימון חדשה: ${planName}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyExerciseCompleted({ coachId, traineeName, traineeId, exerciseName }) {
  await createNotification({
    user_id: coachId,
    type: 'exercise_completed',
    title: 'תרגיל הושלם',
    message: `${traineeName} השלים את התרגיל: ${exerciseName}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyExerciseUpdated({ traineeId, planName, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'exercise_updated',
    title: 'תרגיל עודכן',
    message: `${coachName} עדכן תרגיל בתוכנית: ${planName}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyPlanUpdated({ traineeId, planName, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'plan_updated',
    title: 'תוכנית אימון עודכנה',
    message: `${coachName} עדכן את תוכנית האימון: ${planName}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyNewMessage({ recipientId, senderName, messagePreview }) {
  await createNotification({
    user_id: recipientId,
    type: 'new_message',
    title: `הודעה חדשה מ-${senderName}`,
    message: messagePreview || '',
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyMetricsUpdated({ coachId, traineeName, traineeId }) {
  await createNotification({
    user_id: coachId,
    type: 'metrics_updated',
    title: 'מדידות עודכנו',
    message: `${traineeName} עדכן מדידות גוף`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function notifyTraineeMetricsUpdated({ traineeId, coachName }) {
  await createNotification({
    user_id: traineeId,
    type: 'metrics_updated_by_coach',
    title: 'מדידות עודכנו על ידי המאמן',
    message: `${coachName} עדכן את המדידות שלך`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}
