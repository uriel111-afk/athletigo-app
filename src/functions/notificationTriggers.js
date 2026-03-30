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
    userId: traineeId,
    type: 'session_scheduled',
    title: 'מפגש נקבע',
    message: `${coachName} קבע מפגש ${sessionType} בתאריך ${sessionDate} בשעה ${sessionTime}`,
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyPlanCreated({ traineeId, traineeName, planName, coachName }) {
  await createNotification({
    userId: traineeId,
    type: 'plan_created',
    title: 'תוכנית אימון חדשה',
    message: `${coachName} יצר עבורך תוכנית אימון חדשה: ${planName}`,
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyExerciseCompleted({ coachId, traineeName, traineeId, exerciseName }) {
  await createNotification({
    userId: coachId,
    type: 'exercise_completed',
    title: 'תרגיל הושלם',
    message: `${traineeName} השלים את התרגיל: ${exerciseName}`,
    related_user_id: traineeId,
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyExerciseUpdated({ traineeId, planName, coachName }) {
  await createNotification({
    userId: traineeId,
    type: 'exercise_updated',
    title: 'תרגיל עודכן',
    message: `${coachName} עדכן תרגיל בתוכנית: ${planName}`,
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyPlanUpdated({ traineeId, planName, coachName }) {
  await createNotification({
    userId: traineeId,
    type: 'plan_updated',
    title: 'תוכנית אימון עודכנה',
    message: `${coachName} עדכן את תוכנית האימון: ${planName}`,
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyNewMessage({ recipientId, senderName, messagePreview }) {
  await createNotification({
    userId: recipientId,
    type: 'new_message',
    title: `הודעה חדשה מ-${senderName}`,
    message: messagePreview || '',
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyMetricsUpdated({ coachId, traineeName, traineeId }) {
  await createNotification({
    userId: coachId,
    type: 'metrics_updated',
    title: 'מדידות עודכנו',
    message: `${traineeName} עדכן מדידות גוף`,
    related_user_id: traineeId,
    read: false,
    created_date: new Date().toISOString(),
  });
}

export async function notifyTraineeMetricsUpdated({ traineeId, coachName }) {
  await createNotification({
    userId: traineeId,
    type: 'metrics_updated_by_coach',
    title: 'מדידות עודכנו על ידי המאמן',
    message: `${coachName} עדכן את המדידות שלך`,
    read: false,
    created_date: new Date().toISOString(),
  });
}
