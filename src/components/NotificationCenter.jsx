import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Calendar, FileText, MessageSquare, Package, Users, TrendingUp, CheckCircle, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function NotificationCenter({ userId }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      try {
        return await base44.entities.Notification.filter({ user_id: userId }, '-created_at');
      } catch (error) {
        console.error("[NotificationCenter] Error loading notifications:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 10000,
    enabled: !!userId
  });

  const [acknowledgingId, setAcknowledgingId] = useState(null);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationIds) => {
      for (const id of notificationIds) {
        await base44.entities.Notification.update(id, { is_read: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
    onError: () => {},
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Notification.update(id, {
        is_read: true,
        acknowledged_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success("✅ אישרת קריאה");
    },
    onError: () => toast.error("❌ שגיאה באישור"),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  useEffect(() => {
    // Auto-mark as read only notifications that do NOT require acknowledgment
    const autoReadable = notifications.filter(n => !n.is_read && !n.requires_acknowledgment);
    if (autoReadable.length > 0) {
      const timeoutId = setTimeout(() => {
        markAsReadMutation.mutate(autoReadable.map(n => n.id));
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [notifications]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'session':
      case 'session_scheduled':
      case 'session_request':
      case 'session_approved':
      case 'session_rejected':
      case 'session_confirmed':
      case 'session_completed':
        return <Calendar className="w-5 h-5" style={{ color: '#FF6F20' }} />;
      case 'training_plan':
      case 'plan_created':
      case 'plan_updated':
        return <FileText className="w-5 h-5" style={{ color: '#2196F3' }} />;
      case 'message':
      case 'new_message':
        return <MessageSquare className="w-5 h-5" style={{ color: '#9C27B0' }} />;
      case 'subscription':
      case 'renewal_request':
      case 'service_completed':
      case 'low_balance':
        return <Package className="w-5 h-5" style={{ color: '#4CAF50' }} />;
      case 'workout_completion':
      case 'new_record':
      case 'new_baseline':
        return <TrendingUp className="w-5 h-5" style={{ color: '#FF6F20' }} />;
      case 'new_trainee':
        return <Users className="w-5 h-5" style={{ color: '#2196F3' }} />;
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
      {notifications.map(notification => {
        const needsAck = notification.requires_acknowledgment && !notification.acknowledged_at;
        const isAcked = notification.requires_acknowledgment && !!notification.acknowledged_at;

        return (
          <div
            key={notification.id}
            onClick={async () => {
              // Mark as read on click
              if (!notification.is_read && !needsAck) {
                try { await base44.entities.Notification.update(notification.id, { is_read: true }); queryClient.invalidateQueries({ queryKey: ['notifications'] }); } catch {}
              }
              if (!needsAck && notification.actionUrl) navigate(notification.actionUrl);
            }}
            className="p-4 rounded-xl transition-all"
            style={{
              backgroundColor: needsAck ? '#FFF3E0' : (notification.is_read ? '#FAFAFA' : getNotificationColor(notification.type)),
              border: needsAck ? '2px solid #FF6F20' : (notification.is_read ? '1px solid #E0E0E0' : '2px solid #FF6F20'),
              opacity: (notification.is_read && !needsAck) ? 0.75 : 1,
              cursor: notification.actionUrl && !needsAck ? 'pointer' : 'default',
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {needsAck ? <ShieldCheck className="w-5 h-5 text-[#FF6F20]" /> : getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm mb-1" style={{ color: '#000000' }}>
                  {notification.title}
                </h4>
                <p className="text-xs leading-relaxed mb-2 whitespace-pre-line" style={{ color: '#000000' }}>
                  {notification.message}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: '#7D7D7D' }}>
                    {notification.created_at && format(new Date(notification.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                  </p>
                  <div className="flex items-center gap-2">
                    {!notification.is_read && !needsAck && (
                      <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: '#FF6F20', color: 'white' }}>
                        חדש
                      </span>
                    )}
                    {notification.actionUrl && !needsAck && (
                      <ExternalLink className="w-4 h-4" style={{ color: '#2196F3' }} />
                    )}
                  </div>
                </div>

                {/* Requires acknowledgment */}
                {needsAck && (
                  <div className="mt-3">
                    <Button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setAcknowledgingId(notification.id);
                        try { await acknowledgeMutation.mutateAsync(notification.id); } catch {}
                        setAcknowledgingId(null);
                      }}
                      disabled={acknowledgeMutation.isPending && acknowledgingId === notification.id}
                      className="w-full rounded-xl py-2.5 font-bold text-white text-sm"
                      style={{ backgroundColor: '#FF6F20' }}
                    >
                      {acknowledgeMutation.isPending && acknowledgingId === notification.id ? (
                        <><Loader2 className="w-4 h-4 ml-1 animate-spin" />מאשר...</>
                      ) : (
                        <><ShieldCheck className="w-4 h-4 ml-1" />קראתי ומאשר קבלה</>
                      )}
                    </Button>
                  </div>
                )}

                {/* Already acknowledged */}
                {isAcked && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold" style={{ color: '#4CAF50' }}>
                    <CheckCircle className="w-4 h-4" />
                    אושר ב-{format(new Date(notification.acknowledged_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}