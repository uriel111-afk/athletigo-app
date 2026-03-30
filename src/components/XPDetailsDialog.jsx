import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Award, TrendingUp, Zap, Calendar } from "lucide-react";

export default function XPDetailsDialog({ isOpen, onClose, xpData, user }) {
  if (!xpData || !user) return null;

  const xpBreakdown = [
    { label: "אימונים שהושלמו", value: xpData.completedWorkouts, xp: xpData.completedWorkouts * 10, icon: "✅" },
    { label: "רצף ימים", value: user.workout_streak_days || 0, xp: (user.workout_streak_days || 0) * 5, icon: "🔥" },
    { label: "תוכניות שהושלמו", value: 0, xp: 0, icon: "🏆" }
  ];

  const totalXP = user.xp_total || 0;
  const currentLevel = user.xp_level || 1;
  const xpForNextLevel = currentLevel * 100;
  const xpProgress = ((totalXP % 100) / xpForNextLevel) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-3xl font-black" style={{ color: '#000' }}>
            ⭐ נקודות XP - מערכת ההתקדמות
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Level Card */}
          <div className="p-8 rounded-2xl text-center relative overflow-hidden" style={{ backgroundColor: '#000', border: '3px solid #FF6F20' }}>
            <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle, #FF6F20 0%, transparent 70%)' }} />
            <div className="relative">
              <Award className="w-16 h-16 mx-auto mb-4" style={{ color: '#FF6F20' }} />
              <p className="text-sm font-bold mb-2" style={{ color: '#FFFFFF', opacity: 0.8 }}>
                הרמה שלך
              </p>
              <p className="text-7xl font-black mb-4" style={{ color: '#FFFFFF' }}>
                {currentLevel}
              </p>
              <div className="mb-2">
                <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  <div className="h-full transition-all" style={{ width: `${xpProgress}%`, backgroundColor: '#FF6F20' }} />
                </div>
              </div>
              <p className="text-sm font-bold" style={{ color: '#FF6F20' }}>
                {totalXP % 100} / {xpForNextLevel} XP לרמה הבאה
              </p>
            </div>
          </div>

          {/* Total XP */}
          <div className="p-6 rounded-xl text-center" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
            <Zap className="w-12 h-12 mx-auto mb-3" style={{ color: '#FF6F20' }} />
            <p className="text-sm font-bold mb-2" style={{ color: '#7D7D7D' }}>
              סה״כ נקודות XP
            </p>
            <p className="text-6xl font-black" style={{ color: '#FF6F20' }}>
              {totalXP}
            </p>
          </div>

          {/* XP Breakdown */}
          <div className="space-y-3">
            <h3 className="text-xl font-black mb-4" style={{ color: '#000' }}>
              📊 פירוט נקודות
            </h3>
            {xpBreakdown.map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl flex items-center justify-between" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{item.icon}</div>
                  <div>
                    <p className="font-bold text-base" style={{ color: '#000' }}>{item.label}</p>
                    <p className="text-sm" style={{ color: '#7D7D7D' }}>{item.value} פעמים</p>
                  </div>
                </div>
                <div className="px-4 py-2 rounded-lg font-black text-lg" style={{ backgroundColor: '#FFE4D3', color: '#FF6F20' }}>
                  +{item.xp} XP
                </div>
              </div>
            ))}
          </div>

          {/* How to Earn XP */}
          <div className="p-6 rounded-xl" style={{ backgroundColor: '#E3F2FD', border: '2px solid #2196F3' }}>
            <h3 className="text-xl font-black mb-4 flex items-center gap-2" style={{ color: '#000' }}>
              <TrendingUp className="w-6 h-6" style={{ color: '#2196F3' }} />
              איך לצבור XP?
            </h3>
            <div className="space-y-2">
              <p className="text-sm" style={{ color: '#000' }}><span className="font-bold">+10 XP</span> - השלמת אימון</p>
              <p className="text-sm" style={{ color: '#000' }}><span className="font-bold">+5 XP</span> - רצף יומי (לכל יום)</p>
              <p className="text-sm" style={{ color: '#000' }}><span className="font-bold">+25 XP</span> - סיום תוכנית אימון מלאה</p>
              <p className="text-sm" style={{ color: '#000' }}><span className="font-bold">+8 XP</span> - עמידה באתגר</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}