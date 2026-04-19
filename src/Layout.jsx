import React, { useEffect, useState, useContext, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import AdminCoachActivator from "@/components/AdminCoachActivator";
import NotificationBadge from "@/components/NotificationBadge";
import PWANotifications from "@/components/PWANotifications";
import DataLoader from "@/components/DataLoader";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  User,
  Home,
  TrendingUp,
  Menu,
  X,
  LogOut,
  DollarSign,
  FileText,
  Dumbbell,
  Shield,
  ChevronRight,
  UserPlus,
  BarChart3,
  Bell,
  Zap,
  Clock
  } from "lucide-react";
import { Button } from "@/components/ui/button";
import FloatingTimer from "@/components/FloatingTimer";
import { useClock } from "@/contexts/ClockContext";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";

const LOGO_MAIN = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/f4582ad21_Untitleddesign1.png";
const LOGO_ICON = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/64e812e61_Untitleddesign3.jpg";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useContext(AuthContext);
  const queryClient = useQueryClient();
  const loading = isLoadingAuth;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';
  const clock = useClock();
  const { liveTimer, setLiveTimer } = useActiveTimer();
  const isClocks = location.pathname.toLowerCase().includes('clock');

  // Sync floating widget for timer/stopwatch every tick (Layout never unmounts)
  useEffect(() => {
    if (!liveTimer) return;
    if (liveTimer.type === 'timer' && clock?.activeClock === 'timer') {
      const ms = clock.display;
      if (ms == null) return;
      const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
      const d = `${m}:${String(s).padStart(2, '0')}`;
      setLiveTimer(prev => prev?.type === 'timer' ? { ...prev, display: d, paused: !clock.isRunning } : prev);
    } else if (liveTimer.type === 'stopwatch' && clock?.activeClock === 'stopwatch') {
      const ms = clock.display;
      if (ms == null) return;
      const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
      const cs = Math.floor((ms % 1000) / 10);
      const d = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
      setLiveTimer(prev => prev?.type === 'stopwatch' ? { ...prev, display: d, paused: !clock.isRunning } : prev);
    }
  }, [clock?.display, liveTimer?.type]);

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // ── Live toast notifications via Supabase Realtime ──────────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase.channel('notifications-live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const n = payload.new;
        if (!n || n.is_read) return;

        // Map notification type to emoji
        const typeIcons = {
          session_scheduled: '📅', session_approved: '✅', session_rejected: '❌',
          session_request: '📅', session_confirmed: '✅', session_completed: '✅',
          session_cancelled_by_trainee: '🚫', reschedule_request: '🔄',
          plan_created: '💪', plan_updated: '📋', new_record: '🏆',
          new_baseline: '📊', renewal_request: '🔄', renewal_alert: '⚠️',
          new_message: '💬', exercise_completed: '🎯', metrics_updated: '📏',
          low_balance: '⚠️', service_completed: '📦',
        };
        const icon = typeIcons[n.type] || '🔔';

        // Show toast with action button if applicable
        if (n.type === 'session_request' && n.data?.session_id) {
          toast(
            `${icon} ${n.title}`,
            {
              description: n.message,
              duration: 10000,
              action: {
                label: 'אשר',
                onClick: async () => {
                  try {
                    await supabase.from('sessions').update({ status: 'מאושר' }).eq('id', n.data.session_id);
                    if (n.data.trainee_id) {
                      await supabase.from('notifications').insert({
                        user_id: n.data.trainee_id, type: 'session_approved', title: 'המפגש אושר',
                        message: n.message?.replace('ביקש', 'אושר') || 'המפגש שלך אושר', is_read: false,
                      });
                    }
                    queryClient.refetchQueries({ queryKey: ['all-sessions'] });
                    toast.success('המפגש אושר');
                  } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
                },
              },
            }
          );
        } else if (n.action_label && n.data?.session_id) {
          toast(`${icon} ${n.title}`, { description: n.message, duration: 8000, action: { label: n.action_label, onClick: () => navigate(createPageUrl("Sessions")) } });
        } else {
          toast(`${icon} ${n.title}`, {
            description: n.message,
            duration: 5000,
          });
        }

        // Refresh notification badge count
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient, navigate]);

  const coachNavItems = [
    // ── ניהול יומיומי ──
    { title: "דשבורד", url: createPageUrl("Dashboard"), icon: LayoutDashboard, section: "daily" },
    { title: "מתאמנים", url: createPageUrl("AllUsers"), icon: Users, section: "daily" },
    { title: "תוכניות פעילות", url: createPageUrl("ActivePlans"), icon: Dumbbell, section: "daily" },
    { title: "מפגשים", url: createPageUrl("Sessions"), icon: Calendar, section: "daily" },
    { title: "לידים", url: createPageUrl("Leads"), icon: UserPlus, section: "daily" },
    { title: "התראות", url: createPageUrl("Notifications"), icon: Bell, section: "daily", showBadge: true },
    // ── ניהול תוכן ──
    { title: "כל התוכניות", url: createPageUrl("TrainingPlans"), icon: ClipboardList, section: "content" },
    { title: "תבניות סקשנים", url: createPageUrl("SectionTemplates"), icon: FileText, section: "content" },
    { title: "דוחות", url: createPageUrl("Reports"), icon: BarChart3, section: "content" },
    // ── ניהול עסקי ──
    { title: "סיכום כספי", url: createPageUrl("FinancialOverview"), icon: DollarSign, section: "business" },
    { title: "חבילות", url: createPageUrl("PackageStats"), icon: ClipboardList, section: "business" },
    { title: "המרות", url: createPageUrl("ConversionDashboard"), icon: TrendingUp, section: "business" },
    // ── כלים ──
    { title: "שעונים", url: createPageUrl("Clocks"), icon: Clock, section: "content" },
    // ── הגדרות ──
    { title: "פרופיל מאמן", url: createPageUrl("CoachProfile"), icon: User, section: "settings" },
  ];

  const traineeNavItems = [
    {
      title: "דף הבית",
      url: createPageUrl("TraineeHome"),
      icon: Home,
      section: "trainee"
    },
    {
      title: "התראות",
      url: createPageUrl("Notifications"),
      icon: Bell,
      section: "trainee",
      showBadge: true
    },
    {
      title: "התוכנית שלי",
      url: createPageUrl("MyWorkoutLog"),
      icon: ClipboardList,
      section: "trainee"
    },
    {
      title: "התקדמות",
      url: createPageUrl("Progress"),
      icon: TrendingUp,
      section: "trainee"
    },

    {
      title: "שעונים",
      url: createPageUrl("Clocks"),
      icon: Clock,
      section: "trainee"
    },
    {
      title: "פרופיל מתאמן",
      url: createPageUrl("TraineeProfile"),
      icon: User,
      section: "trainee"
    },
  ];

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => setShowLogoutConfirm(true);



  const confirmLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("[Layout] Logout error:", error);
    }
    // Clear all caches
    localStorage.clear();
    sessionStorage.clear();
    // Redirect to landing page
    window.location.href = "https://www.athletigo-coach.com";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="text-center">
          <img
            src={LOGO_MAIN}
            alt="AthletiGo"
            className="splash-logo mx-auto mb-4"
            style={{ width: '200px', height: 'auto' }}
          />
          <div className="athletigo-spinner mx-auto"></div>
        </div>
      </div>
    );
  }

  // Onboarding only for trainees, never for coaches
  if (user && !user.onboarding_completed && !isCoach && currentPageName !== "Onboarding") {
    window.location.href = createPageUrl("Onboarding");
    return null;
  }

  const navigationItems = isCoach ? coachNavItems : traineeNavItems;
  const userRoleLabel = isCoach ? '👨‍💼 מאמן' : (user?.full_name ? `👤 ${user.full_name.split(' ')[0]}` : '👤 מתאמן');
  const primaryColor = '#FF6F20';
  const primaryColorLight = '#FFF8F3';

  // ═══════════════════════════════════════════════════════════════════
  // הבר העליון אינו מכיל כפתור חזרה לעמוד הקודם.
  // זו החלטה מכוונת — הניווט באפליקציה מבוסס על התפריט התחתון,
  // התפריט ההמבורגר, וניווט הדפדפן הטבעי.
  // אל תוסיף כפתור חזרה לבר העליון או כאלמנט צף בשום מסך.
  // ═══════════════════════════════════════════════════════════════════

  return (
    <ErrorBoundary>
      <AdminCoachActivator user={user} />
      <PWANotifications userId={user?.id} />
      <DataLoader user={user} />

      <div dir="rtl" className="h-screen flex" style={{
        backgroundColor: '#FFFFFF',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        maxWidth: '100vw',
        width: '100%',
        touchAction: 'pan-x pan-y',
        overflowX: 'hidden',
      }}>
        <aside className="hidden md:flex flex-col w-64 p-6" style={{
          backgroundColor: '#FFFFFF',
          borderLeft: `1px solid #E0E0E0`
        }}>
          <div className="mb-8 p-4 rounded-2xl" style={{
            backgroundColor: primaryColorLight,
            border: `2px solid ${primaryColor}`
          }}>
            <div className="flex items-center gap-3 justify-center">
              <img
                src={LOGO_ICON}
                alt="AthletiGo"
                style={{ width: '40px', height: '40px', objectFit: 'contain' }}
              />
              <div>
                <h2 className="font-bold text-xl" style={{ color: '#000000' }}>ATHLETIGO</h2>
                <p className="text-xs font-bold" style={{ color: primaryColor }}>
                  {userRoleLabel}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            {(() => {
              const sectionLabels = { daily: "ניהול יומיומי", content: "תוכן ואימון", business: "עסקי", settings: "הגדרות", coach: null, trainee: null };
              let lastSection = null;
              return navigationItems.map((item) => {
                const isActive = location.pathname === item.url;
                const showHeader = item.section !== lastSection && sectionLabels[item.section];
                lastSection = item.section;
                return (
                  <div key={item.title}>
                    {showHeader && (
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#999' }}>{sectionLabels[item.section]}</span>
                      </div>
                    )}
                    <Link
                      to={item.url}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 relative"
                      style={{
                        backgroundColor: isActive ? primaryColorLight : 'transparent',
                        color: isActive ? primaryColor : '#000000',
                        border: isActive ? `2px solid ${primaryColor}` : '1px solid transparent'
                      }}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium text-sm">{item.title}</span>
                      {item.showBadge && user && <NotificationBadge userId={user.id} inline={true} />}
                    </Link>
                  </div>
                );
              });
            })()}
          </nav>

          {user && (
            <div className="mt-6 p-4 rounded-2xl" style={{
              backgroundColor: '#FFFFFF',
              border: `1px solid #E0E0E0`
            }}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {user.full_name?.[0] || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: '#000000' }}>
                    {user.full_name || 'משתמש'}
                  </p>
                  <p className="text-xs truncate" style={{ color: '#7D7D7D' }}>
                    {userRoleLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all"
                style={{ backgroundColor: primaryColor, color: 'white' }}
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">התנתק</span>
              </button>
            </div>
          )}

          <div className="mt-4 text-center">
            <p className="text-xs" style={{ color: '#7D7D7D' }}>
              Powered by AthletiGo © 2025
            </p>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="md:hidden p-4 safe-area-top" style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
            display: isClocks ? 'none' : undefined,
            backgroundColor: '#FFFFFF',
            borderBottom: `1px solid #E0E0E0`,
            boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
          }}>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl"
                style={{ backgroundColor: '#FFFFFF', border: `1px solid #E0E0E0` }}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <div className="flex items-center gap-2">
                <img
                  src={LOGO_ICON}
                  alt="AthletiGo"
                  style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                />
                <div>
                  <h1 className="font-bold text-lg" style={{ color: '#000000' }}>ATHLETIGO</h1>
                  <p className="text-xs font-bold" style={{ color: primaryColor }}>
                    {userRoleLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {user && (
                  <NotificationBadge userId={user.id} onClick={() => navigate(createPageUrl("Notifications"))} />
                )}
                {!user && <div className="w-10" />}
              </div>
            </div>
          </header>

          {mobileMenuOpen && (
            <div className="md:hidden p-4 space-y-2 max-h-[60vh] overflow-y-auto safe-area-inset flex-shrink-0 z-[99]" style={{
              backgroundColor: '#FFFFFF',
              borderBottom: `1px solid #E0E0E0`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {(() => {
                const sectionLabels = { daily: "ניהול יומיומי", content: "תוכן ואימון", business: "עסקי", settings: "הגדרות", coach: null, trainee: null };
                let lastSection = null;
                return navigationItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  const showHeader = item.section !== lastSection && sectionLabels[item.section];
                  lastSection = item.section;
                  return (
                    <div key={item.title}>
                      {showHeader && <div className="px-2 pt-2 pb-0.5"><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{sectionLabels[item.section]}</span></div>}
                      <Link to={item.url} onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative"
                        style={{ backgroundColor: isActive ? primaryColorLight : '#FFFFFF', color: isActive ? primaryColor : '#000000', border: isActive ? `2px solid ${primaryColor}` : `1px solid #E0E0E0` }}>
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.title}</span>
                        {item.showBadge && user && <NotificationBadge userId={user.id} inline={true} />}
                      </Link>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          <div className="flex-1 page-container" style={{
            paddingLeft: isClocks ? 0 : '16px',
            paddingRight: isClocks ? 0 : '16px',
            paddingTop: isClocks ? 0 : '64px',
            paddingBottom: isClocks ? 0 : '80px',
            overflowY: isClocks ? 'hidden' : 'auto',
            height: isClocks ? '100dvh' : undefined,
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
            overflowX: 'hidden',
          }}>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>

          {/* Floating Timer Widget */}
          <FloatingTimer />

          {/* Mobile Bottom Navigation — fixed to bottom */}
          <div className="md:hidden safe-area-bottom"
               style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, backgroundColor: '#FFFFFF', borderTop: '1px solid #E0E0E0', boxShadow: '0 -2px 10px rgba(0,0,0,0.08)', display: isClocks ? 'none' : undefined }}>
            <div className="grid grid-cols-5 gap-1 p-2">
              {isCoach ? (
                <>
                  <Link
                    to={createPageUrl("Dashboard")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("Dashboard") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("Dashboard") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <Home className="w-6 h-6" />
                    <span className="text-xs font-bold">בית</span>
                  </Link>

                  <Link
                    to={createPageUrl("AllUsers")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("AllUsers") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("AllUsers") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <Users className="w-6 h-6" />
                    <span className="text-xs font-bold">מתאמנים</span>
                  </Link>

                  <Link
                    to={createPageUrl("ActivePlans")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("ActivePlans") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("ActivePlans") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <ClipboardList className="w-6 h-6" />
                    <span className="text-xs font-bold">תוכניות</span>
                  </Link>

                  <Link
                    to={createPageUrl("Sessions")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("Sessions") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("Sessions") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <Calendar className="w-6 h-6" />
                    <span className="text-xs font-bold">מפגשים</span>
                  </Link>

                  <Link
                    to={createPageUrl("CoachProfile")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("CoachProfile") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("CoachProfile") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <User className="w-6 h-6" />
                    <span className="text-xs font-bold">פרופיל</span>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to={createPageUrl("TraineeHome")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("TraineeHome") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("TraineeHome") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <Home className="w-6 h-6" />
                    <span className="text-xs font-bold">בית</span>
                  </Link>

                  <Link
                    to={createPageUrl("MyWorkoutLog")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("MyWorkoutLog") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("MyWorkoutLog") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <ClipboardList className="w-6 h-6" />
                    <span className="text-xs font-bold">תוכנית</span>
                  </Link>

                  <Link
                    to={createPageUrl("TraineeSessions")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("TraineeSessions") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("TraineeSessions") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <Calendar className="w-6 h-6" />
                    <span className="text-xs font-bold">מפגשים</span>
                  </Link>

                  <Link
                    to={createPageUrl("Progress")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("Progress") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("Progress") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <TrendingUp className="w-6 h-6" />
                    <span className="text-xs font-bold">התקדמות</span>
                  </Link>

                  <Link
                    to={createPageUrl("TraineeProfile")}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: location.pathname === createPageUrl("TraineeProfile") ? primaryColorLight : 'transparent',
                      color: location.pathname === createPageUrl("TraineeProfile") ? primaryColor : '#7D7D7D'
                    }}
                  >
                    <User className="w-6 h-6" />
                    <span className="text-xs font-bold">פרופיל</span>
                  </Link>
                </>
              )}
            </div>
          </div>
          </main>

          {/* Logout confirmation dialog */}
          <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
            <DialogContent className="max-w-xs p-5 text-center">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">התנתקות</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600 my-3">האם אתה בטוח שברצונך להתנתק?</p>
              <div className="flex gap-3">
                <Button onClick={() => setShowLogoutConfirm(false)} variant="outline" className="flex-1 rounded-xl">ביטול</Button>
                <Button onClick={confirmLogout} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">כן, התנתק</Button>
              </div>
            </DialogContent>
          </Dialog>

          </div>
          </ErrorBoundary>
          );
          }