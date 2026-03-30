import { base44 } from "@/api/base44Client";

/**
 * יצירת התראה חדשה במערכת
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  relatedEntityType = null,
  relatedEntityId = null
}) {
  try {
    await base44.entities.Notification.create({
      userId,
      type,
      title,
      message,
      isRead: false,
      relatedEntityType,
      relatedEntityId
    });
  } catch (error) {
    console.error("[createNotification] Error:", error);
  }
}

/**
 * יצירת התראה למתאמן כשנוצרה תוכנית אימון
 */
export async function notifyTrainingPlanCreated({ traineeId, traineeName, planName, coachName }) {
  await createNotification({
    userId: traineeId,
    type: "training_plan",
    title: "תוכנית אימון חדשה!",
    message: `${coachName} יצר עבורך את התוכנית "${planName}"`,
    relatedEntityType: "TrainingPlan"
  });
}

/**
 * יצירת התראה למתאמן כשנוצר מפגש
 */
export async function notifySessionCreated({ traineeId, sessionDate, sessionTime, sessionType, coachName }) {
  await createNotification({
    userId: traineeId,
    type: "session",
    title: "מפגש חדש נקבע",
    message: `${coachName} קבע עבורך ${sessionType} ב-${sessionDate} בשעה ${sessionTime}`,
    relatedEntityType: "Session"
  });
}

/**
 * יצירת התראה למאמן כשמתאמן אישר מפגש
 */
export async function notifySessionConfirmed({ coachId, traineeName, sessionDate, sessionTime }) {
  await createNotification({
    userId: coachId,
    type: "session",
    title: "אישור השתתפות במפגש",
    message: `${traineeName} אישר השתתפות במפגש ב-${sessionDate} בשעה ${sessionTime}`,
    relatedEntityType: "Session"
  });
}

/**
 * יצירת התראה למאמן כשמתאמן ביטל מפגש
 */
export async function notifySessionCancelled({ coachId, traineeName, sessionDate, sessionTime }) {
  await createNotification({
    userId: coachId,
    type: "session",
    title: "ביטול השתתפות במפגש",
    message: `${traineeName} ביטל השתתפות במפגש ב-${sessionDate} בשעה ${sessionTime}`,
    relatedEntityType: "Session"
  });
}

/**
 * יצירת התראה למאמן כשמתאמן השלים אימון
 */
export async function notifyWorkoutCompleted({ coachId, traineeName, workoutName }) {
  await createNotification({
    userId: coachId,
    type: "workout_completion",
    title: "אימון הושלם!",
    message: `${traineeName} השלים את האימון "${workoutName}"`,
    relatedEntityType: "WorkoutLog"
  });
}

/**
 * יצירת התראה למאמן כשנרשם מתאמן חדש
 */
export async function notifyNewTrainee({ coachId, traineeName }) {
  await createNotification({
    userId: coachId,
    type: "new_trainee",
    title: "מתאמן חדש נרשם!",
    message: `${traineeName} הצטרף למערכת`,
    relatedEntityType: "User"
  });
}

/**
 * יצירת התראה למאמן כשליד הפך ללקוח
 */
export async function notifyLeadConverted({ coachId, clientName }) {
  await createNotification({
    userId: coachId,
    type: "lead_converted",
    title: "המרת ליד ללקוח!",
    message: `${clientName} הומר ללקוח פעיל במערכת`,
    relatedEntityType: "Lead"
  });
}

/**
 * יצירת התראה למתאמן על נותרו אימונים בחבילה
 */
export async function notifySessionsRemaining({ traineeId, remainingSessions, packageName }) {
  if (remainingSessions <= 2 && remainingSessions > 0) {
    await createNotification({
      userId: traineeId,
      type: "subscription",
      title: "נותרו אימונים בחבילה",
      message: `נותרו ${remainingSessions} אימונים בחבילה "${packageName}"`,
      relatedEntityType: "ClientService"
    });
  }
}

/**
 * יצירת התראה למתאמן על מנוי שעומד לפוג
 */
export async function notifySubscriptionExpiring({ traineeId, packageName, daysRemaining }) {
  if (daysRemaining <= 7 && daysRemaining > 0) {
    await createNotification({
      userId: traineeId,
      type: "subscription",
      title: "המנוי עומד לפוג",
      message: `החבילה "${packageName}" תפוג בעוד ${daysRemaining} ימים`,
      relatedEntityType: "ClientService"
    });
  }
}