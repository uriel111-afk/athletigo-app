import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import {
  Calendar, ClipboardList, Award, Activity, Bell,
  Check, X, Clock, MessageSquare, Loader2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

const TYPE_CONFIG = {
  session_scheduled: { icon: Calendar, color: "#FF6F20", label: "מפגש חדש" },
  session_completed: { icon: Check, color: "#4CAF50", label: "מפגש הושלם" },
  plan_created: { icon: ClipboardList, color: "#4CAF50", label: "תוכנית חדשה" },
  plan_updated: { icon: ClipboardList, color: "#2196F3", label: "תוכנית עודכנה" },
  exercise_updated: { icon: Activity, color: "#9C27B0", label: "תרגיל עודכן" },
  metrics_updated_by_coach: { icon: Activity, color: "#2196F3", label: "מדידות עודכנו" },
  new_trainee: { icon: Bell, color: "#607D8B", label: "מתאמן חדש" },
  service_completed: { icon: AlertTriangle, color: "#FFC107", label: "חבילה הסתיימה" },
};

const DEFAULT_CONFIG = { icon: Bell, color: "#607D8B", label: "התראה" };

export default function TraineeNotificationCard({ notification, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");

  const n = notification;
  const config = TYPE_CONFIG[n.type] || DEFAULT_CONFIG;
  const Icon = config.icon;
  const isSessionNotif = n.type === "session_scheduled";

  // Check if session can be cancelled (24h rule)
  const canCancel = () => {
    if (!n.data?.session_date || !n.data?.session_time) return true;
    try {
      const sessionDateTime = new Date(`${n.data.session_date}T${n.data.session_time}`);
      const hoursUntil = (sessionDateTime - new Date()) / (1000 * 60 * 60);
      return hoursUntil > 24;
    } catch { return true; }
  };

  const handleAction = async (action) => {
    setLoading(true);
    try {
      // Mark notification as actioned
      await base44.entities.Notification.update(n.id, {
        is_read: true,
        acknowledged_at: new Date().toISOString(),
      });

      if (action === "approve" && n.data?.session_id) {
        await base44.entities.Session.update(n.data.session_id, { status: "מאושר" });
        // Notify coach
        await base44.entities.Notification.create({
          user_id: n.created_by || n.coach_id,
          type: "session_approved",
          title: "מפגש אושר",
          message: `המתאמן אישר את המפגש בתאריך ${n.data.session_date || ""}`,
          is_read: false,
          data: { session_id: n.data.session_id },
        });
        toast.success("המפגש אושר");
      }

      if (action === "reject" && n.data?.session_id) {
        await base44.entities.Session.update(n.data.session_id, { status: "נדחה על ידי מתאמן" });
        await base44.entities.Notification.create({
          user_id: n.created_by || n.coach_id,
          type: "session_rejected",
          title: "מפגש נדחה",
          message: `המתאמן דחה את המפגש בתאריך ${n.data.session_date || ""}`,
          is_read: false,
          data: { session_id: n.data.session_id },
        });
        toast.success("המפגש נדחה — המאמן יקבל התראה");
      }

      if (action === "reschedule" && n.data?.session_id) {
        await base44.entities.Session.update(n.data.session_id, { status: "ממתין לאישור מאמן" });
        await base44.entities.Notification.create({
          user_id: n.created_by || n.coach_id,
          type: "session_reschedule_request",
          title: "בקשה לשינוי מועד",
          message: `המתאמן מבקש לשנות מועד ל-${rescheduleDate} ${rescheduleTime}${rescheduleNote ? "\nהערה: " + rescheduleNote : ""}`,
          is_read: false,
          data: { session_id: n.data.session_id, proposed_date: rescheduleDate, proposed_time: rescheduleTime },
        });
        setShowReschedule(false);
        toast.success("הצעת השינוי נשלחה למאמן");
      }

      if (action === "cancel" && n.data?.session_id) {
        if (!canCancel()) {
          toast.error("לא ניתן לבטל מפגש פחות מ-24 שעות לפני מועדו. אנא צור קשר ישיר עם המאמן.");
          setLoading(false);
          return;
        }
        await base44.entities.Session.update(n.data.session_id, { status: "בוטל על ידי מתאמן" });
        await base44.entities.Notification.create({
          user_id: n.created_by || n.coach_id,
          type: "session_cancelled_by_trainee",
          title: "מפגש בוטל על ידי מתאמן",
          message: `המתאמן ביטל את המפגש בתאריך ${n.data.session_date || ""}`,
          is_read: false,
          data: { session_id: n.data.session_id },
        });
        toast.success("המפגש בוטל — המאמן יקבל התראה");
      }

      if (action === "read") {
        await base44.entities.Notification.update(n.id, { is_read: true });
      }

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("[NotifCard] Action error:", error);
      toast.error("שגיאה: " + (error?.message || "נסה שוב"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Colored side bar */}
      <div className="flex">
        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: config.color }} />
        <div className="flex-1 p-3.5">
          {/* Header */}
          <div className="flex items-start gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: config.color + "15" }}>
              <Icon size={16} style={{ color: config.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: config.color + "15", color: config.color }}>
                  {config.label}
                </span>
              </div>
              <h4 className="font-bold text-sm text-gray-900 leading-tight">{n.title}</h4>
            </div>
          </div>

          {/* Message */}
          <p className="text-xs text-gray-600 leading-relaxed mb-3 whitespace-pre-line">{n.message}</p>

          {/* Session-specific actions */}
          {isSessionNotif && !n.acknowledged_at && (
            <>
              {!showReschedule ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button onClick={() => handleAction("approve")} disabled={loading} size="sm"
                      className="flex-1 h-9 rounded-xl font-bold text-white bg-green-500 hover:bg-green-600 text-xs">
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check size={14} className="ml-1" />אישור</>}
                    </Button>
                    <Button onClick={() => handleAction("reject")} disabled={loading} size="sm" variant="outline"
                      className="flex-1 h-9 rounded-xl font-bold text-red-500 border-red-200 hover:bg-red-50 text-xs">
                      <X size={14} className="ml-1" />דחייה
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowReschedule(true)} disabled={loading} size="sm" variant="outline"
                      className="flex-1 h-9 rounded-xl font-bold text-[#FF6F20] border-[#FF6F20]/30 hover:bg-orange-50 text-xs">
                      <Clock size={14} className="ml-1" />הצע שינוי
                    </Button>
                    {canCancel() && (
                      <Button onClick={() => handleAction("cancel")} disabled={loading} size="sm" variant="outline"
                        className="flex-1 h-9 rounded-xl font-bold text-gray-500 border-gray-200 text-xs">
                        ביטול מפגש
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <p className="text-xs font-bold text-gray-700">הצע תאריך ושעה חלופיים:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]} className="h-9 text-xs rounded-lg" />
                    <Input type="time" value={rescheduleTime} onChange={e => setRescheduleTime(e.target.value)}
                      className="h-9 text-xs rounded-lg" />
                  </div>
                  <Textarea value={rescheduleNote} onChange={e => setRescheduleNote(e.target.value)}
                    placeholder="הערה (אופציונלי)..." className="text-xs min-h-[50px] resize-none rounded-lg" />
                  <div className="flex gap-2">
                    <Button onClick={() => handleAction("reschedule")} disabled={loading || !rescheduleDate || !rescheduleTime}
                      size="sm" className="flex-1 h-9 rounded-xl font-bold text-white bg-[#FF6F20] hover:bg-[#e65b12] text-xs">
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "שלח הצעה"}
                    </Button>
                    <Button onClick={() => setShowReschedule(false)} size="sm" variant="outline"
                      className="h-9 rounded-xl text-xs">ביטול</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Non-session: just acknowledge/read */}
          {!isSessionNotif && !n.is_read && (
            <Button onClick={() => handleAction("read")} disabled={loading} size="sm" variant="outline"
              className="w-full h-9 rounded-xl text-xs font-bold">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "סמן כנקרא"}
            </Button>
          )}

          {n.is_read && !isSessionNotif && (
            <span className="text-[10px] text-gray-400">נקרא</span>
          )}
        </div>
      </div>
    </div>
  );
}
