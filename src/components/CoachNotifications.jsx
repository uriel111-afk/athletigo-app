import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Check, CheckCheck, Trash2, Calendar, Award, MessageCircle, ClipboardList, X } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

const NOTIFICATION_ICONS = {
  workout_completed: { icon: Award, color: "#4CAF50", bg: "#E8F5E9" },
  session_request: { icon: Calendar, color: "#2196F3", bg: "#E3F2FD" },
  feedback_provided: { icon: MessageCircle, color: "#FF6F20", bg: "#FFE4D3" },
  plan_assigned: { icon: ClipboardList, color: "#9C27B0", bg: "#F3E5F5" }
};

const NOTIFICATION_LABELS = {
  workout_completed: "השלמת אימון",
  session_request: "בקשת פגישה",
  feedback_provided: "פידבק חדש",
  plan_assigned: "תוכנית הוקצתה"
};

export default function CoachNotifications({ coach }) {
  const [showPanel, setShowPanel] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['coach-notifications', coach?.id],
    queryFn: async () => {
      if (!coach?.id) return [];
      return base44.entities.Notification.filter({ coach_id: coach.id }, '-created_at');
    },
    initialData: [],
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    enabled: !!coach?.id
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-notifications'] });
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadNotifications = notifications.filter(n => !n.read);
      for (const notification of unreadNotifications) {
        await base44.entities.Notification.update(notification.id, { read: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-notifications'] });
      toast.success("כל ההתראות סומנו כנקראו");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-notifications'] });
      toast.success("ההתראה נמחקה");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.type === 'session_request' && notification.related_session_id) {
      window.location.href = createPageUrl("Sessions");
    } else if (notification.type === 'workout_completed' && notification.related_plan_id) {
      window.location.href = createPageUrl("TrainingPlans");
    }
  };

  return (
    <>
      <button
        onClick={() => setShowPanel(true)}
        className="relative p-3 rounded-xl transition-all"
        style={{ 
          backgroundColor: unreadCount > 0 ? '#FFE4D3' : '#F7F7F7',
          border: unreadCount > 0 ? '2px solid #FF6F20' : '1px solid #E6E6E6'
        }}
      >
        <Bell 
          className="w-6 h-6" 
          style={{ color: unreadCount > 0 ? '#FF6F20' : '#7D7D7D' }} 
        />
        {unreadCount > 0 && (
          <span 
            className="absolute -top-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
            style={{ backgroundColor: '#FF6F20', color: 'white' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Dialog open={showPanel} onOpenChange={setShowPanel}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-3xl font-black" style={{ color: '#000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                התראות
              </DialogTitle>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    size="sm"
                    className="rounded-xl px-4 py-2 font-bold"
                    style={{ backgroundColor: '#FF6F20', color: 'white' }}
                  >
                    <CheckCheck className="w-4 h-4 ml-2" />
                    סמן הכל כנקרא
                  </Button>
                )}
                <Button
                  onClick={() => setShowPanel(false)}
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-6">
            {notifications.length === 0 ? (
              <div className="text-center py-16">
                <Bell className="w-16 h-16 mx-auto mb-4" style={{ color: '#E6E6E6' }} />
                <p className="text-lg font-bold mb-2" style={{ color: '#000' }}>
                  אין התראות
                </p>
                <p style={{ color: '#7D7D7D' }}>
                  התראות חדשות יופיעו כאן
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map(notification => {
                  const config = NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.feedback_provided;
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className="p-5 rounded-xl transition-all cursor-pointer"
                      style={{ 
                        backgroundColor: notification.read ? '#FFFFFF' : config.bg,
                        border: notification.read ? '1px solid #E6E6E6' : `2px solid ${config.color}`,
                        opacity: notification.read ? 0.7 : 1
                      }}
                    >
                      <div className="flex items-start gap-4">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: config.color }}
                        >
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="text-base font-bold mb-1" style={{ color: '#000' }}>
                                {notification.title}
                              </h4>
                              <p className="text-sm mb-2" style={{ color: '#4D4D4D' }}>
                                {notification.message}
                              </p>
                              <div className="flex items-center gap-3 text-xs" style={{ color: '#7D7D7D' }}>
                                <span>👤 {notification.trainee_name}</span>
                                <span>•</span>
                                <span>{new Date(notification.created_at).toLocaleDateString('he-IL')}</span>
                              </div>
                            </div>
                            
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotificationMutation.mutate(notification.id);
                              }}
                              size="sm"
                              variant="ghost"
                              className="rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" style={{ color: '#7D7D7D' }} />
                            </Button>
                          </div>
                          
                          {!notification.read && (
                            <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid #E6E6E6' }}>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsReadMutation.mutate(notification.id);
                                }}
                                size="sm"
                                className="rounded-lg px-4 py-2 font-bold"
                                style={{ backgroundColor: '#F7F7F7', color: '#000', border: '1px solid #E6E6E6' }}
                              >
                                <Check className="w-4 h-4 ml-2" />
                                סמן כנקרא
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}