import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";

export default function NotificationBadge({ userId, onClick, inline = false }) {
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      try {
        return await base44.entities.Notification.filter({ user_id: userId }, '-created_at');
      } catch {
        return [];
      }
    },
    initialData: [],
    refetchInterval: 10000,
    enabled: !!userId
  });

  // Counter logic: live unread rows only. A reminder waiting to fire
  // sits as is_read=false until App.jsx's polling loop pops it (which
  // sets is_read=true), so reminders due naturally appear in this
  // count without extra plumbing. handled / deleted rows are excluded.
  const unreadCount = notifications.filter(
    n => !n.is_read && n.status !== 'deleted' && n.status !== 'handled'
  ).length;

  if (inline) {
    return unreadCount > 0 ? (
      <span
        className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ backgroundColor: '#FF3B30', color: 'white', boxShadow: '0 2px 4px rgba(255, 59, 48, 0.3)' }}
      >
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    ) : null;
  }

  return (
    <button
      onClick={onClick}
      style={{
        width: 40, height: 40,
        borderRadius: '50%',
        background: 'white',
        border: '1px solid #F0E4D0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <Bell size={20} style={{ color: '#FF6F20' }} />
      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -2, right: -2,
            width: 16, height: 16,
            borderRadius: '50%',
            background: '#dc2626',
            color: 'white',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid white',
            padding: 0,
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}