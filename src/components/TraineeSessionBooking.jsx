import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, User, Plus, Loader2, Laptop } from "lucide-react";
import { toast } from "sonner";

export default function TraineeSessionBooking({ open, onClose, user, coach }) {
  const [formData, setFormData] = useState({
    date: "",
    time: "",
    session_type: "אישי",
    location: "",
    trainee_notes: ""
  });
  const [step, setStep] = useState(1);

  const queryClient = useQueryClient();

  const createSessionMutation = useMutation({
    mutationFn: async (sessionData) => {
      const newSession = await base44.entities.Session.create(sessionData);
      
      // Create notification for coach about session request
      if (coach?.id && user) {
        await base44.entities.Notification.create({
          user_id: coach.id,
          type: "session_request",
          title: `בקשת פגישה מ-${user.full_name}`,
          message: `${sessionData.session_type} ב-${sessionData.date} בשעה ${sessionData.time}`,
          is_read: false
        });
      }
      
      return newSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      toast.success("הבקשה נשלחה למאמן");
      handleClose(); // Reusing the existing handleClose function which resets form and calls onClose
    },
    onError: (error) => {
      console.error("[TraineeSessionBooking] Error:", error);
      toast.error("שגיאה ביצירת הבקשה");
    }
  });

  const handleClose = () => {
    setFormData({
      date: "",
      time: "",
      session_type: "אישי",
      location: "",
      trainee_notes: ""
    });
    setStep(1);
    onClose();
  };

  const handleNext = () => {
    if (step === 1) {
      if (!formData.date || !formData.time) {
        toast.error("יש למלא תאריך ושעה");
        return;
      }
    }
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!formData.date || !formData.time || !user?.id) {
      toast.error("יש למלא את כל השדות החובה");
      return;
    }

    const sessionData = {
      date: formData.date,
      time: formData.time,
      session_type: formData.session_type,
      location: formData.location || "לא צוין",
      coach_id: coach?.id || "",
      status: "ממתין לאישור",
      participants: [
        {
          trainee_id: user.id,
          trainee_name: user.full_name || "מתאמן",
          attendance_status: "ממתין"
        }
      ],
      coach_notes: `בקשת מפגש מ${user.full_name || 'מתאמן'}${formData.trainee_notes ? `\nהערות המתאמן: ${formData.trainee_notes}` : ''}`
    };

    try {
      await createSessionMutation.mutateAsync(sessionData);
    } catch (error) {
      console.error("[TraineeBooking] Error:", error);
      toast.error("שגיאה ביצירת המפגש: " + (error?.message || "נסה שוב"));
    }
  };

  const SESSION_TYPES = [
    { value: 'אישי', label: 'אישי', icon: '🧍‍♂️', description: 'אימון 1 על 1 עם המאמן' },
    { value: 'אונליין', label: 'אונליין', icon: '💻', description: 'אימון מרחוק בוואטסאפ וידאו\\זום' }
  ];

  // בדיקה שיש לנו user
  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" style={{ backgroundColor: '#FFFFFF' }}>
        <DialogHeader>
          <DialogTitle className="text-3xl font-black text-center" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            קביעת מפגש חדש
          </DialogTitle>
          <p className="text-center text-sm" style={{ color: '#7D7D7D' }}>
            קבע/י מפגש אימון עם המאמן שלך
          </p>
        </DialogHeader>

        <div className="mt-4">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
              step >= 1 ? 'text-white' : 'text-gray-400'
            }`} style={{ backgroundColor: step >= 1 ? '#FF6F20' : '#E0E0E0' }}>
              1
            </div>
            <div className="w-12 h-1" style={{ backgroundColor: step >= 2 ? '#FF6F20' : '#E0E0E0' }} />
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
              step >= 2 ? 'text-white' : 'text-gray-400'
            }`} style={{ backgroundColor: step >= 2 ? '#FF6F20' : '#E0E0E0' }}>
              2
            </div>
            <div className="w-12 h-1" style={{ backgroundColor: step >= 3 ? '#FF6F20' : '#E0E0E0' }} />
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
              step >= 3 ? 'text-white' : 'text-gray-400'
            }`} style={{ backgroundColor: step >= 3 ? '#FF6F20' : '#E0E0E0' }}>
              3
            </div>
          </div>

          {/* Step 1 - Date & Time */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">📅</div>
                <h3 className="text-xl font-bold mb-2" style={{ color: '#000000' }}>
                  מתי מתאים לך?
                </h3>
                <p className="text-sm" style={{ color: '#7D7D7D' }}>
                  בחר/י תאריך ושעה למפגש
                </p>
              </div>

              <div>
                <Label className="text-base font-bold mb-3 block flex items-center gap-2" style={{ color: '#000000' }}>
                  <Calendar className="w-5 h-5" style={{ color: '#FF6F20' }} />
                  תאריך המפגש
                </Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="rounded-xl text-lg"
                  style={{ border: '2px solid #E0E0E0' }}
                />
              </div>

              <div>
                <Label className="text-base font-bold mb-3 block flex items-center gap-2" style={{ color: '#000000' }}>
                  <Clock className="w-5 h-5" style={{ color: '#FF6F20' }} />
                  שעת המפגש
                </Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="rounded-xl text-lg"
                  style={{ border: '2px solid #E0E0E0' }}
                />
              </div>

              <Button
                onClick={handleNext}
                className="w-full rounded-xl py-6 font-bold text-white text-lg"
                style={{ backgroundColor: '#FF6F20' }}
                disabled={!formData.date || !formData.time}
              >
                המשך →
              </Button>
            </div>
          )}

          {/* Step 2 - Type & Location */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">🏋️</div>
                <h3 className="text-xl font-bold mb-2" style={{ color: '#000000' }}>
                  פרטי המפגש
                </h3>
                <p className="text-sm" style={{ color: '#7D7D7D' }}>
                  בחר/י סוג ומיקום
                </p>
              </div>

              <div>
                <Label className="text-base font-bold mb-3 block flex items-center gap-2" style={{ color: '#000000' }}>
                  <User className="w-5 h-5" style={{ color: '#FF6F20' }} />
                  סוג המפגש
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  {SESSION_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setFormData({ ...formData, session_type: type.value })}
                      className="p-6 rounded-xl font-bold transition-all text-right"
                      style={{
                        backgroundColor: formData.session_type === type.value ? '#FFF8F3' : '#FAFAFA',
                        border: formData.session_type === type.value ? '2px solid #FF6F20' : '1px solid #E0E0E0',
                        color: formData.session_type === type.value ? '#FF6F20' : '#000000'
                      }}
                    >
                      <div className="text-4xl mb-3">{type.icon}</div>
                      <div className="font-bold text-lg mb-1">{type.label}</div>
                      <div className="text-xs opacity-70">{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-bold mb-3 block flex items-center gap-2" style={{ color: '#000000' }}>
                  <MapPin className="w-5 h-5" style={{ color: '#FF6F20' }} />
                  מיקום המפגש
                </Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder={formData.session_type === 'אונליין' ? 'לינק לוואטסאפ וידאו / זום' : 'כתובת המועדון / מיקום'}
                  className="rounded-xl"
                  style={{ border: '2px solid #E0E0E0' }}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setStep(1)}
                  variant="outline"
                  className="flex-1 rounded-xl py-6 font-bold"
                  style={{ border: '2px solid #E0E0E0' }}
                >
                  ← חזור
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1 rounded-xl py-6 font-bold text-white"
                  style={{ backgroundColor: '#FF6F20' }}
                >
                  המשך →
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 - Notes & Confirm */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">✅</div>
                <h3 className="text-xl font-bold mb-2" style={{ color: '#000000' }}>
                  סיכום ואישור
                </h3>
                <p className="text-sm" style={{ color: '#7D7D7D' }}>
                  בדוק/י את הפרטים ושלח/י למאמן
                </p>
              </div>

              {/* Summary */}
              <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5" style={{ color: '#FF6F20' }} />
                    <div>
                      <p className="text-xs" style={{ color: '#7D7D7D' }}>תאריך</p>
                      <p className="font-bold" style={{ color: '#000000' }}>
                        {new Date(formData.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5" style={{ color: '#FF6F20' }} />
                    <div>
                      <p className="text-xs" style={{ color: '#7D7D7D' }}>שעה</p>
                      <p className="font-bold" style={{ color: '#000000' }}>{formData.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {formData.session_type === 'אונליין' ? (
                      <Laptop className="w-5 h-5" style={{ color: '#FF6F20' }} />
                    ) : (
                      <User className="w-5 h-5" style={{ color: '#FF6F20' }} />
                    )}
                    <div>
                      <p className="text-xs" style={{ color: '#7D7D7D' }}>סוג</p>
                      <p className="font-bold" style={{ color: '#000000' }}>{formData.session_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5" style={{ color: '#FF6F20' }} />
                    <div>
                      <p className="text-xs" style={{ color: '#7D7D7D' }}>מיקום</p>
                      <p className="font-bold" style={{ color: '#000000' }}>{formData.location || 'לא צוין'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>
                  הערות נוספות (אופציונלי)
                </Label>
                <Textarea
                  value={formData.trainee_notes}
                  onChange={(e) => setFormData({ ...formData, trainee_notes: e.target.value })}
                  placeholder="הערות למאמן לגבי המפגש..."
                  className="rounded-xl min-h-[100px]"
                  style={{ border: '2px solid #E0E0E0' }}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="flex-1 rounded-xl py-6 font-bold"
                  style={{ border: '2px solid #E0E0E0' }}
                >
                  ← חזור
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createSessionMutation.isPending}
                  className="flex-1 rounded-xl py-6 font-bold text-white flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#FF6F20' }}
                >
                  {createSessionMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      שולח...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      שלח בקשה למאמן
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}