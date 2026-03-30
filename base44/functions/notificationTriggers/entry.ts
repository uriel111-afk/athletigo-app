import { base44 } from "@/api/base44Client";

export async function notifyPlanCreated({ coachId, traineeId, traineeName, planName }) {
  try {
    await base44.entities.Notification.create({
      userId: traineeId,
      type: 'training_plan',
      title: 'תוכנית אימון חדשה 🎯',
      message: `המאמן שלך יצר לך תוכנית חדשה: "${planName}"`,
      isRead: false,
      relatedEntityType: 'TrainingPlan',
      actionUrl: `/my-plan`
    });
  } catch (error) {
    console.error('[notifyPlanCreated] Error:', error);
  }
}

export async function notifyPlanUpdated({ traineeId, planName }) {
  try {
    await base44.entities.Notification.create({
      userId: traineeId,
      type: 'training_plan',
      title: 'תוכנית עודכנה ✏️',
      message: `התוכנית "${planName}" עודכנה על ידי המאמן`,
      isRead: false,
      relatedEntityType: 'TrainingPlan',
      actionUrl: `/my-plan`
    });
  } catch (error) {
    console.error('[notifyPlanUpdated] Error:', error);
  }
}

export async function notifyExerciseCompleted({ coachId, traineeName, traineeId, exerciseName }) {
  try {
    await base44.entities.Notification.create({
      userId: coachId,
      type: 'workout_completion',
      title: 'תרגיל הושלם ✅',
      message: `${traineeName} השלים את התרגיל: ${exerciseName}`,
      isRead: false,
      relatedEntityType: 'Exercise',
      actionUrl: `/all-users`
    });
  } catch (error) {
    console.error('[notifyExerciseCompleted] Error:', error);
  }
}

export async function notifySessionCreated({ traineeId, traineeName, sessionDate, sessionTime }) {
  try {
    await base44.entities.Notification.create({
      userId: traineeId,
      type: 'session',
      title: 'מפגש חדש נקבע 📅',
      message: `נקבע מפגש ל-${sessionDate} בשעה ${sessionTime}`,
      isRead: false,
      relatedEntityType: 'Session',
      actionUrl: `/trainee-home`
    });
  } catch (error) {
    console.error('[notifySessionCreated] Error:', error);
  }
}

export async function notifySessionUpdated({ traineeId, sessionDate, sessionTime }) {
  try {
    await base44.entities.Notification.create({
      userId: traineeId,
      type: 'session',
      title: 'מפגש עודכן 🔄',
      message: `המפגש עודכן ל-${sessionDate} בשעה ${sessionTime}`,
      isRead: false,
      relatedEntityType: 'Session',
      actionUrl: `/trainee-home`
    });
  } catch (error) {
    console.error('[notifySessionUpdated] Error:', error);
  }
}

export async function notifyWorkoutCompleted({ coachId, traineeName, workoutName }) {
  try {
    await base44.entities.Notification.create({
      userId: coachId,
      type: 'workout_completion',
      title: 'אימון הושלם 🏆',
      message: `${traineeName} השלים את האימון: ${workoutName}`,
      isRead: false,
      relatedEntityType: 'WorkoutLog',
      actionUrl: `/all-users`
    });
  } catch (error) {
    console.error('[notifyWorkoutCompleted] Error:', error);
  }
}