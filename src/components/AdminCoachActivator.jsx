import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const ADMIN_EMAILS = ['uriel111@gmail.com', 'Athletigo@gmail.com'];

export default function AdminCoachActivator({ user }) {
  useEffect(() => {
    const activateCoachAccess = async () => {
      if (!user) return;
      
      const isAdminEmail = ADMIN_EMAILS.includes(user.email);
      
      if (isAdminEmail && !user.isCoach) {
        try {
          await base44.auth.updateMe({ 
            isCoach: true
          });
          
          console.log(`[AdminCoachActivator] ✅ Activated ADMIN coach access for ${user.email}`);
          toast.success("🚀 הרשאות מאמן הופעלו! טוען מחדש...");
          
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (error) {
          console.error('[AdminCoachActivator] Error activating coach access:', error);
        }
      }
    };

    activateCoachAccess();
  }, [user]);

  return null;
}