import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, CheckCheck, Send, Plus, Edit2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const isCoach = user?.is_coach === true || user?.role === 'coach' || user?.role === 'admin';

  // Coach: fetch trainees for send dialog
  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-for-notif'],
    queryFn: async () => {
      const all = await base44.entities.User.list('-created_at', 500);
      return all.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    enabled: isCoach,
  });

  // Send notification dialog
  const [showSend, setShowSend] = useState(false);
  const [editingNotif, setEditingNotif] = useState(null);
  const [sendForm, setSendForm] = useState({ title: '', message: '', selectedTrainees: [] });
  const [sending, setSending] = useState(false);

  const openSendDialog = (notif = null) => {
    if (notif) {
      setEditingNotif(notif);
      setSendForm({ title: notif.title || '', message: notif.message || '', selectedTrainees: [notif.user_id] });
    } else {
      setEditingNotif(null);
      setSendForm({ title: '', message: '', selectedTrainees: [] });
    }
    setShowSend(true);
  };

  const handleSend = async () => {
    if (!sendForm.title.trim() || !sendForm.message.trim()) { toast.error('יש למלא כותרת והודעה'); return; }
    if (!editingNotif && sendForm.selectedTrainees.length === 0) { toast.error('יש לבחור לפחות מתאמן אחד'); return; }
    setSending(true);
    try {
      if (editingNotif) {
        await base44.entities.Notification.update(editingNotif.id, { title: sendForm.title, message: sendForm.message });
        toast.success('ההתראה עודכנה');
      } else {
        for (const tid of sendForm.selectedTrainees) {
          await base44.entities.Notification.create({
            user_id: tid,
            type: 'coach_message',
            title: sendForm.title,
            message: sendForm.message,
            is_read: false,
            data: { from_coach: user.id, coach_name: user.full_name },
          });
        }
        toast.success(`נשלחה התראה ל-${sendForm.selectedTrainees.length} מתאמנים`);
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setShowSend(false);
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteNotif = async (id) => {
    if (!window.confirm('למחוק התראה זו?')) return;
    try {
      await base44.entities.Notification.delete(id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('ההתראה נמחקה');
    } catch { toast.error('שגיאה במחיקה'); }
  };

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
            <div className="flex gap-2">
              {isCoach && (
                <Button onClick={() => openSendDialog()} size="sm"
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 text-white"
                  style={{ backgroundColor: '#FF6F20' }}>
                  <Send className="w-3 h-3" /> שלח התראה
                </Button>
              )}
              {unreadCount > 0 && (
                <Button onClick={() => markAllAsReadMutation.mutate()} disabled={markAllAsReadMutation.isPending}
                  variant="outline" size="sm"
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 text-[#FF6F20] border-[#FF6F20]/30 hover:bg-orange-50">
                  {markAllAsReadMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  סמן הכל כנקרא
                </Button>
              )}
            </div>
          </div>
          <div className="h-[1.5px] rounded-full" style={{ backgroundColor: '#FF6F20' }} />
        </div>

        {/* Notifications List */}
        <NotificationCenter userId={user.id} isCoach={isCoach} onEdit={isCoach ? openSendDialog : undefined} onDelete={isCoach ? handleDeleteNotif : undefined} />
      </div>

      {/* Send/Edit Notification Dialog */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">
              {editingNotif ? 'ערוך התראה' : 'שלח התראה למתאמנים'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2" dir="rtl">
            {/* Trainee selector — only for new */}
            {!editingNotif && (
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">בחר מתאמנים</label>
                <div style={{ maxHeight: '30vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <button onClick={() => setSendForm(f => ({ ...f, selectedTrainees: f.selectedTrainees.length === trainees.length ? [] : trainees.map(t => t.id) }))}
                    className="w-full text-xs font-bold text-[#FF6F20] mb-2 text-right">
                    {sendForm.selectedTrainees.length === trainees.length ? 'בטל הכל' : 'בחר הכל'}
                  </button>
                  {trainees.map(t => {
                    const sel = sendForm.selectedTrainees.includes(t.id);
                    return (
                      <div key={t.id} onClick={() => setSendForm(f => ({
                        ...f,
                        selectedTrainees: sel ? f.selectedTrainees.filter(id => id !== t.id) : [...f.selectedTrainees, t.id]
                      }))}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: sel ? '2px solid #FF6F20' : '1px solid #eee', background: sel ? '#FFF0E8' : 'white', marginBottom: 6, cursor: 'pointer' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.full_name}</span>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? '#FF6F20' : '#ddd'}`, background: sel ? '#FF6F20' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>
                          {sel ? '✓' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {sendForm.selectedTrainees.length > 0 && (
                  <div className="text-xs font-bold text-[#FF6F20] mt-1">נבחרו {sendForm.selectedTrainees.length} מתאמנים</div>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1">כותרת</label>
              <input value={sendForm.title} onChange={e => setSendForm(f => ({ ...f, title: e.target.value }))} placeholder="כותרת ההתראה"
                style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid', borderColor: sendForm.title ? '#FF6F20' : '#ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none' }} />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1">הודעה</label>
              <textarea value={sendForm.message} onChange={e => setSendForm(f => ({ ...f, message: e.target.value }))} placeholder="תוכן ההודעה..."
                rows={3} style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid', borderColor: sendForm.message ? '#FF6F20' : '#ddd', borderRadius: 10, boxSizing: 'border-box', direction: 'rtl', outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
            </div>

            <Button onClick={handleSend} disabled={sending} className="w-full rounded-xl py-3 font-bold text-white min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
              {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />שולח...</> : (editingNotif ? 'עדכן התראה' : `שלח ל-${sendForm.selectedTrainees.length} מתאמנים`)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
