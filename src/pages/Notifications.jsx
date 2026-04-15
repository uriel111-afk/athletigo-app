import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationCenter from "../components/NotificationCenter";
import { toast } from "sonner";

export default function Notifications() {
  const [user, setUser] = useState(null);
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

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await base44.entities.Notification.update(n.id, { is_read: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success("כל ההתראות סומנו כנקראו");
    },
    onError: () => toast.error("שגיאה בסימון התראות"),
  });

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
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl"
                   style={{ background: 'linear-gradient(135deg, #FF6F20 0%, #FF8F50 100%)', boxShadow: '0 4px 12px rgba(255, 111, 32, 0.3)' }}>
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">התראות</h1>
                <p className="text-xs text-gray-500">
                  {unreadCount > 0 ? `${unreadCount} התראות שלא נקראו` : 'כל ההתראות נקראו'}
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-bold h-9 gap-1.5 text-[#FF6F20] border-[#FF6F20]/30 hover:bg-orange-50"
              >
                {markAllAsReadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4" />
                )}
                סמן הכל כנקרא
              </Button>
            )}
          </div>
          <div className="h-[1.5px] rounded-full" style={{ backgroundColor: '#FF6F20' }} />
        </div>

        {/* Notifications List */}
        <NotificationCenter userId={user.id} />
      </div>
    </div>
  );
}
