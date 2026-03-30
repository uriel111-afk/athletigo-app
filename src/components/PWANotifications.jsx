import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * PWA Push Notifications Manager
 * Handles service worker registration and push notification permissions
 */
export default function PWANotifications({ userId }) {
  const [permission, setPermission] = useState('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if Push API is supported
    if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error('הדפדפן אינו תומך בהתראות פוש');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast.success('✅ התראות פוש הופעלו');
        
        // Register service worker (if needed)
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('[PWA] Service Worker registered:', registration);
          } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
          }
        }
      } else if (result === 'denied') {
        toast.error('הרשאת התראות נדחתה');
      }
    } catch (error) {
      console.error('[PWA] Notification permission error:', error);
      toast.error('שגיאה בהפעלת התראות');
    }
  };

  // Auto-request on mount if not decided yet
  useEffect(() => {
    if (isSupported && permission === 'default' && userId) {
      // Show a gentle prompt after 3 seconds
      const timer = setTimeout(() => {
        requestPermission();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission, userId]);

  return null; // This is a headless component
}