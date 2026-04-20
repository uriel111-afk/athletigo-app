import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Calendar, Dumbbell, TrendingUp, User, Loader2, Bell, ShieldCheck, Package, ClipboardList, Clock as ClockIcon, Flame, Trophy, Star } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BookingModal from "../components/BookingModal";
import TraineeNotificationCard from "../components/TraineeNotificationCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

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
    return (
      <div className="h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#FDF8F3' }}>
        <h1 className="text-2xl font-black tracking-[0.2em] mb-6" style={{ color: '#FF6F20', fontFamily: 'Barlow, sans-serif' }}>ATHLETIGO</h1>
        <Loader2 className="w-8 h-8 animate-spin text-[#FF6F20] mb-3" />
        <p className="text-sm font-medium text-gray-400">טוען...</p>
      </div>
    );
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

  return (
    <ErrorBoundary>
      {/* Unread notifications modal */}
      <Dialog open={showUnreadModal} onOpenChange={setShowUnreadModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#FF6F20]" />
              {unreadNotifs.length} התראות חדשות
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
              <p className="text-center text-gray-400 py-4 text-sm">כל ההתראות טופלו</p>
            )}
          </div>
          <Button
            onClick={() => setShowUnreadModal(false)}
            variant="outline"
            className="w-full rounded-xl mt-2 min-h-[44px]"
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

        {/* Book Session Button */}
        <div style={{padding:'14px 14px 6px'}}>
          <button onClick={() => setShowBookingDialog(true)}
            style={{ width:'100%', height:'52px', background:'#FF6F20', color:'white', border:'none', borderRadius:'14px', fontSize:'17px', fontWeight:'900', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', boxShadow:'0 4px 12px rgba(255,111,32,0.3)' }}>
            <span>📅</span> קבע אימון חדש
          </button>
        </div>

        {/* 3-Column Quick Access Grid */}
        <div style={{ padding:'8px 14px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
          {[
            { icon:'📅', label:'מפגשים', to: createPageUrl("TraineeSessions") },
            { icon:'📋', label:'תוכנית', to: createPageUrl("MyWorkoutLog") },
            { icon:'📈', label:'התקדמות', to: createPageUrl("Progress") },
            { icon:'🎯', label:'יעדים', to: createPageUrl("TraineeProfile") + "?tab=goals" },
            { icon:'⏱', label:'שעונים', to: createPageUrl("Clocks") },
            { icon:'👤', label:'פרופיל', to: createPageUrl("TraineeProfile") },
          ].map((tab, i) => (
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