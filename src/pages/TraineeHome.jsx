import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Calendar, Dumbbell, TrendingUp, User, Loader2, Bell, ShieldCheck, Package, ClipboardList, Clock as ClockIcon, Flame, Trophy, Star } from "lucide-react";
import { calculateStreak } from "@/components/ChallengeBank";
import { useTraineePermissions } from "@/hooks/useTraineePermissions";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BookingModal from "../components/BookingModal";
import PageLoader from "@/components/PageLoader";
import TraineeNotificationCard from "../components/TraineeNotificationCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { syncPackageStatus } from "@/lib/packageStatus";
import HealthDeclarationForm from "../components/forms/HealthDeclarationForm";
import WelcomeBlessingPopup from "../components/WelcomeBlessingPopup";

const DAILY_MESSAGES = [
  "הגוף זוכר כל מאמץ — כל חזרה בונה אותך מחדש",
  "כל אימון הוא הוכחה שאפשר — וכבר עושים את זה",
  "הדרך כבר התחילה — וכל צעד עליה סופר",
  "הגוף משיג בדיוק מה שהמוח מאמין בו",
  "כל יום שמתאמנים בונה גרסה חזקה יותר",
  "ההשקעה הכי משתלמת שיש — ומרגישים אותה כל יום",
  "כשמגיעים כשקשה — זה האימון שמשנה הכי הרבה",
  "תוצאות נבנות אימון אחד בכל פעם — בדיוק כמו שעושים כאן",
  "הכוח כבר בפנים — האימון רק מוציא אותו החוצה",
  "כל צעד קטן הוא התקדמות אמיתית שנשארת",
  "הגוף מתחזק, הראש מתחזק — הכל גדל יחד",
  "מתאמנים כדי להרגיש טוב — וזה מורגש",
  "כל אימון פותח אפשרויות שלא ידעת שיש לך",
  "המסע הזה שייך לך — וכבר בדרך",
  "היום הוא הזדמנות — ואתה כבר כאן",
];

const getDailyMessage = () => {
  const today = new Date();
  const seed = today.getFullYear() * 10000 +
               (today.getMonth() + 1) * 100 +
               today.getDate();
  const hash = (seed * 2654435761) >>> 0;
  const index = hash % DAILY_MESSAGES.length;
  return DAILY_MESSAGES[index];
};

