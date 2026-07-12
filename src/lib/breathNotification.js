// ── Ongoing Android notification for an active breathing exercise ──────
// Uses @capacitor/local-notifications with { ongoing:true, autoCancel:false }
// so the notification is sticky (can't be swiped away) while the exercise
// runs — no foreground service needed. Content (current phase + round)
// updates by re-scheduling the SAME id. Tapping it opens the app, which
// restores the running exercise via the durable session (BreathingMode +
// Clocks focus). Web / iOS: every call is a safe no-op.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const NOTIF_ID = 8421;           // stable → re-schedule replaces (updates) it
const CHANNEL_ID = 'breathing';
const BRAND_ORANGE = '#FF6F20';  // notification accent (Lumen brand orange)

const native = () => Capacitor.isNativePlatform();
let permission = null;   // null = not asked yet
let channelReady = false;

// Request POST_NOTIFICATIONS (Android 13+) and create the channel once.
export async function ensureBreathPermission() {
  if (!native()) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    permission = p.display === 'granted';
  } catch { permission = false; }
  if (permission && !channelReady) {
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID, name: 'אימון נשימות', description: 'תרגיל נשימות פעיל',
        importance: 3, visibility: 1, // DEFAULT importance, public lock-screen
      });
      channelReady = true;
    } catch {}
  }
  return permission;
}

// Show / update the ongoing notification with the current phase + round.
export async function showBreathNotification(title, body) {
  if (!native() || permission === false) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID,
        title,
        body,
        channelId: CHANNEL_ID,
        ongoing: true,      // Android: sticky, not swipeable
        autoCancel: false,  // survives taps; only we cancel it
        largeIcon: 'ic_launcher', // the app icon
        iconColor: BRAND_ORANGE,
      }],
    });
  } catch {}
}

// Remove it — on finish, manual stop, or return to the app.
export async function clearBreathNotification() {
  if (!native()) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }); } catch {}
}
