import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Dumbbell, TrendingUp, Calendar, User } from "lucide-react";

export default function GlobalFooterSlogan() {
  const location = useLocation();

  const traineeNavItems = [
  {
    title: "דף הבית",
    url: createPageUrl("TraineeHome"),
    icon: Home
  },
  {
    title: "התוכנית שלי",
    url: createPageUrl("MyPlan"),
    icon: Dumbbell
  },
  {
    title: "התקדמות",
    url: createPageUrl("Progress"),
    icon: TrendingUp
  },
  {
    title: "יומן אימונים",
    url: createPageUrl("MyWorkoutLog"),
    icon: Calendar
  },
  {
    title: "פרופיל",
    url: createPageUrl("TraineeProfile"),
    icon: User
  }];


  return (
    <footer className="bg-white px-3 fixed bottom-0 left-0 right-0 z-50"

    style={{
      boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.08)',
      borderTopLeftRadius: '16px',
      borderTopRightRadius: '16px'
    }}
    dir="rtl">

      {/* Navigation Bar - Compact */}
      <div className="pt-2 pb-1 px-1 md:px-4" style={{ borderBottom: '1px solid #E6E6E6' }}>
        <div className="flex justify-between items-center gap-0.5 md:gap-2 max-w-2xl mx-auto">
          {traineeNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            const Icon = item.icon;

            return (
              <Link
                key={item.title}
                to={item.url}
                className="flex flex-col items-center gap-0.5 px-1.5 md:px-3 py-1.5 md:py-2 rounded md:rounded-xl transition-all flex-1"
                style={{
                  backgroundColor: isActive ? '#FFE4D3' : 'transparent',
                  border: isActive ? '1px solid #FF6F20' : '1px solid transparent',
                  minWidth: 0,
                  maxWidth: '20%'
                }}>

                <Icon
                  className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0"
                  style={{
                    color: isActive ? '#FF6F20' : '#000000',
                    strokeWidth: isActive ? 2.5 : 2
                  }} />

                <span
                  className="text-[8px] md:text-xs font-bold text-center leading-tight truncate w-full"
                  style={{
                    color: isActive ? '#FF6F20' : '#4D4D4D'
                  }}>

                  {item.title}
                </span>
              </Link>);

          })}
        </div>
      </div>

      {/* Slogan Section - Minimal */}
      <div className="py-1.5 md:py-3 px-2 md:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h3
            className="text-[9px] md:text-sm font-semibold mb-0.5 md:mb-1"
            style={{
              color: '#000000',
              fontFamily: 'Montserrat, Heebo, sans-serif',
              letterSpacing: '-0.01em',
              opacity: 0.85
            }}>
            ATHLETIGO — תנועה שמייצרת שינוי
          </h3>

          <p className="text-[7px] md:text-xs mb-1 md:mb-2" style={{ opacity: 0.75 }}>
            <span className="font-semibold" style={{ color: '#FF6F20' }}>
              שיטת אתלטיגו™
            </span>
            <span className="font-normal" style={{ color: '#1A1A1A' }}>
              {' '}— פשוט להתאמן נכון
            </span>
          </p>

          <div
            className="mx-auto rounded-full"
            style={{
              width: '40%',
              maxWidth: '150px',
              height: '1px',
              backgroundColor: '#FF6F20',
              opacity: 0.5
            }} />
        </div>
      </div>
    </footer>);

}