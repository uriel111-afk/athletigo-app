import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { syncTraineeToLead } from "@/lib/lifeos/lifeos-api";

// Three-field coach intake. Everything else (phone, birth date, body
// metrics, goals, health declaration, etc.) is collected from the
// trainee themself in /onboarding once they log in. The trainee row
// is created with client_status='onboarding' + onboarding_completed=
// false, which AuthContext.jsx routes to /onboarding on first login.
const INITIAL_DATA = {
  full_name: "",
  email: "",
  password: "",
};

// Service track picker — Hebrew label shown in the UI, English key
// stored in users.onboarding_track. The keys match TRACK_STEPS in
// src/lib/onboardingTracks.js so Onboarding.jsx renders the matching
// step list on the trainee's first login.
const TRACK_OPTIONS = [
  { key: 'personal', label: 'אימון אישי' },
  { key: 'online',   label: 'ליווי אונליין' },
  { key: 'group',    label: 'אימון קבוצתי' },
  { key: 'workshop', label: 'סדנה' },
  { key: 'course',   label: 'קורס דיגיטלי' },
];

export default function AddTraineeDialog({ open, onClose, initialData = null }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [coach, setCoach] = useState(null);
  const [formData, setFormData] = useState(INITIAL_DATA);
  // Service track — required, stored on users.onboarding_track so
  // Onboarding.jsx can render the per-track step list. Never prefilled
  // from initialData; the coach picks it each time.
  const [track, setTrack] = useState(null);

  useKeepScreenAwake(open);

  useEffect(() => {
    base44.auth.me().then(setCoach).catch(console.error);
  }, []);

  // Reset / prefill when the dialog opens. Lead-conversion callers
  // pass { full_name, email } via initialData; the password stays
  // blank so the coach types one explicitly.
  useEffect(() => {
    if (!open) return;
    setFormData({
      full_name: initialData?.fullName || initialData?.full_name || "",
      email: initialData?.email || "",
      password: "",
    });
    setTrack(null);
  }, [open, initialData]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isValid =
    !!formData.full_name.trim()
    && !!formData.email.trim()
    && formData.password.length >= 6
    && !!track;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);

    try {
      // signUp switches the active session to the new trainee; save
      // the coach session beforehand so we can restore it after the
      // INSERT and not get bounced to the trainee's home.
      const { data: { session: coachSession } } = await supabase.auth.getSession();

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: { data: { full_name: formData.full_name.trim(), role: 'trainee' } },
      });

      if (coachSession) {
        await supabase.auth.setSession({
          access_token: coachSession.access_token,
          refresh_token: coachSession.refresh_token,
        });
      }

      if (signUpError) {
        let msg = signUpError.message;
        if (msg.includes("already registered") || msg.includes("duplicate")) {
          msg = "משתמש עם אימייל זה כבר קיים";
        } else if (msg.includes("password")) {
          msg = "הסיסמה חייבת להכיל לפחות 6 תווים";
        }
        toast.error("שגיאה ביצירת המתאמן: " + msg);
        return;
      }

      if (!authData?.user) {
        toast.error("שגיאה ביצירת המתאמן — לא התקבל משתמש");
        return;
      }

      // Upsert (not insert) so a handle_new_user trigger that may have
      // already seeded a minimal public.users row gets enriched
      // instead of colliding. client_status='onboarding' is the
      // English value AuthContext.jsx checks for the redirect to
      // /onboarding (the Hebrew label "אונבורדינג" is rendering-only
      // — see clientStatusHelpers.js).
      const upsertPayload = {
        id: authData.user.id,
        email: formData.email.trim(),
        full_name: formData.full_name.trim(),
        role: 'trainee',
        client_status: 'onboarding',
        coach_id: coach?.id || null,
        onboarding_completed: false,
        onboarding_track: track,
        created_at: new Date().toISOString(),
      };
      console.log('[AddTrainee] upserting users row:', upsertPayload);
      const { data: upserted, error: profileError } = await supabase
        .from('users')
        .upsert(upsertPayload, { onConflict: 'id' })
        .select()
        .maybeSingle();
      console.log('[AddTrainee] users upsert returned:', upserted);

      if (profileError) {
        toast.error("שגיאה בשמירת הפרופיל: " + profileError.message);
        return;
      }

      // Cross-app lead mirror (best-effort).
      if (coach?.id) {
        try {
          await syncTraineeToLead(coach.id, {
            full_name: formData.full_name.trim(),
            phone: null,
            email: formData.email.trim(),
          });
        } catch (e) {
          console.warn('[AddTrainee] syncTraineeToLead failed:', e?.message);
        }
      }

      // Minimal perms during onboarding — the trainee can message the
      // coach but every other surface stays gated until the coach
      // promotes them out of onboarding.
      if (coach?.id && authData.user?.id) {
        try {
          await supabase.from('trainee_permissions').upsert({
            coach_id: coach.id,
            trainee_id: authData.user.id,
            view_baseline: false,
            view_plan: false,
            view_progress: false,
            view_documents: false,
            edit_metrics: false,
            send_videos: false,
            send_messages: true,
            view_training_plan: false,
            view_records: false,
          }, { onConflict: 'coach_id,trainee_id' });
        } catch (e) {
          console.warn('[AddTrainee] trainee_permissions seed failed:', e?.message);
        }
      }

      // Notify the coach (best-effort).
      if (coach) {
        try {
          await base44.entities.Notification.create({
            user_id: coach.id,
            type: 'new_trainee',
            title: 'מתאמן חדש נוסף',
            message: `המתאמן ${formData.full_name.trim()} נוסף למערכת.`,
            is_read: false,
          });
        } catch {}
      }

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['all-trainees'] }),
        queryClient.refetchQueries({ queryKey: ['all-services-list'] }),
        queryClient.refetchQueries({ queryKey: ['all-sessions'] }),
        queryClient.refetchQueries({ queryKey: ['training-plans'] }),
        queryClient.refetchQueries({ queryKey: ['leads'] }),
        queryClient.refetchQueries({ queryKey: ['trainees'] }),
      ]);

      toast.success(`${formData.full_name.trim()} נוסף בהצלחה ✅`);
      setFormData(INITIAL_DATA);
      onClose();
    } catch (error) {
      console.error('[AddTrainee] failed:', error);
      toast.error("שגיאה: " + (error?.message || "נסה שוב"));
    } finally {
      setLoading(false);
    }
  };

  const ctaActive = isValid && !loading;
  const inputStyle = {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid #F0E4D0', borderRadius: 10,
    fontSize: 15, boxSizing: 'border-box',
    outline: 'none', background: 'white',
    fontFamily: 'inherit',
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !loading && onClose(isOpen)}>
      <DialogContent
        className="max-w-md p-0 gap-0 bg-white"
        style={{ borderRadius: 16, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }} dir="rtl">
          <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'right', color: '#1a1a1a' }}>
            הוספת מתאמן חדש
          </div>

          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 4, textAlign: 'right' }}>
              שם מלא *
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => handleChange('full_name', e.target.value)}
              placeholder="ישראל ישראלי"
              style={{ ...inputStyle, direction: 'rtl' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 4, textAlign: 'right' }}>
              אימייל *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="israel@gmail.com"
              autoComplete="off"
              style={{ ...inputStyle, direction: 'ltr' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 4, textAlign: 'right' }}>
              סיסמא זמנית *
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="לפחות 6 תווים"
              autoComplete="new-password"
              style={{ ...inputStyle, direction: 'ltr' }}
            />
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'right' }}>
              המתאמן יוכל לשנות את הסיסמא בהמשך
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6, textAlign: 'right' }}>
              סוג שירות *
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, direction: 'rtl' }}>
              {TRACK_OPTIONS.map((opt) => {
                const active = track === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTrack(opt.key)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      fontSize: 14,
                      fontWeight: active ? 700 : 500,
                      background: active ? '#FF6F20' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#888888',
                      border: active ? '1px solid #FF6F20' : '1px solid #E8E0D8',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!ctaActive}
            style={{
              width: '100%', padding: '14px',
              background: ctaActive ? '#FF6F20' : '#F3F4F6',
              border: 'none', borderRadius: 12,
              color: ctaActive ? 'white' : '#9CA3AF',
              fontWeight: 700, fontSize: 16,
              cursor: ctaActive ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {loading ? 'שומר...' : 'צור מתאמן'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
