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
import PageLoader from "@/components/PageLoader";
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
  Clock,
  Flame,
  Route
  } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimerFooterBar from "@/components/TimerFooterBar";
import { useClock } from "@/contexts/ClockContext";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";

const LOGO_MAIN = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/f4582ad21_Untitleddesign1.png";
const LOGO_ICON = "/logo-transparent.png";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useContext(AuthContext);
  const queryClient = useQueryClient();
  const loading = isLoadingAuth;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';
  const clock = useClock();
  const { liveTimer, setLiveTimer, activeTimers, isMinimized } = useActiveTimer();
  // Bars only contribute height when actually visible (minimized state).
  const visibleBars = isMinimized ? (activeTimers?.length || 0) : 0;
  const timerBarsHeight = visibleBars * 74;
  const isClocks = location.pathname.toLowerCase().includes('clock');
  const isDashboard = location.pathname.toLowerCase().includes('dashboard');
  const isFullScreen = isClocks || location.pathname.toLowerCase().includes('trainingplanview') || location.pathname.toLowerCase().includes('planbuilder');

  // After a page refresh, ClockContext hydrates from localStorage — recreate
  // the floating bubble entry so it reappears without user action.
  useEffect(() => {
    if (liveTimer) return;
    if (!clock?.activeClock) return;
    if (clock.activeClock === 'stopwatch') {
      setLiveTimer({ type: 'stopwatch', phase: 'ריצה', display: '00:00.00', paused: !clock.isRunning });
    } else if (clock.activeClock === 'timer') {
      setLiveTimer({ type: 'timer', phase: clock.phaseLabel || 'טיימר', display: '0:00', paused: !clock.isRunning });
    } else if (clock.activeClock === 'tabata') {
      setLiveTimer({ type: 'tabata', phase: clock.phaseLabel || 'טבטה', display: '0:00', info: clock.roundInfo || '', paused: !clock.isRunning });
    }
  }, [clock?.activeClock, liveTimer, setLiveTimer, clock?.isRunning, clock?.phaseLabel, clock?.roundInfo]);

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

  // Scroll to top + close mobile menu on page change
  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileMenuOpen(false);
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
    { title: "תוכניות פעילות", url: createPageUrl("PlanBuilder"), icon: Dumbbell, section: "daily" },
    { title: "מפגשים", url: createPageUrl("Sessions"), icon: Calendar, section: "daily" },
    { title: "לידים", url: createPageUrl("Leads"), icon: UserPlus, section: "daily" },
    { title: "התראות", url: createPageUrl("Notifications"), icon: Bell, section: "daily", showBadge: true },
    // ── ניהול תוכן ──
    { title: "כל התוכניות", url: createPageUrl("PlanBuilder"), icon: ClipboardList, section: "content" },
    { title: "אתגרי אימון", url: createPageUrl("Challenges"), icon: Flame, section: "content" },
    { title: "מסלולים", url: createPageUrl("SkillTracks"), icon: Route, section: "content" },
    { title: "דוחות", url: createPageUrl("Reports"), icon: BarChart3, section: "content" },
    // ── ניהול עסקי ──
    // Packages (PackageStats), Financial summary, and Conversions
    // (ConversionDashboard) are all merged into the single Reports
    // page above. Old menu links removed.
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
    return <PageLoader size={120} fullHeight />;
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
        <aside className={`${isFullScreen ? 'hidden' : 'hidden md:flex'} flex-col w-64 p-6`} style={{
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

        <main className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <header className="md:hidden safe-area-top" style={{ padding: '8px 14px',
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
            display: isClocks ? 'none' : undefined,
            backgroundColor: '#FFFFFF',
            borderBottom: '0.5px solid #F0E4D0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
            direction: 'rtl',
          }}>
            <div className="flex items-center justify-between">
              {/* Right (RTL start): hamburger menu */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-xl"
                style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', border: '0.5px solid #F0E4D0' }}
                aria-label="תפריט"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Center: triangle + ATHLETIGO wordmark image as two
                  separate elements, laid out LTR so the triangle sits on
                  the visual LEFT and the text on the visual RIGHT.
                  Wrapped in a flex column with alignItems:center so the
                  brand row's geometric center stacks directly above the
                  user-role text underneath — no manual offsets. */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
                  <img
                    src="/logo-transparent.png"
                    alt=""
                    style={{ width: 28, height: 28, objectFit: 'contain', display: 'block' }}
                  />
                  <img
                    src="/athletigo-text.png"
                    alt="ATHLETIGO"
                    style={{ height: 18, objectFit: 'contain', display: 'block' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: primaryColor, fontWeight: 600, marginTop: 1, lineHeight: 1.2 }}>
                  {userRoleLabel}
                </div>
              </div>

              {/* Left (RTL end): notification bell */}
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
                {user ? (
                  <NotificationBadge userId={user.id} onClick={() => navigate(createPageUrl("Notifications"))} />
                ) : null}
              </div>
            </div>
          </header>

          {mobileMenuOpen && (
            <>
              {/* Backdrop — close menu on tap outside */}
              <div
                className="md:hidden"
                onClick={() => setMobileMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 98 }}
              />
              <div className="md:hidden p-4 space-y-2 overflow-y-auto" style={{
                position: 'fixed', top: '64px', right: 0, bottom: 0, width: '280px',
                zIndex: 99,
                backgroundColor: '#FFFFFF',
                borderLeft: '1px solid #E0E0E0',
                boxShadow: '-4px 0 12px rgba(0,0,0,0.1)',
                WebkitOverflowScrolling: 'touch',
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
            </>
          )}

          <div className="flex-1 page-container" style={{
            paddingLeft: (isClocks || isDashboard) ? 0 : '16px',
            paddingRight: (isClocks || isDashboard) ? 0 : '16px',
            paddingTop: isClocks ? 0 : 'var(--content-top)',
            paddingBottom: isClocks ? 0 : (70 + timerBarsHeight),
            overflowY: isClocks ? 'hidden' : 'auto',
            height: isClocks ? '100dvh' : undefined,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
            overflowX: 'hidden',
            // Match the Dashboard cream under the scrollable area so the
            // 70px bottom padding doesn't reveal body-white under the
            // page's cream background.
            backgroundColor: isDashboard ? '#FDF8F3' : undefined,
          }}>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>

          {/* Sticky timer footer bar — replaces the old draggable bubble */}
          <TimerFooterBar />

          {/* Mobile Bottom Navigation — fixed to bottom (pushed up by 72px per active timer bar) */}
          <div className="md:hidden"
               style={{ position: 'fixed', bottom: timerBarsHeight, left: 0, right: 0, zIndex: 1050, backgroundColor: '#FFFFFF', borderTop: '0.5px solid #F0E4D0', boxShadow: '0 -2px 10px rgba(0,0,0,0.04)', display: isClocks ? 'none' : 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '10px 8px 18px', direction: 'rtl', overflow: 'visible' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', width: '100%' }}>
              {(() => {
                const navItems = isCoach ? [
                  { to: createPageUrl("Dashboard"),    emoji: '🏠', label: 'בית' },
                  { to: createPageUrl("AllUsers"),     emoji: '👥', label: 'מתאמנים' },
                  { to: createPageUrl("PlanBuilder"),  emoji: '📋', label: 'תוכניות' },
                  { to: createPageUrl("Sessions"),     emoji: '📅', label: 'מפגשים' },
                  { to: createPageUrl("CoachProfile"), emoji: '👤', label: 'פרופיל' },
                ] : [
                  { to: createPageUrl("TraineeHome"),     emoji: '🏠', label: 'בית' },
                  { to: createPageUrl("MyWorkoutLog"),    emoji: '📋', label: 'תוכניות' },
                  { to: createPageUrl("TraineeSessions"), emoji: '📅', label: 'מפגשים' },
                  { to: createPageUrl("Progress"),        emoji: '🏆', label: 'שיאים' },
                  { to: createPageUrl("TraineeProfile"),  emoji: '👤', label: 'פרופיל' },
                ];
                return navItems.map(item => {
                  const active = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="transition-all"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        minWidth: 60,
                        cursor: 'pointer',
                        textDecoration: 'none',
                        overflow: 'visible',
                      }}
                    >
                      {/* Emoji renders in its native multi-color — no color override. */}
                      <span style={{
                        fontSize: 26,
                        lineHeight: 1,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>{item.emoji}</span>
                      <span style={{
                        fontSize: 12,
                        lineHeight: 1,
                        letterSpacing: '0.3px',
                        marginTop: 3,
                        color: active ? '#FF6F20' : '#6b7280',
                        fontWeight: active ? 700 : 500,
                      }}>{item.label}</span>
                    </Link>
                  );
                });
              })()}
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