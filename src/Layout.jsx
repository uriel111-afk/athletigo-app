import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { safeFetch } from "@/functions/GlobalErrorHandler";
import ErrorBoundary from "@/components/ErrorBoundary";
import AdminCoachActivator from "@/components/AdminCoachActivator";
import NotificationBadge from "@/components/NotificationBadge";
import PWANotifications from "@/components/PWANotifications";
import DataLoader from "@/components/DataLoader";
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
  ArrowRight,
  UserPlus,
  BarChart3,
  Bell,
  Zap
  } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO_MAIN = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/f4582ad21_Untitleddesign1.png";
const LOGO_ICON = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/64e812e61_Untitleddesign3.jpg";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await safeFetch(
          base44.auth.me(),
          { fallback: null, context: 'Layout loadUser' }
        );

        if (currentUser) {
          setUser(currentUser);
          const userIsCoach = currentUser.isCoach === true;
          setIsCoach(userIsCoach);
        }
      } catch (error) {
        console.error("[Layout] Error loading user:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const coachNavItems = [
    {
      title: "דשבורד",
      url: createPageUrl("Dashboard"),
      icon: LayoutDashboard,
      section: "coach"
    },
    {
      title: "התראות",
      url: createPageUrl("Notifications"),
      icon: Bell,
      section: "coach",
      showBadge: true
    },
    {
      title: "לידים",
      url: createPageUrl("Leads"),
      icon: UserPlus,
      section: "coach"
    },
    {
      title: "כל המשתמשים",
      url: createPageUrl("AllUsers"),
      icon: Users,
      section: "coach"
    },
    {
      title: "המרות",
      url: createPageUrl("ConversionDashboard"),
      icon: BarChart3,
      section: "coach"
    },
    {
      title: "תוכניות אימון",
      url: createPageUrl("TrainingPlans"),
      icon: ClipboardList,
      section: "coach"
    },
    {
      title: "מפגשים",
      url: createPageUrl("Sessions"),
      icon: Calendar,
      section: "coach"
    },

    {
      title: "סיכום כספי",
      url: createPageUrl("FinancialOverview"),
      icon: DollarSign,
      section: "coach"
    },
    {
      title: "פרופיל מאמן",
      url: createPageUrl("CoachProfile"),
      icon: User,
      section: "coach"
    },
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
      title: "פרופיל מתאמן",
      url: createPageUrl("TraineeProfile"),
      icon: User,
      section: "trainee"
    },
  ];

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
    } catch (error) {
      console.error("[Layout] Logout error:", error);
      window.location.href = '/';
    }
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

  if (user && !user.onboarding_completed && currentPageName !== "Onboarding") {
    window.location.href = createPageUrl("Onboarding");
    return null;
  }

  const navigationItems = isCoach ? coachNavItems : traineeNavItems;
  const userRoleLabel = isCoach ? '👨‍💼 מאמן' : '👤 מתאמן';
  const primaryColor = '#FF6F20';
  const primaryColorLight = '#FFF8F3';

  const noBackButtonPages = ["Dashboard", "TraineeHome", "Onboarding"];
  const shouldShowBackButton = !noBackButtonPages.includes(currentPageName);

  return (
    <ErrorBoundary>
      <AdminCoachActivator user={user} />
      <PWANotifications userId={user?.id} />
      <DataLoader user={user} />

      <div dir="rtl" className="min-h-screen flex" style={{
        backgroundColor: '#FFFFFF',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        minHeight: '-webkit-fill-available',
        position: 'relative',
        overflow: 'hidden',
        maxWidth: '100vw',
        width: '100%'
      }}>
        {shouldShowBackButton && (
          <button
            onClick={() => navigate(-1)}
            className="fixed top-4 left-4 z-[60] w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-gray-50 shadow-md hover:shadow-lg"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              color: '#000000',
              border: '1px solid #E0E0E0'
            }}
            title="חזור"
          >
            <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
          </button>
        )}

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

          <nav className="flex-1 space-y-2 overflow-y-auto">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.url;

              return (
                <Link
                  key={item.title}
                  to={item.url}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative"
                  style={{
                    backgroundColor: isActive ? primaryColorLight : '#FFFFFF',
                    color: isActive ? primaryColor : '#000000',
                    border: isActive ? `2px solid ${primaryColor}` : '1px solid transparent'
                  }}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.title}</span>
                  {item.showBadge && user && <NotificationBadge userId={user.id} inline={true} />}
                </Link>
              );
            })}
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

        <main className="flex-1 flex flex-col" style={{ overflowX: 'hidden' }}>
          <header className="md:hidden p-4 safe-area-top" style={{
            backgroundColor: '#FFFFFF',
            borderBottom: `1px solid #E0E0E0`,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
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
              <div className="w-10" />
            </div>
          </header>

          {mobileMenuOpen && (
            <div className="md:hidden p-4 space-y-2 max-h-[70vh] overflow-y-auto safe-area-inset" style={{
              backgroundColor: '#FFFFFF',
              borderBottom: `1px solid #E0E0E0`,
              position: 'fixed',
              top: '72px',
              left: 0,
              right: 0,
              zIndex: 99,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.url;

                return (
                  <Link
                    key={item.title}
                    to={item.url}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative"
                    style={{
                      backgroundColor: isActive ? primaryColorLight : '#FFFFFF',
                      color: isActive ? primaryColor : '#000000',
                      border: isActive ? `2px solid ${primaryColor}` : `1px solid #E0E0E0`
                    }}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.title}</span>
                    {item.showBadge && user && <NotificationBadge userId={user.id} inline={true} />}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-auto page-container safe-area-bottom" style={{ 
            paddingBottom: isCoach ? '20px' : '140px', 
            paddingTop: '88px',
            paddingLeft: '16px', 
            paddingRight: '16px',
            WebkitOverflowScrolling: 'touch',
            overflowX: 'hidden',
            maxWidth: '100vw',
            width: '100%'
          }}>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>

          {/* Mobile Bottom Navigation - Only for Trainees */}
          {!isCoach && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 safe-area-bottom z-50" 
                 style={{ backgroundColor: '#FFFFFF', borderTop: `1px solid #E0E0E0`, boxShadow: '0 -2px 10px rgba(0,0,0,0.08)' }}>
              <div className="grid grid-cols-5 gap-1 p-2">
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
                  to={createPageUrl("Notifications")}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all relative"
                  style={{
                    backgroundColor: location.pathname === createPageUrl("Notifications") ? primaryColorLight : 'transparent',
                    color: location.pathname === createPageUrl("Notifications") ? primaryColor : '#7D7D7D'
                  }}
                >
                  <Bell className="w-6 h-6" />
                  <span className="text-xs font-bold">התראות</span>
                  {user && <NotificationBadge userId={user.id} inline={true} />}
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
              </div>
            </div>
          )}
          </main>
          </div>
          </ErrorBoundary>
          );
          }