import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Calendar, Dumbbell, TrendingUp, User, Loader2, Bell, ShieldCheck, Package, ClipboardList } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TraineeSessionBooking from "../components/TraineeSessionBooking";
import TraineeNotificationCard from "../components/TraineeNotificationCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

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

  const handleCancelSession = async (session) => {
    const sessionStart = new Date(`${session.date}T${session.time}`);
    const now = new Date();
    const diffHours = (sessionStart - now) / (1000 * 60 * 60);

    if (diffHours < 24) {
      alert("ביטול אפשרי רק עד 24 שעות לפני המפגש. לביטול מאוחר יותר פנה למאמן.");
      return;
    }

    if (confirm("האם לבטל את המפגש?")) {
      try {
        // Check if 24h before
        const sessionDate = new Date(session.date + 'T' + session.time);
        if ((sessionDate - new Date()) < 24 * 60 * 60 * 1000) {
             alert("לא ניתן לבטל מפגש פחות מ-24 שעות לפני המועד. אנא צור קשר עם המאמן.");
             return;
        }

        await base44.entities.Session.update(session.id, {
          status: "בוטל על ידי מתאמן",
          status_updated_at: new Date().toISOString(),
          status_updated_by: user.id
        });
        
        // Update local state
        setMySessions(prev => prev.map(s => s.id === session.id ? { ...s, status: "בוטל על ידי מתאמן" } : s));
        
        // Note: No credit restoration needed as we only deduct on 'Attended' status now.
        
      } catch (err) {
        console.error("Error cancelling session", err);
      }
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

      <div className="min-h-screen px-4 md:p-8 pb-24 bg-white" dir="rtl" style={{ fontSize: 16 }}>
        <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-gray-900 mb-2">
            היי, {user?.full_name?.split(' ')[0] || 'מתאמן'} 👋
          </h1>
          <p className="text-xl text-gray-500">מוכן לאימון הבא שלך?</p>
        </div>

        {/* Upcoming Sessions Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-800 border-r-4 border-[#FF6F20] pr-3">המפגשים שלי</h2>
          {mySessions.filter(s => new Date(`${s.date}T${s.time}`) >= new Date()).length === 0 ? (
            <div className="bg-gray-50 p-6 rounded-xl text-center border border-gray-100">
              <p className="text-gray-500 mb-2">אין מפגשים עתידיים</p>
              <Button onClick={() => setShowBookingDialog(true)} variant="link" className="text-[#FF6F20]">
                קבע מפגש חדש
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {mySessions
                .filter(s => new Date(`${s.date}T${s.time}`) >= new Date())
                .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
                .map(session => (
                <div key={session.id} className="bg-white border border-gray-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
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
                  
                  {/* Cancel button removed — only coach can cancel sessions */}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Package remaining sessions */}
        {activeServices.length > 0 && (
          <div className="mb-6 space-y-2">
            {activeServices.map(svc => {
              const total = svc.total_sessions || 0;
              const used = svc.used_sessions || 0;
              const remaining = total > 0 ? total - used : null;
              const isLow = remaining !== null && remaining <= 2;
              const isEmpty = remaining !== null && remaining <= 0;
              if (remaining === null) return null;
              return (
                <div
                  key={svc.id}
                  className="flex items-center justify-between p-4 rounded-xl border-2"
                  style={{
                    borderColor: isEmpty ? '#f44336' : isLow ? '#FF6F20' : '#E0E0E0',
                    backgroundColor: isEmpty ? '#FFEBEE' : isLow ? '#FFF8F3' : '#FAFAFA',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5" style={{ color: isEmpty ? '#f44336' : '#FF6F20' }} />
                    <div>
                      <p className="font-bold text-sm">{svc.service_type || svc.package_name}</p>
                      <p className="text-xs text-gray-500">{used}/{total} אימונים נוצלו</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black ${isEmpty ? 'text-red-600' : isLow ? 'text-[#FF6F20]' : 'text-gray-900'}`}>
                      {remaining}
                    </p>
                    <p className="text-xs text-gray-400">נותרו</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Access Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { label: 'מפגשים', icon: Calendar, to: createPageUrl("TraineeProfile") + "?tab=attendance", color: '#7C3AED' },
            { label: 'התוכנית שלי', icon: ClipboardList, to: createPageUrl("MyWorkoutLog"), color: '#F97316' },
            { label: 'התקדמות', icon: TrendingUp, to: createPageUrl("Progress"), color: '#10B981' },
            { label: 'פרופיל', icon: User, to: createPageUrl("TraineeProfile"), color: '#3B82F6' },
          ].map(item => (
            <Link key={item.label} to={item.to} className="no-underline">
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all active:scale-[0.97]">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: item.color + '15' }}>
                  <item.icon className="w-6 h-6" style={{ color: item.color }} />
                </div>
                <span className="text-sm font-bold text-gray-800">{item.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Book Session Button */}
        <div className="mb-6">
          <button onClick={() => setShowBookingDialog(true)}
            className="w-full p-4 rounded-xl bg-[#FF6F20] text-white hover:bg-orange-600 transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98]">
            <Calendar className="w-5 h-5" />
            <span className="font-bold text-base">קבע אימון חדש</span>
          </button>
        </div>

        <TraineeSessionBooking 
          open={showBookingDialog} 
          onClose={() => setShowBookingDialog(false)} 
          user={user} 
          coach={coach} 
        />
      </div>
    </div>
    </ErrorBoundary>
  );
}