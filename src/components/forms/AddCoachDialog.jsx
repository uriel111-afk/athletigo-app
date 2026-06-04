import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCoach } from "@/api/createCoach";

const INITIAL_DATA = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
};

export default function AddCoachDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(INITIAL_DATA);

  useKeepScreenAwake(open);

  useEffect(() => {
    if (!open) return;
    setFormData(INITIAL_DATA);
  }, [open]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isValid =
    !!formData.full_name.trim()
    && !!formData.email.trim()
    && formData.password.length >= 6;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);

    try {
      await createCoach({
        email: formData.email.trim(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
      });

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['all-trainees'] }),
        queryClient.refetchQueries({ queryKey: ['users-list'] }),
      ]);

      toast.success(`${formData.full_name.trim()} נוסף בהצלחה ✅`);
      setFormData(INITIAL_DATA);
      onClose();
    } catch (error) {
      let msg = error?.message || "נסה שוב";
      if (msg.includes("already") || msg.includes("duplicate")) {
        msg = "משתמש עם אימייל זה כבר קיים";
      }
      toast.error("שגיאה ביצירת המאמן: " + msg);
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
            הוספת מאמן חדש
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
              placeholder="coach@gmail.com"
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
              המאמן יוכל לשנות את הסיסמא בהמשך
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 4, textAlign: 'right' }}>
              טלפון
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="0501234567"
              style={{ ...inputStyle, direction: 'ltr' }}
            />
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
            {loading ? 'שומר...' : 'צור מאמן'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
