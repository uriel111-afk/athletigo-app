import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { countUnread, formatBadge } from "@/lib/notificationCounts";

export default function NotificationBadge({ userId, onClick, inline = false }) {
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      try {
        // Same bounded fetch as the Notifications page (last 6 months,
        // newest 200) so the bell badge counts EXACTLY what the page
        // displays — one source of truth. They share this queryKey, so
        // the queryFn must match to avoid a bounded-vs-unbounded skew
        // (older/beyond-200 unread rows inflating the badge only).
        const since = new Date();
        since.setMonth(since.getMonth() - 6);
        const rows = await base44.entities.Notification.filter(
          { user_id: userId, created_at: { $gte: since.toISOString() } },
          '-created_at',
          200,
        );
        console.log('[NotificationBadge] raw rows:', rows?.length ?? 0);
        return rows;
      } catch {
        return [];
      }
    },
    initialData: [],
    refetchInterval: 10000,
    enabled: !!userId
  });

  // Counter logic: shared with the Notifications page via
  // countUnread() so the badge and the page header can never diverge.
  const unreadCount = countUnread(notifications);

  if (inline) {
    return unreadCount > 0 ? (
      <span
        className="absolute -top-1 -left-1 h-5 min-w-5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ backgroundColor: '#FF3B30', color: 'white', boxShadow: '0 2px 4px rgba(255, 59, 48, 0.3)' }}
      >
        {formatBadge(unreadCount)}
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
            minWidth: 16, height: 16,
            borderRadius: 8,
            background: '#dc2626',
            color: 'white',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid white',
            padding: '0 3px',
          }}
        >
          {formatBadge(unreadCount)}
        </span>
      )}
    </button>
  );
}