export default function TraineeHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [mySessions, setMySessions] = useState([]);
  const [activeServices, setActiveServices] = useState([]);
  // Unread notifications modal
  const [unreadNotifs, setUnreadNotifs] = useState([]);
  const [showUnreadModal, setShowUnreadModal] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [firstSessionDate, setFirstSessionDate] = useState(null);
  // Casual onboarding flow: when the trainee has a session that the
  // coach booked but the trainee hasn't approved yet, we show an
  // approval banner that opens the health declaration. After signing,
  // a one-shot welcome popup fires.
  const [showHealthForm, setShowHealthForm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState(null);
  // Coach-controlled permissions. Defaults are TRUE so this is purely
  // additive — turning off a permission in CoachProfile hides the
  // related tab/section here.
  const { perms } = useTraineePermissions(user?.id);
  // Daily challenge — fetched separately so it stays fresh independent
  // of the main loadData refresh. Card sits at the top of home screen.
  const [todayChallenge, setTodayChallenge] = useState(null);
  const [challengeStreak, setChallengeStreak] = useState(0);
  // Undo flow: tap "ביצעתי" → 5s pending state with undo button → save.
  // Also a 30s post-save revert link in case it slipped through.
  const [pendingComplete, setPendingComplete] = useState(false);
  const undoTimerRef = React.useRef(null);
  const [showRevertLink, setShowRevertLink] = useState(false);
  const revertTimerRef = React.useRef(null);
  // Skill tracks assigned to this trainee — used both inside the
  // challenge card (to show track context + progress) and in a
  // dedicated "המסלולים שלי" section below.
  const [myTracks, setMyTracks] = useState([]);
  const [trackMilestones, setTrackMilestones] = useState({});
  const [expandedTrack, setExpandedTrack] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        // Some installs may have rows with NULL status, so we don't
        // filter on it — just skip explicit non-active values.
        const { data: tracks, error } = await supabase
          .from("skill_tracks")
          .select("*")
          .eq("trainee_id", user.id);
        if (error) { console.warn("[TraineeHome] tracks fetch:", error); return; }
        if (cancelled) return;
        const visible = (tracks || []).filter(t => !["archived", "completed"].includes((t.status || "").toLowerCase()));
        setMyTracks(visible);
        if (visible.length > 0) {
          const { data: ms } = await supabase
            .from("goal_milestones")
            .select("*")
            .in("track_id", visible.map(t => t.id))
            .order("value", { ascending: true });
          if (cancelled) return;
          const grouped = {};
          for (const m of (ms || [])) {
            if (!grouped[m.track_id]) grouped[m.track_id] = [];
            grouped[m.track_id].push(m);
          }
          setTrackMilestones(grouped);
        }
      } catch (e) {
        console.warn("[TraineeHome] my-tracks fetch:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const fetchDailyChallenge = useCallback(async (uid) => {
    if (!uid) return;
    const today = new Date().toISOString().split("T")[0];
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, message, is_read, data, created_at")
      .eq("user_id", uid)
      .eq("type", "daily_challenge")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) { console.warn("[TraineeHome] daily challenge fetch:", error); return; }
    const enriched = (data || []).map(c => {
      let parsed = c.data;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      return { ...c, parsed };
    });
    const todayCh = enriched.find(c => c.parsed?.sent_date === today);
    setTodayChallenge(todayCh || null);
    setChallengeStreak(calculateStreak(enriched));
  }, []);

  useEffect(() => { if (user?.id) fetchDailyChallenge(user.id); }, [user?.id, fetchDailyChallenge]);

  const actuallyCompleteChallenge = async () => {
    if (!todayChallenge) return;
    const updatedData = {
      ...(todayChallenge.parsed || {}),
      completed_at: new Date().toISOString(),
    };
    // notifications.data is JSONB — pass raw object, not stringified.
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, data: updatedData })
      .eq("id", todayChallenge.id);
    if (error) {
      toast.error("שגיאה: " + error.message);
      setPendingComplete(false);
      return;
    }
    setTodayChallenge(prev => prev ? { ...prev, is_read: true, parsed: updatedData } : prev);
    setChallengeStreak(prev => prev + 1);
    setPendingComplete(false);
    toast.success("🔥 כל הכבוד! הרצף ממשיך!");
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100, 50, 200]); } catch {}
    }
    // 30-second window to revert if it was a misclick
    setShowRevertLink(true);
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    revertTimerRef.current = setTimeout(() => setShowRevertLink(false), 30000);

    // Notify coach — best-effort, ignore failures
    if (todayChallenge.parsed?.coach_id) {
      try {
        await supabase.from("notifications").insert({
          user_id: todayChallenge.parsed.coach_id,
          type: "challenge_completed",
          message: `🏆 ${user.full_name} השלים/ה את האתגר: ${todayChallenge.parsed.challenge_text}`,
          is_read: false,
        });
      } catch {}
    }
  };

  const completeChallenge = () => {
    if (!todayChallenge || pendingComplete) return;
    // Optimistic UI: show success state immediately + 5s undo window
    setPendingComplete(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      actuallyCompleteChallenge();
    }, 5000);
  };

  const undoComplete = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setPendingComplete(false);
    toast.success("הפעולה בוטלה");
  };

  const revertComplete = async () => {
    if (!todayChallenge?.is_read) return;
    const updatedData = {
      ...(todayChallenge.parsed || {}),
      completed_at: null,
    };
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: false, data: updatedData })
      .eq("id", todayChallenge.id);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    setTodayChallenge(prev => prev ? { ...prev, is_read: false, parsed: updatedData } : prev);
    setChallengeStreak(prev => Math.max(0, prev - 1));
    setShowRevertLink(false);
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    toast.success("הפעולה בוטלה");
  };

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        if (currentUser) {
          const services = await base44.entities.ClientService.filter({ trainee_id: currentUser.id });
          if (services.length > 0 && services[0].created_by) {
            const coaches = await base44.entities.User.filter({ id: services[0].created_by });
            if (coaches.length > 0) setCoach(coaches[0]);
          }
          setActiveServices(services.filter(s => s.status === 'פעיל' || s.status === 'active'));

          // Load unread notifications
          try {
            const notifs = await base44.entities.Notification.filter({ user_id: currentUser.id }, '-created_at');
            const unread = notifs.filter(n => !n.is_read || (n.requires_acknowledgment && !n.acknowledged_at));
            if (unread.length > 0) {
              setUnreadNotifs(unread);
              setShowUnreadModal(true);
            }
          } catch (e) { console.error("Error fetching notifications", e); }

          // Fetch completed sessions count for streak card
          try {
            const allUserSessions = await base44.entities.Session.filter({}, '-date', 500);
            const mineCompleted = allUserSessions.filter(s =>
              s.participants?.some(p => p.trainee_id === currentUser.id) &&
              (s.status === 'הושלם' || s.status === 'התקיים' || s.status === 'הגיע')
            );
            setCompletedCount(mineCompleted.length);
            if (mineCompleted.length > 0) {
              const dates = mineCompleted.map(s => new Date(s.date)).sort((a, b) => a - b);
              setFirstSessionDate(dates[0]);
            }
          } catch (e) { console.error("Error fetching completed sessions", e); }

          // Fetch sessions
          try {
            // Attempt server-side filtering for privacy and performance
            // We filter by date to avoid loading old history
            const today = new Date().toISOString().split('T')[0];
            const allSessions = await base44.entities.Session.filter({
                date: { $gte: today }
            }, 'date', 100); // Limit 100 upcoming

            // Client-side filter for participants (as JSON array filtering might vary by backend)
            const userSessions = allSessions.filter(s => 
              s.participants?.some(p => p.trainee_id === currentUser.id)
            );
            
            setMySessions(userSessions);
          } catch (err) {
            console.error("Error fetching sessions", err);
          }
        }
      } catch (error) {
        console.error("Error loading home data:", error);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const weeksActive = useMemo(() => {
    if (!firstSessionDate) return 0;
    return Math.max(1, Math.ceil((Date.now() - firstSessionDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  }, [firstSessionDate]);

  const packageReminder = useMemo(() => {
    if (!activeServices.length) return null;
    const withBalance = activeServices
      .filter(s => s.total_sessions && s.total_sessions > 0)
      .map(s => ({ ...s, remaining: (s.total_sessions || 0) - (s.used_sessions || 0) }))
      .sort((a, b) => a.remaining - b.remaining);
    if (!withBalance.length) return null;
    const lowest = withBalance[0];
    if (lowest.remaining > 3) return null;
    return lowest;
  }, [activeServices]);

  const handleCancelSession = async (session) => {
    const sessionStart = new Date(`${session.date}T${session.time}`);
    const now = new Date();
    const diffHours = (sessionStart - now) / (1000 * 60 * 60);

    if (diffHours < 24) {
      // Less than 24 hours — cannot cancel, offer reschedule request
      toast.error("לא ניתן לבטל פחות מ-24 שעות לפני המפגש", { duration: 4000 });
      return;
    }

    if (confirm("האם לבטל את המפגש?")) {
      try {
        await base44.entities.Session.update(session.id, {
          status: "בוטל על ידי מתאמן",
          status_updated_at: new Date().toISOString(),
          status_updated_by: user.id
        });

        // Refund balance — find matching active package and restore 1 session
        if (session.service_id) {
          try {
            const svcs = await base44.entities.ClientService.filter({ id: session.service_id });
            const svc = svcs?.[0];
            if (svc && svc.used_sessions > 0) {
              await base44.entities.ClientService.update(svc.id, {
                used_sessions: Math.max(0, svc.used_sessions - 1),
                status: svc.status === 'completed' ? 'active' : svc.status,
              });
              await syncPackageStatus(svc.id);
            }
          } catch {}
        }

        // Notify coach
        if (coach?.id) {
          try {
            await base44.entities.Notification.create({
              user_id: coach.id,
              type: 'session_cancelled_by_trainee',
              title: 'מפגש בוטל על ידי מתאמן',
              message: `${user.full_name} ביטל את המפגש ב-${new Date(session.date).toLocaleDateString('he-IL')}`,
              is_read: false,
              data: { session_id: session.id },
            });
          } catch {}
        }

        setMySessions(prev => prev.map(s => s.id === session.id ? { ...s, status: "בוטל על ידי מתאמן" } : s));
        // Refresh active packages so the balance counter reflects the
        // refunded session immediately. Without this the trainee sees
        // the cancelled status but the package badge stays stale.
        try {
          const services = await base44.entities.ClientService.filter({ trainee_id: user.id });
          setActiveServices(services.filter(s => s.status === 'פעיל' || s.status === 'active'));
          console.log('[REFRESH] after cancel — sessions:', mySessions.length, 'active services:', services.length);
        } catch (e) { console.warn('[TraineeHome] refresh after cancel:', e); }
        toast.success("המפגש בוטל והיתרה הוחזרה לחבילה");
      } catch (err) {
        console.error("Error cancelling session", err);
        toast.error("שגיאה בביטול המפגש: " + (err?.message || "נסה שוב"));
      }
    }
  };

  const handleRescheduleRequest = async (session) => {
    try {
      if (coach?.id) {
        await base44.entities.Notification.create({
          user_id: coach.id,
          type: 'reschedule_request',
          title: 'בקשה לשינוי מועד',
          message: `${user.full_name} מבקש לשנות את תאריך המפגש ב-${new Date(session.date).toLocaleDateString('he-IL')} ${session.time}`,
          is_read: false,
          data: { session_id: session.id, trainee_id: user.id },
        });
      }
      toast.success("בקשת שינוי תאריך נשלחה למאמן");
    } catch (err) {
      console.error("Error sending reschedule request:", err);
      toast.error("שגיאה בשליחת הבקשה");
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'ממתין לאישור': 'bg-gray-100 text-gray-600',
      'מאושר': 'bg-green-100 text-green-700',
      'התקיים': 'bg-blue-100 text-blue-700',
      'בוטל על ידי מתאמן': 'bg-red-50 text-red-600',
      'בוטל על ידי מאמן': 'bg-red-50 text-red-600',
      'לא הגיע': 'bg-red-100 text-red-800'
    };
    return <span className={`px-2 py-1 rounded text-xs font-bold ${styles[status] || 'bg-gray-100'}`}>{status}</span>;
  };

  if (loading) {
    return <PageLoader />;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4" dir="rtl">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-3xl p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold mb-3">שגיאה בטעינת דף הבית</h1>
          <p className="text-sm text-gray-600 mb-6">אירעה שגיאה בטעינת הנתונים. אנא רענן את הדף או נסה שוב מאוחר יותר.</p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="w-full">רענן</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4" dir="rtl">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-3xl p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold mb-3">משתמש לא מזוהה</h1>
          <p className="text-sm text-gray-600 mb-6">לא נמצא משתמש מחובר. אנא התחבר מחדש.</p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="w-full">רענן</Button>
        </div>
      </div>
    );
  }

  const handleAcknowledge = async (notifId) => {
    setAcknowledgingId(notifId);
    try {
      await base44.entities.Notification.update(notifId, {
        is_read: true,
        acknowledged_at: new Date().toISOString(),
      });
      setUnreadNotifs(prev => prev.filter(n => n.id !== notifId));
      toast.success("✅ קריאה אושרה");
    } catch { toast.error("שגיאה"); }
    setAcknowledgingId(null);
  };

  const handleMarkRead = async (notifId) => {
    try {
      await base44.entities.Notification.update(notifId, { is_read: true });
      setUnreadNotifs(prev => prev.filter(n => n.id !== notifId));
    } catch {}
  };

  // First session the coach has booked that the trainee hasn't
  // approved yet. The banner is gated to the canonical
  // 'pending_approval' status so it ONLY shows for casual trainees
  // (Sessions.jsx writes that string only when client_status='casual'
  // — any other trainee gets the legacy 'ממתין לאישור' which is read
  // elsewhere as a generic "scheduled" state and shouldn't trigger
  // the health-declaration onboarding gate).
  const pendingApprovalSession = useMemo(
    () => mySessions.find((s) => s.status === 'pending_approval') || null,
    [mySessions]
  );

  return (
    <ErrorBoundary>
      {/* Casual onboarding gate — health declaration form +
          one-shot welcome popup. Both render at root so they're
          visible regardless of which scroll position the page is at. */}
      <HealthDeclarationForm
        isOpen={showHealthForm}
        onClose={() => setShowHealthForm(false)}
        trainee={user}
        coachId={coach?.id}
        sessionId={pendingSessionId}
        onSigned={async () => {
          setShowHealthForm(false);
          setShowWelcome(true);
          // Refresh sessions so the pending banner disappears.
          try {
            const { data } = await supabase
              .from('sessions')
              .select('*')
              .eq('trainee_id', user?.id)
              .order('date', { ascending: true });
            if (data) setMySessions(data);
          } catch (e) { console.warn('[TraineeHome] post-sign refresh:', e); }
        }}
      />
      <WelcomeBlessingPopup
        isOpen={showWelcome}
        onClose={() => setShowWelcome(false)}
      />

      {/* Unread notifications modal — large, clear, professional */}
      <Dialog open={showUnreadModal} onOpenChange={setShowUnreadModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #FF6F20, #FF8F50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', boxShadow: '0 4px 12px rgba(255,111,32,0.3)' }}>
                <Bell style={{ width: 28, height: 28, color: 'white' }} />
              </div>
              <DialogTitle className="text-2xl font-black" style={{ color: '#1a1a1a' }}>
                {unreadNotifs.length} התראות חדשות
              </DialogTitle>
              <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>לחץ על כל התראה כדי לסמן כנקראה</p>
            </div>
          </DialogHeader>
          <div className="space-y-3" style={{ maxHeight: '50vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {unreadNotifs.map(n => (
              <TraineeNotificationCard key={n.id} notification={n}
                onUpdate={async () => {
                  try {
                    const all = await base44.entities.Notification.filter({ user_id: user.id }, '-created_at');
                    const unread = all.filter(x => !x.is_read || (x.requires_acknowledgment && !x.acknowledged_at));
                    setUnreadNotifs(unread);
                    if (unread.length === 0) setShowUnreadModal(false);
                  } catch {}
                }} />
            ))}
            {unreadNotifs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>כל ההתראות טופלו</p>
              </div>
            )}
          </div>
          <Button
            onClick={() => setShowUnreadModal(false)}
            className="w-full rounded-xl mt-3 min-h-[48px] text-base font-bold"
            style={{ backgroundColor: '#FF6F20', color: 'white' }}
          >
            סגור
          </Button>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen pb-24 bg-[#F8F8F8]" dir="rtl" style={{ fontSize: 16 }}>
        <div className="max-w-4xl mx-auto">

        {/* Orange Header with greeting + quote */}
        <div style={{ background:'#FF6F20', borderRadius:'0 0 24px 24px', padding:'20px 18px 22px' }}>
          <div style={{fontSize:'13px',color:'rgba(255,255,255,0.8)',fontWeight:'600',marginBottom:'4px'}}>
            {new Date().getHours() < 12 ? 'בוקר טוב' : new Date().getHours() < 17 ? 'צהריים טובים' : new Date().getHours() < 21 ? 'ערב טוב' : 'לילה טוב'} 👋
          </div>
          <div style={{fontSize:'28px',fontWeight:'900',color:'white',marginBottom:'14px',lineHeight:1.2}}>
            {user?.full_name?.split(' ')[0] || 'מתאמן'}
          </div>
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:'12px', padding:'12px 14px', borderRight:'3px solid rgba(255,255,255,0.5)' }}>
            <div style={{fontSize:'13px',color:'white',fontWeight:'600',lineHeight:1.5,fontStyle:'italic'}}>
              "{getDailyMessage()}"
            </div>
          </div>
        </div>

        {/* Casual onboarding banner — only shows when there's a
            session waiting for the trainee to approve. Tapping the
            CTA opens HealthDeclarationForm; on signature, the form
            flips the session to 'confirmed' and triggers
            WelcomeBlessingPopup. */}
        {pendingApprovalSession && (
          <div style={{
            margin: '12px 14px 0',
            background: '#FFFFFF',
            border: '2px solid #FF6F20',
            borderRadius: 16,
            padding: 16,
            boxShadow: '0 2px 8px rgba(255,111,32,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={20} style={{ color: '#FF6F20' }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>
                המאמן קבע לך מפגש
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6, marginBottom: 12 }}>
              {pendingApprovalSession.date && (
                <>
                  תאריך: <strong>{pendingApprovalSession.date}</strong>
                  {pendingApprovalSession.time && <> בשעה <strong>{pendingApprovalSession.time}</strong></>}
                  <br />
                </>
              )}
              לפני אישור המפגש, יש לחתום על הצהרת בריאות קצרה.
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingSessionId(pendingApprovalSession.id);
                setShowHealthForm(true);
              }}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
                background: '#FF6F20', color: '#FFFFFF',
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >
              אשר מפגש וחתום על הצהרת בריאות
            </button>
          </div>
        )}

        {/* Daily Challenge card */}
        {todayChallenge && (
          <div style={{
            background: (todayChallenge.is_read || pendingComplete)
              ? 'linear-gradient(135deg, #16a34a, #22c55e)'
              : 'linear-gradient(135deg, #FF6F20, #FF8F50)',
            borderRadius: 20,
            padding: 20,
            margin: '12px 14px 0',
            textAlign: 'center',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 13, fontWeight: 700,
            }}>🔥 {challengeStreak}</div>

            {/* Track context — only when this challenge came from a skill track */}
            {(() => {
              const p = todayChallenge.parsed || {};
              if (!p.track_id) return null;
              const trk = (myTracks || []).find(t => t.id === p.track_id);
              return (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginBottom: 8, padding: '4px 10px',
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 8,
                }}>
                  <span style={{ fontSize: 14 }}>{p.track_icon || trk?.icon || '🛤️'}</span>
                  <span style={{ fontSize: 11, opacity: 0.9 }}>
                    מתוך: {p.track_name || trk?.name || 'מסלול'}
                  </span>
                </div>
              );
            })()}

            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>
              {todayChallenge.is_read ? '✅ הושלם!' : (todayChallenge.parsed?.challenge_type === 'workout' ? '💪 אתגר אימון שלך' : '🎯 האתגר היומי שלך')}
            </div>
            {todayChallenge.parsed?.challenge_type === 'workout' && Array.isArray(todayChallenge.parsed.exercises) ? (
              <div style={{ textAlign: 'right', direction: 'rtl', marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
                  {todayChallenge.parsed.challenge_text}
                </div>
                {todayChallenge.parsed.exercises.map((ex, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 0',
                    borderBottom: '0.5px solid rgba(255,255,255,0.2)',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{i + 1}</div>
                    <span style={{ flex: 1, fontSize: 14 }}>{ex.name}</span>
                    {ex.detail && (
                      <span style={{ fontSize: 12, opacity: 0.85 }}>{ex.detail}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
                {todayChallenge.parsed?.challenge_text || todayChallenge.message}
              </div>
            )}
            {/* Track progress bar inside the challenge card */}
            {(() => {
              const p = todayChallenge.parsed || {};
              if (!p.track_id) return null;
              const trk = (myTracks || []).find(t => t.id === p.track_id);
              const goalVal = Number(trk?.goal_value) || 0;
              if (!trk || goalVal <= 0) return null;
              const curVal = Number(trk.current_value) || 0;
              const startVal = Number(trk.start_value) || 0;
              const pct = Math.min(100, Math.round(curVal / goalVal * 100));
              const ms = (trackMilestones && trackMilestones[trk.id]) || [];
              const trkColor = trk.color || '#FF6F20';
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 10, opacity: 0.85, marginBottom: 4,
                  }}>
                    <span>{startVal} {trk.goal_unit || ''}</span>
                    <span style={{ fontWeight: 700 }}>{curVal} {trk.goal_unit || ''}</span>
                    <span>⭐ {goalVal} {trk.goal_unit || ''}</span>
                  </div>
                  <div style={{
                    position: 'relative',
                    background: 'rgba(255,255,255,0.25)',
                    borderRadius: 6, height: 10,
                  }}>
                    <div style={{
                      background: 'white',
                      height: '100%', width: `${pct}%`,
                      borderRadius: 6,
                      transition: 'width 0.5s ease',
                    }} />
                    {ms.map(m => {
                      const mPct = Math.min(100, (m.value / goalVal) * 100);
                      return (
                        <div key={m.id} style={{
                          position: 'absolute',
                          left: `${mPct}%`, top: -3,
                          transform: 'translateX(-50%)',
                          width: m.reached_at ? 14 : 10,
                          height: m.reached_at ? 14 : 10,
                          borderRadius: '50%',
                          background: m.reached_at ? '#16a34a' : 'white',
                          border: m.reached_at ? '2px solid white' : `2px solid ${trkColor}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          zIndex: 2,
                        }} />
                      );
                    })}
                    <div style={{ position: 'absolute', left: -6, top: -5, fontSize: 16, zIndex: 2 }}>⭐</div>
                  </div>
                </div>
              );
            })()}

            {challengeStreak > 0 && (
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>
                {'🔥'.repeat(Math.min(challengeStreak, 10))} {challengeStreak} ימים ברצף!
              </div>
            )}
            {pendingComplete ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>כל הכבוד!</div>
                <button onClick={undoComplete} style={{
                  padding: '10px 24px',
                  borderRadius: 12,
                  border: '2px solid white',
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>↩️ ביטול (לחצתי בטעות)</button>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                  נשמר אוטומטית בעוד 5 שניות...
                </div>
              </div>
            ) : !todayChallenge.is_read ? (
              <button onClick={completeChallenge} style={{
                padding: '12px 32px',
                borderRadius: 14,
                border: '2px solid white',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                fontSize: 17, fontWeight: 700,
                cursor: 'pointer',
              }}>✅ ביצעתי!</button>
            ) : (
              <>
                <div style={{ fontSize: 32 }}>🏆</div>
                {showRevertLink && (
                  <button onClick={revertComplete} style={{
                    background: 'none', border: 'none',
                    color: 'rgba(255,255,255,0.75)',
                    fontSize: 12, cursor: 'pointer',
                    marginTop: 8, textDecoration: 'underline',
                  }}>↩️ לחצתי בטעות? בטל</button>
                )}
              </>
            )}
          </div>
        )}
        {!todayChallenge && challengeStreak > 0 && (
          <div style={{
            background: 'white', borderRadius: 16,
            padding: 16, margin: '12px 14px 0',
            textAlign: 'center',
            border: '0.5px solid #F0E4D0',
          }}>
            <div style={{ fontSize: 20 }}>🔥</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>רצף של {challengeStreak} ימים!</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>ממתין לאתגר מהמאמן</div>
          </div>
        )}

        {/* My Tracks — coach-assigned skill tracks with progress + milestones.
            Hidden when the coach has turned off "מעקב התקדמות". */}
        {perms.view_progress && myTracks.length > 0 && (
          <div style={{
            background: 'white', borderRadius: 16,
            padding: 14, margin: '12px 14px 0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            direction: 'rtl',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🛤️ המסלולים שלי</div>
            {myTracks.map(track => {
              const milestones = (trackMilestones && trackMilestones[track.id]) || [];
              const goalVal = Number(track.goal_value) || 0;
              const curVal = Number(track.current_value) || 0;
              const startVal = Number(track.start_value) || 0;
              const pct = goalVal > 0 ? Math.min(100, Math.round(curVal / goalVal * 100)) : 0;
              const trkColor = track.color || '#FF6F20';
              const isOpen = expandedTrack === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => setExpandedTrack(isOpen ? null : track.id)}
                  style={{
                    background: '#FFF9F0', borderRadius: 14,
                    padding: 12, marginBottom: 8,
                    borderRight: `4px solid ${trkColor}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{track.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{track.name}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>יעד: {track.goal || '—'}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: trkColor }}>{pct}%</div>
                  </div>

                  <div style={{ position: 'relative', marginBottom: 4, padding: '6px 8px 6px 14px' }}>
                    <div style={{
                      background: '#F0E4D0', borderRadius: 6,
                      height: 10, overflow: 'hidden',
                    }}>
                      <div style={{
                        background: trkColor,
                        height: '100%', width: `${pct}%`,
                        borderRadius: 6,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    {milestones.map(m => {
                      const mPct = goalVal > 0 ? Math.min(100, (m.value / goalVal) * 100) : 0;
                      return (
                        <div key={m.id} style={{
                          position: 'absolute',
                          left: `${mPct}%`, top: 4,
                          transform: 'translateX(-50%)',
                          width: m.reached_at ? 14 : 10,
                          height: m.reached_at ? 14 : 10,
                          borderRadius: '50%',
                          background: m.reached_at ? '#16a34a' : 'white',
                          border: m.reached_at ? '2px solid white' : `2px solid ${trkColor}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          zIndex: 2,
                        }} title={m.label || ''} />
                      );
                    })}
                    <div style={{ position: 'absolute', left: 0, top: 1, fontSize: 16, zIndex: 2 }}>⭐</div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888', marginTop: 2 }}>
                    <span>{startVal} {track.goal_unit || ''}</span>
                    <span style={{ color: trkColor, fontWeight: 600 }}>{curVal} {track.goal_unit || ''}</span>
                    <span>⭐ {goalVal || '?'} {track.goal_unit || ''}</span>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F0E4D0' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📍 נקודות ציון</div>
                      {milestones.length === 0 && (
                        <div style={{ fontSize: 11, color: '#888' }}>אין נקודות ציון עדיין</div>
                      )}
                      {milestones.map((m, i) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                            <div style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: m.reached_at ? '#16a34a' : '#E8E0D8',
                            }} />
                            {i < milestones.length - 1 && (
                              <div style={{
                                width: 2, height: 16,
                                background: m.reached_at ? '#16a34a' : '#E8E0D8',
                              }} />
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>
                              {m.value} {track.goal_unit || ''}{m.label ? ` — ${m.label}` : ''}
                            </div>
                            {m.reached_at && (
                              <div style={{ fontSize: 10, color: '#16a34a' }}>
                                ✓ {new Date(m.reached_at).toLocaleDateString('he-IL')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <div style={{ width: 16, textAlign: 'center' }}>⭐</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: trkColor }}>
                          {goalVal || '?'} {track.goal_unit || ''} — {track.goal || 'יעד'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Book Session Button */}
        <div style={{padding:'14px 14px 6px'}}>
          <button onClick={() => setShowBookingDialog(true)}
            style={{ width:'100%', height:'52px', background:'#FF6F20', color:'white', border:'none', borderRadius:'14px', fontSize:'17px', fontWeight:'900', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', boxShadow:'0 4px 12px rgba(255,111,32,0.3)' }}>
            <span>📅</span> קבע אימון חדש
          </button>
        </div>

        {/* 3-Column Quick Access Grid — gated by coach-set permissions.
            Hidden tabs collapse the grid (no empty cells). */}
        <div style={{ padding:'8px 14px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
          {[
            // MyWorkoutLog redirects to MyPlan; MyPlan and TraineeSessions
            // are both gated by `view_training_plan` via <PermGate>. We
            // mirror those perms here so the tile hides when the
            // destination would block.
            { icon:'📅', label:'מפגשים',   to: createPageUrl("TraineeSessions"),                    perm: 'view_training_plan' },
            { icon:'📋', label:'תוכנית',   to: createPageUrl("MyWorkoutLog"),                       perm: 'view_training_plan' },
            { icon:'📈', label:'התקדמות', to: createPageUrl("Progress"),                          perm: 'view_progress' },
            { icon:'🎯', label:'יעדים',    to: createPageUrl("TraineeProfile") + "?tab=goals" },
            { icon:'⏱', label:'שעונים',   to: createPageUrl("Clocks") },
            { icon:'👤', label:'פרופיל',   to: createPageUrl("TraineeProfile") },
          ].filter(tab => !tab.perm || perms[tab.perm]).map((tab, i) => (
            <Link key={i} to={tab.to} className="no-underline">
              <div style={{ background:'white', border:'1px solid #eee', borderRadius:'14px', padding:'14px 8px', display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#FFF0E8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px' }}>{tab.icon}</div>
                <span style={{fontSize:'12px',fontWeight:'700',color:'#1a1a1a'}}>{tab.label}</span>
              </div>
            </Link>
          ))}
        </div>

        <div style={{padding:'0 14px'}}>

        {/* Streak / Progress Card */}
        {completedCount > 0 && (
          <div style={{ background:'linear-gradient(135deg, #FF6F20, #FF9A56)', borderRadius:'16px', padding:'16px 18px', marginBottom:'12px', color:'white', boxShadow:'0 4px 14px rgba(255,111,32,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
              <Flame className="w-5 h-5" />
              <span style={{ fontSize:'15px', fontWeight:'800' }}>ההתקדמות שלך</span>
            </div>
            <div style={{ display:'flex', gap:'12px' }}>
              <div style={{ flex:1, background:'rgba(255,255,255,0.2)', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'28px', fontWeight:'900', lineHeight:1 }}>{completedCount}</div>
                <div style={{ fontSize:'11px', fontWeight:'600', marginTop:'4px', opacity:0.9 }}>אימונים הושלמו</div>
              </div>
              <div style={{ flex:1, background:'rgba(255,255,255,0.2)', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'28px', fontWeight:'900', lineHeight:1 }}>{weeksActive}</div>
                <div style={{ fontSize:'11px', fontWeight:'600', marginTop:'4px', opacity:0.9 }}>שבועות פעילים</div>
              </div>
            </div>
          </div>
        )}

        {/* Package Balance Reminder */}
        {packageReminder && (
          <div style={{ background: packageReminder.remaining <= 1 ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${packageReminder.remaining <= 1 ? '#FECACA' : '#FDE68A'}`, borderRadius:'14px', padding:'14px 16px', marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <Package className="w-5 h-5" style={{ color: packageReminder.remaining <= 1 ? '#EF4444' : '#F59E0B' }} />
              <div>
                <div style={{ fontSize:'13px', fontWeight:'800', color:'#333' }}>
                  {packageReminder.remaining <= 0 ? 'החבילה נגמרה!' : `נותרו ${packageReminder.remaining} אימונים`}
                </div>
                <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>{packageReminder.service_name || 'חבילה פעילה'}</div>
              </div>
            </div>
            <button onClick={() => setShowBookingDialog(true)}
              style={{ background:'#FF6F20', color:'white', border:'none', borderRadius:'10px', padding:'8px 14px', fontSize:'12px', fontWeight:'800', cursor:'pointer', whiteSpace:'nowrap' }}>
              קבע עכשיו
            </button>
          </div>
        )}

        {/* Upcoming Sessions — only shown when there are future approved/pending sessions */}
        {(() => {
          const upcoming = mySessions
            .filter(s => new Date(`${s.date}T${s.time}`) >= new Date() && !['בוטל על ידי מתאמן', 'בוטל על ידי מאמן', 'התקיים', 'לא הגיע'].includes(s.status))
            .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
          if (upcoming.length === 0) return null;
          return (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3 text-gray-800 border-r-4 border-[#FF6F20] pr-3">מפגש קרוב</h2>
              <div className="space-y-3">
                {upcoming.map(session => (
                  <div key={session.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(session.status)}
                          <span className="text-sm text-gray-500">{session.session_type}</span>
                        </div>
                        <div className="font-bold text-lg">
                          {new Date(session.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} | {session.time}
                        </div>
                        <div className="text-sm text-gray-500">{session.location}</div>
                      </div>
                    </div>
                    {(() => {
                      const sessionStart = new Date(`${session.date}T${session.time}`);
                      const hoursAway = (sessionStart - new Date()) / (1000 * 60 * 60);
                      if (hoursAway >= 24) {
                        return (
                          <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
                            <button onClick={() => handleCancelSession(session)}
                              className="flex-1 text-xs font-bold text-red-500 bg-red-50 rounded-lg py-2 hover:bg-red-100 transition-colors">
                              ביטול מפגש
                            </button>
                          </div>
                        );
                      } else if (hoursAway > 0) {
                        return (
                          <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
                            <button onClick={() => handleRescheduleRequest(session)}
                              className="flex-1 text-xs font-bold text-[#FF6F20] bg-orange-50 rounded-lg py-2 hover:bg-orange-100 transition-colors flex items-center justify-center gap-1">
                              <ClockIcon className="w-3 h-3" />בקש שינוי תאריך
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        </div>

        {showBookingDialog && (
          <BookingModal
            user={user}
            coach={coach}
            onClose={() => setShowBookingDialog(false)}
          />
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}