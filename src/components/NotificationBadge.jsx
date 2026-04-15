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

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
      className="relative p-2 rounded-xl transition-all hover:bg-gray-100"
      style={{ border: '1px solid #E0E0E0' }}
    >
      <Bell className="w-5 h-5" style={{ color: unreadCount > 0 ? '#FF6F20' : '#7D7D7D' }} />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: '#FF3B30', color: 'white', boxShadow: '0 2px 4px rgba(255, 59, 48, 0.3)' }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}