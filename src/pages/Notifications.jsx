import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import NotificationCenter from "../components/NotificationCenter";

export default function Notifications() {
  const [user, setUser] = React.useState(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error("[Notifications] Error loading user:", error);
      }
    };
    loadUser();
  }, []);

  // Mark all notifications as read when entering this page
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      try {
        return await base44.entities.Notification.filter({ user_id: user?.id }, '-created_at');
      } catch {
        return [];
      }
    },
    initialData: [],
    enabled: !!user?.id
  });

  React.useEffect(() => {
    const markAllAsRead = async () => {
      if (!user?.id || notifications.length === 0) return;

      const unreadNotifications = notifications.filter(n => !n.is_read);
      if (unreadNotifications.length === 0) return;

      try {
        // Mark all unread notifications as read
        for (const notification of unreadNotifications) {
          await base44.entities.Notification.update(notification.id, { is_read: true });
        }
        // Refresh notifications
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch (error) {
        console.error('[Notifications] Error marking as read:', error);
      }
    };

    // Mark as read after a short delay to allow UI to render
    const timer = setTimeout(markAllAsRead, 500);
    return () => clearTimeout(timer);
  }, [user?.id, notifications, queryClient]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden pb-32" style={{ backgroundColor: '#FFFFFF' }} dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6 w-full">
        {/* Header */}
        <div className="mb-8 relative">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" 
               style={{ background: 'radial-gradient(circle, #FF6F20 0%, transparent 70%)' }} />
          
          <div className="relative">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center justify-center w-16 h-16 rounded-3xl" 
                   style={{ background: 'linear-gradient(135deg, #FF6F20 0%, #FF8F50 100%)', boxShadow: '0 4px 12px rgba(255, 111, 32, 0.3)' }}>
                <Bell className="w-9 h-9 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-black leading-tight" 
                    style={{ 
                      background: 'linear-gradient(135deg, #000000 0%, #4D4D4D 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      fontFamily: 'Montserrat, Heebo, sans-serif' 
                    }}>
                  התראות
                </h1>
                <p className="text-xl font-medium mt-1" style={{ color: '#7D7D7D' }}>
                  🔔 עדכונים בזמן אמת
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, #FF6F20 0%, #FF8F50 100%)' }} />
              <div className="h-1 w-12 rounded-full" style={{ backgroundColor: '#E6E6E6' }} />
              <div className="h-1 w-6 rounded-full" style={{ backgroundColor: '#E6E6E6' }} />
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <NotificationCenter userId={user.id} />
      </div>
    </div>
  );
}