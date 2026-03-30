import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Calendar, Dumbbell, TrendingUp, User, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TraineeSessionBooking from "../components/TraineeSessionBooking";

export default function TraineeHome() {
  const [user, setUser] = useState(null);
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  const [mySessions, setMySessions] = useState([]);
  const queryClient = base44.queryClient; // Or import useQueryClient

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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8 bg-white" dir="rtl">
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
                  
                  {(session.status === 'ממתין לאישור' || session.status === 'מאושר') && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => handleCancelSession(session)}
                      className="text-red-500 hover:bg-red-50 h-8"
                    >
                      ביטול
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Link to={createPageUrl("MyPlan")} className="no-underline">
            <div className="p-6 rounded-2xl bg-[#FF6F20] text-white hover:shadow-lg transition-all cursor-pointer h-full">
              <Dumbbell className="w-8 h-8 mb-4" />
              <h3 className="text-2xl font-bold mb-1">התוכנית שלי</h3>
              <p className="opacity-90">צפה בתוכניות האימון שלך והתחל להתאמן</p>
            </div>
          </Link>

          <div 
            onClick={() => setShowBookingDialog(true)}
            className="p-6 rounded-2xl bg-white border-2 border-[#FF6F20] text-[#FF6F20] hover:bg-[#FFF8F3] transition-all cursor-pointer h-full"
          >
            <Calendar className="w-8 h-8 mb-4" />
            <h3 className="text-2xl font-bold mb-1">קבע אימון</h3>
            <p className="text-gray-600">הזמן מפגש חדש עם המאמן שלך</p>
          </div>

          <Link to={createPageUrl("Progress")} className="no-underline">
            <div className="p-6 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer h-full">
              <TrendingUp className="w-8 h-8 mb-4 text-gray-700" />
              <h3 className="text-2xl font-bold mb-1 text-gray-900">התקדמות</h3>
              <p className="text-gray-600">עקוב אחר המדדים וההישגים שלך</p>
            </div>
          </Link>

          <Link to={createPageUrl("TraineeProfile")} className="no-underline">
            <div className="p-6 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer h-full">
              <User className="w-8 h-8 mb-4 text-gray-700" />
              <h3 className="text-2xl font-bold mb-1 text-gray-900">פרופיל</h3>
              <p className="text-gray-600">צפה ועדכן את הפרטים האישיים</p>
            </div>
          </Link>
        </div>

        <TraineeSessionBooking 
          open={showBookingDialog} 
          onClose={() => setShowBookingDialog(false)} 
          user={user} 
          coach={coach} 
        />
      </div>
    </div>
  );
}