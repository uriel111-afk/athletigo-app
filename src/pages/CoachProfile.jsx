import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Edit2, User, Mail, Phone, MapPin, Briefcase, Shield, CheckCircle, Lock, Settings, Bell, Send, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import { toast } from "sonner";

export default function CoachProfile() {
  const [user, setUser] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    bio: "",
    certifications: ""
  });

  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [notifForm, setNotifForm] = useState({
    title: "",
    message: "",
    recipient: "all",
    requires_acknowledgment: false,
  });

  const queryClient = useQueryClient();

  const { data: currentUser, refetch } = useQuery({
    queryKey: ['current-user-coach-profile'],
    queryFn: () => base44.auth.me(),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      setFormData({
        full_name: currentUser.full_name || "",
        email: currentUser.email || "",
        phone: currentUser.phone || "",
        address: currentUser.address || "",
        city: currentUser.city || "",
        bio: currentUser.bio || "",
        certifications: currentUser.certifications || ""
      });
    }
  }, [currentUser]);

  const updateUserMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-coach-profile'] });
      refetch();
      setShowEdit(false);
      toast.success("✅ הפרופיל עודכן בהצלחה");
    },
  });

  const enableCoachModeMutation = useMutation({
    mutationFn: () => base44.auth.updateMe({ isCoach: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-coach-profile'] });
      refetch();
      toast.success("✅ מצב מאמן הופעל! טוען מחדש...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: () => {
      toast.error("❌ שגיאה בהפעלת מצב מאמן");
    }
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coach-profile-trainees'],
    queryFn: async () => {
      const all = await base44.entities.User.list('-created_at', 1000);
      return all.filter(u => !u.account_deleted && u.role !== 'admin' && !u.isCoach);
    },
    enabled: !!user?.id,
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async ({ title, message, recipientIds, requires_acknowledgment }) => {
      for (const uid of recipientIds) {
        await base44.entities.Notification.create({
          user_id: uid,
          title,
          message,
          type: 'coach_message',
          is_read: false,
          requires_acknowledgment,
          acknowledged_at: null,
        });
      }
    },
    onSuccess: (_, vars) => {
      toast.success(`✅ התראה נשלחה ל-${vars.recipientIds.length} מתאמנים`);
      setNotifForm({ title: "", message: "", recipient: "all", requires_acknowledgment: false });
    },
    onError: () => toast.error("❌ שגיאה בשליחת התראה"),
  });

  const handleSendNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.message.trim()) {
      toast.error("נא למלא כותרת והודעה");
      return;
    }
    let recipientIds = [];
    if (notifForm.recipient === "all") {
      recipientIds = trainees.map(t => t.id);
    } else {
      recipientIds = [notifForm.recipient];
    }
    if (recipientIds.length === 0) {
      toast.error("אין מתאמנים לשליחה");
      return;
    }
    try {
      await sendNotificationMutation.mutateAsync({
        title: notifForm.title,
        message: notifForm.message,
        recipientIds,
        requires_acknowledgment: notifForm.requires_acknowledgment,
      });
    } catch {}
  };

  const toggleAllowTraineePlansMutation = useMutation({
    mutationFn: (value) => base44.auth.updateMe({ allow_trainee_plans: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-coach-profile'] });
      toast.success("✅ ההגדרה עודכנה");
    },
    onError: () => toast.error("❌ שגיאה בעדכון ההגדרה"),
  });

  const handleSave = async () => {
    await updateUserMutation.mutateAsync({
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      bio: formData.bio,
      certifications: formData.certifications
    });
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPass !== passwordForm.confirm) {
      toast.error("הסיסמאות החדשות לא תואמות");
      return;
    }
    if (passwordForm.newPass.length < 6) {
      toast.error("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
    setPasswordLoading(false);
    if (error) {
      toast.error("שגיאה בשינוי הסיסמה: " + error.message);
    } else {
      toast.success("✅ הסיסמה שונתה בהצלחה");
      setShowPasswordChange(false);
      setPasswordForm({ current: "", newPass: "", confirm: "" });
    }
  };

  const handleEnableCoachMode = async () => {
    if (confirm("האם להפעיל מצב מאמן? תקבל גישה לדשבורד ולכל התכונות של מאמן.")) {
      await enableCoachModeMutation.mutateAsync();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="athletigo-spinner mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto pb-24" dir="rtl" style={{ backgroundColor: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6 md:mb-10">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-2 md:mb-4" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif', letterSpacing: '-0.02em' }}>
              הפרופיל שלי
            </h1>
            <p className="text-lg md:text-2xl mb-2 md:mb-4 font-medium" style={{ color: '#7D7D7D' }}>
              פרטי המאמן וניהול חשבון
            </p>
            <div className="w-20 md:w-24 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
          </div>

          {/* Coach Mode Status */}
          <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl md:rounded-2xl" style={{ 
            backgroundColor: user.isCoach ? '#E8F5E9' : '#FFF8F3',
            border: `2px solid ${user.isCoach ? '#4CAF50' : '#FF6F20'}`
          }}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 md:w-8 md:h-8" style={{ color: user.isCoach ? '#4CAF50' : '#FF6F20' }} />
                <div>
                  <h3 className="text-base md:text-xl font-black" style={{ color: '#000000' }}>
                    {user.isCoach ? '✅ מצב מאמן פעיל' : '⚠️ מצב מאמן לא פעיל'}
                  </h3>
                  <p className="text-xs md:text-sm" style={{ color: '#7D7D7D' }}>
                    {user.isCoach 
                      ? 'יש לך גישה מלאה לכל התכונות של מאמן'
                      : 'הפעל מצב מאמן כדי לקבל גישה לדשבורד ולכל התכונות'
                    }
                  </p>
                </div>
              </div>
              {!user.isCoach && (
                <Button
                  onClick={handleEnableCoachMode}
                  disabled={enableCoachModeMutation.isPending}
                  className="rounded-xl px-4 md:px-6 py-2 md:py-3 font-bold text-white text-sm md:text-base w-full md:w-auto"
                  style={{ backgroundColor: '#FF6F20' }}
                >
                  {enableCoachModeMutation.isPending ? 'מפעיל...' : 'הפעל מצב מאמן'}
                </Button>
              )}
              {user.isCoach && (
                <CheckCircle className="w-6 h-6 md:w-8 md:h-8" style={{ color: '#4CAF50' }} />
              )}
            </div>
          </div>

          {/* Profile Photo */}
          <div className="mb-6 md:mb-10 text-center">
            <div
              className="w-24 h-24 md:w-32 md:h-32 mx-auto rounded-full flex items-center justify-center font-bold text-4xl md:text-5xl mb-3 md:mb-4"
              style={{ 
                backgroundColor: '#FFF8F3', 
                color: '#FF6F20',
                boxShadow: '0 4px 12px rgba(255, 111, 32, 0.15)'
              }}
            >
              {user.full_name?.[0] || 'M'}
            </div>
            
            <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
              {user.full_name}
            </h2>
            
            <p className="athletigo-badge athletigo-badge-primary inline-flex text-xs md:text-sm">
              מאמן AthletiGo
            </p>
          </div>

          {/* Personal Info */}
          <div className="mb-6 md:mb-8 athletigo-section">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-0 mb-4 md:mb-6">
              <h2 className="text-2xl md:text-3xl font-black mb-0" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                מידע אישי
              </h2>
              <Button
                onClick={() => setShowEdit(true)}
                className="athletigo-button-primary rounded-xl px-4 py-2 font-bold w-full md:w-auto text-sm md:text-base"
              >
                <Edit2 className="w-3 h-3 md:w-4 md:h-4 ml-2" />
                ערוך פרטים
              </Button>
            </div>

            <div className="athletigo-card">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div className="flex-1 min-w-0">
                    <p className="athletigo-stat-label mb-1 text-xs">אימייל</p>
                    <p className="font-medium text-sm md:text-base break-all" style={{ color: '#000000' }}>{user.email || '-'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div>
                    <p className="athletigo-stat-label mb-1 text-xs">טלפון</p>
                    <p className="font-medium text-sm md:text-base" style={{ color: '#000000' }}>{user.phone || '-'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div>
                    <p className="athletigo-stat-label mb-1 text-xs">כתובת</p>
                    <p className="font-medium text-sm md:text-base" style={{ color: '#000000' }}>{user.address || '-'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div>
                    <p className="athletigo-stat-label mb-1 text-xs">עיר</p>
                    <p className="font-medium text-sm md:text-base" style={{ color: '#000000' }}>{user.city || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div className="mb-6 md:mb-8 athletigo-section">
              <h2 className="text-2xl md:text-3xl font-black mb-4 md:mb-6" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                אודותיי
              </h2>
              <div className="athletigo-card">
                <p className="leading-relaxed text-sm md:text-base" style={{ color: '#000000' }}>{user.bio}</p>
              </div>
            </div>
          )}

          {/* Certifications */}
          {user.certifications && (
            <div className="mb-6 md:mb-8 athletigo-section">
              <h2 className="text-2xl md:text-3xl font-black mb-4 md:mb-6" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                הסמכות ותעודות
              </h2>
              <div className="athletigo-card">
                <div className="flex items-start gap-3">
                  <Briefcase className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <p className="leading-relaxed text-sm md:text-base" style={{ color: '#000000' }}>{user.certifications}</p>
                </div>
              </div>
            </div>
          )}

          {/* Trainee Settings */}
          <div className="mb-6 md:mb-8 athletigo-section">
            <div className="flex items-center gap-3 mb-4 md:mb-6">
              <Settings className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#FF6F20' }} />
              <h2 className="text-2xl md:text-3xl font-black mb-0" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                הגדרות מתאמנים
              </h2>
            </div>
            <div className="athletigo-card">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="font-bold text-sm md:text-base" style={{ color: '#000000' }}>
                    אפשר למתאמנים ליצור תוכניות בעצמם
                  </p>
                  <p className="text-xs md:text-sm mt-1" style={{ color: '#7D7D7D' }}>
                    כאשר מופעל, מתאמנים יראו כפתור "תוכנית חדשה" בדף התוכניות שלהם
                  </p>
                </div>
                <Switch
                  checked={!!user?.allow_trainee_plans}
                  onCheckedChange={(checked) => toggleAllowTraineePlansMutation.mutate(checked)}
                  disabled={toggleAllowTraineePlansMutation.isPending}
                />
              </div>
            </div>
          </div>

          {/* Send Notification */}
          <div className="mb-6 md:mb-8 athletigo-section">
            <div className="flex items-center gap-3 mb-4 md:mb-6">
              <Bell className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#FF6F20' }} />
              <h2 className="text-2xl md:text-3xl font-black mb-0" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                שלח התראה למתאמנים
              </h2>
            </div>
            <div className="athletigo-card space-y-4">
              <div>
                <Label className="text-sm font-bold mb-1 block" style={{ color: '#000000' }}>כותרת</Label>
                <Input
                  value={notifForm.title}
                  onChange={(e) => setNotifForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="כותרת ההתראה"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-1 block" style={{ color: '#000000' }}>הודעה</Label>
                <Textarea
                  value={notifForm.message}
                  onChange={(e) => setNotifForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="תוכן ההתראה..."
                  className="rounded-xl min-h-[80px]"
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-1 block" style={{ color: '#000000' }}>נמען</Label>
                <Select
                  value={notifForm.recipient}
                  onValueChange={(v) => setNotifForm(f => ({ ...f, recipient: v }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="בחר נמען" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל המתאמנים ({trainees.length})</SelectItem>
                    {trainees.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: '#FFF8F3' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#000000' }}>דרוש אישור קריאה</p>
                  <p className="text-xs" style={{ color: '#7D7D7D' }}>המתאמן יצטרך ללחוץ "קראתי ומאשר"</p>
                </div>
                <Switch
                  checked={notifForm.requires_acknowledgment}
                  onCheckedChange={(v) => setNotifForm(f => ({ ...f, requires_acknowledgment: v }))}
                />
              </div>
              <Button
                onClick={handleSendNotification}
                disabled={sendNotificationMutation.isPending}
                className="w-full rounded-xl py-4 font-bold text-white"
                style={{ backgroundColor: '#FF6F20' }}
              >
                {sendNotificationMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שולח...</>
                ) : (
                  <><Send className="w-4 h-4 ml-2" />שלח התראה</>
                )}
              </Button>
            </div>
          </div>

          {/* Password Change Section */}
          <div className="mb-6 md:mb-8 athletigo-section">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-0 mb-4 md:mb-6">
              <h2 className="text-2xl md:text-3xl font-black mb-0" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                אבטחת חשבון
              </h2>
              <Button
                onClick={() => setShowPasswordChange(true)}
                className="rounded-xl px-4 py-2 font-bold w-full md:w-auto text-sm md:text-base"
                style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
              >
                <Lock className="w-3 h-3 md:w-4 md:h-4 ml-2" />
                שנה סיסמה
              </Button>
            </div>
          </div>

          {/* Edit Dialog */}
          <Dialog open={showEdit} onOpenChange={setShowEdit}>
            <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
              <DialogHeader>
                <DialogTitle className="text-xl md:text-3xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                  ערוך פרופיל
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 md:space-y-6">
                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>טלפון</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="050-1234567"
                    className="rounded-xl text-sm md:text-base"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>כתובת</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="רחוב ומספר"
                      className="rounded-xl text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>עיר</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="שם העיר"
                      className="rounded-xl text-sm md:text-base"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>אודותיי</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="ספר קצת על עצמך..."
                    className="rounded-xl min-h-[80px] md:min-h-[100px] text-sm md:text-base"
                  />
                </div>

                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>הסמכות ותעודות</Label>
                  <Textarea
                    value={formData.certifications}
                    onChange={(e) => setFormData({ ...formData, certifications: e.target.value })}
                    placeholder="הסמכות מקצועיות..."
                    className="rounded-xl min-h-[80px] md:min-h-[100px] text-sm md:text-base"
                  />
                </div>

                <Button
                  onClick={handleSave}
                  className="athletigo-button-primary w-full py-4 md:py-6 font-bold text-white text-base md:text-lg"
                >
                  שמור שינויים
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Password Change Dialog */}
          <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
            <DialogContent className="w-[95vw] md:w-full max-w-md" style={{ backgroundColor: '#FFFFFF' }}>
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                  שינוי סיסמה
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 md:space-y-5">
                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 block" style={{ color: '#000000' }}>סיסמה חדשה</Label>
                  <Input
                    type="password"
                    placeholder="לפחות 6 תווים"
                    value={passwordForm.newPass}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                    className="rounded-xl"
                    style={{ direction: "ltr" }}
                  />
                </div>
                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 block" style={{ color: '#000000' }}>אישור סיסמה חדשה</Label>
                  <Input
                    type="password"
                    placeholder="הכנס שוב את הסיסמה"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    className="rounded-xl"
                    style={{ direction: "ltr" }}
                  />
                </div>
                <Button
                  onClick={handlePasswordChange}
                  disabled={passwordLoading}
                  className="w-full py-3 font-bold text-white rounded-xl"
                  style={{ backgroundColor: '#FF6F20' }}
                >
                  {passwordLoading ? "שומר..." : "שמור סיסמה"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
  );
}