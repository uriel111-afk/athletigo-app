import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Calendar, FileText, MessageSquare, Package, Users, TrendingUp, CheckCircle, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function NotificationCenter({ userId }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      try {
        return await base44.entities.Notification.filter({ userId }, '-created_date');
      } catch (error) {
        console.error("[NotificationCenter] Error loading notifications:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 10000,
    enabled: !!userId
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationIds) => {
      for (const id of notificationIds) {
        await base44.entities.Notification.update(id, { isRead: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    }
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    }
  });

  useEffect(() => {
    const unreadNotifications = notifications.filter(n => !n.isRead);
    if (unreadNotifications.length > 0) {
      const timeoutId = setTimeout(() => {
        markAsReadMutation.mutate(unreadNotifications.map(n => n.id));
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [notifications]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'session': return <Calendar className="w-5 h-5" style={{ color: '#FF6F20' }} />;
      case 'training_plan': return <FileText className="w-5 h-5" style={{ color: '#2196F3' }} />;
      case 'message': return <MessageSquare className="w-5 h-5" style={{ color: '#9C27B0' }} />;
      case 'subscription': return <Package className="w-5 h-5" style={{ color: '#4CAF50' }} />;
      case 'workout_completion': return <TrendingUp className="w-5 h-5" style={{ color: '#FF6F20' }} />;
      case 'new_trainee': return <Users className="w-5 h-5" style={{ color: '#2196F3' }} />;
      default: return <Bell className="w-5 h-5" style={{ color: '#7D7D7D' }} />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'session': return '#FFF8F3';
      case 'training_plan': return '#E3F2FD';
      case 'message': return '#F3E5F5';
      case 'subscription': return '#E8F5E9';
      case 'workout_completion': return '#FFF8F3';
      case 'new_trainee': return '#E3F2FD';
      default: return '#FAFAFA';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <Bell className="w-16 h-16 mx-auto mb-4" style={{ color: '#E0E0E0' }} />
        <h3 className="text-lg font-bold mb-2" style={{ color: '#000000' }}>אין התראות</h3>
        <p className="text-sm" style={{ color: '#7D7D7D' }}>כל ההתראות יופיעו כאן</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {notifications.map(notification => (
        <div
          key={notification.id}
          onClick={() => {
            if (notification.actionUrl) {
              navigate(notification.actionUrl);
            }
          }}
          className="p-4 rounded-xl transition-all cursor-pointer hover:shadow-lg"
          style={{
            backgroundColor: notification.isRead ? '#FAFAFA' : getNotificationColor(notification.type),
            border: notification.isRead ? '1px solid #E0E0E0' : '2px solid #FF6F20',
            opacity: notification.isRead ? 0.7 : 1
          }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm mb-1" style={{ color: '#000000' }}>
                {notification.title}
              </h4>
              <p className="text-xs leading-relaxed mb-2" style={{ color: '#000000' }}>
                {notification.message}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: '#7D7D7D' }}>
                  {notification.created_date && format(new Date(notification.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                </p>
                <div className="flex items-center gap-2">
                  {!notification.isRead && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: '#FF6F20', color: 'white' }}>
                      חדש
                    </span>
                  )}
                  {notification.actionUrl && (
                    <ExternalLink className="w-4 h-4" style={{ color: '#2196F3' }} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}