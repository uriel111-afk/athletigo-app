import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Edit2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { DraftBanner } from "@/components/DraftBanner";

const INITIAL_DATA = {
  full_name: "",
  phone: "",
  age: "",
  city: "",
  service_interest: "",
  specific_interest: "",
  sport_background: "",
  fitness_level: "",
  training_goals: "",
  medical_history: "",
  email: "",
  birth_date: "",
  notes: "",
  coach_notes: "",
  source: "אחר",
  status: "חדש",
  preferred_time: "",
};

export default function LeadFormDialog({
  isOpen,
  onClose,
  onSubmit,
  editingLead = null,
  isLoading = false
}) {
  const initialData = editingLead ? {
    full_name: editingLead.full_name || "",
    phone: editingLead.phone || "",
    age: editingLead.age || "",
    city: editingLead.city || editingLead.location_area || "",
    service_interest: editingLead.service_interest || editingLead.preferred_activity_type || "",
    specific_interest: editingLead.specific_interest || "",
    sport_background: editingLead.sport_background || "",
    fitness_level: editingLead.fitness_level || "",
    training_goals: editingLead.training_goals || editingLead.main_goal || "",
    medical_history: editingLead.medical_history || "",
    email: editingLead.email || "",
    birth_date: editingLead.birth_date || "",
    notes: editingLead.notes || editingLead.additional_details || "",
    coach_notes: editingLead.coach_notes || "",
    source: editingLead.source || "אחר",
    status: editingLead.status || "חדש",
    preferred_time: editingLead.preferred_time || "",
  } : INITIAL_DATA;

  const {
    data: leadForm, setData: setLeadForm,
    hasDraft, keepDraft, discardDraft, clearDraft,
  } = useFormDraft('AddLead', editingLead?.id ?? 'new', isOpen, initialData);

  useKeepScreenAwake(isOpen);

  const handleCancel = () => {
    // keep draft — user may come back
    onClose();
  };

  // Auto-calculate age
  const handleDateChange = (date) => {
    const newForm = { ...leadForm, birth_date: date };
    if (date) {
      const today = new Date();
      const birthDate = new Date(date);
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      newForm.age = age.toString();
    }
    setLeadForm(newForm);
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    // ONE required field: full_name. Everything else is optional —
    // a coach can dump a screenshot contact in one tap and fill the
    // rest later.
    const fullName = (leadForm.full_name || "").trim();
    if (!fullName) {
      toast.error("נא למלא שם מלא");
      return;
    }

    // Whitelist of columns the leads table accepts. We send each
    // populated field as its own column. Anything the live schema
    // happens not to have is automatically stripped + retried by
    // base44Client's 42703 retry layer (commit cf9b3a8) — so this
    // payload is safe even if a column is missing on this install.
    //
    // Owner / name dual-write: different installs have either
    // (coach_id + full_name) or (user_id + name) on `leads`. We
    // send BOTH pairs and let the retry layer drop the one that
    // doesn't exist — without sending both, dropping coach_id
    // alone would leave the row owner-less and trip RLS.
    const submissionData = {
      full_name: fullName,
      name:      fullName,
    };

    // Always send status + source (defaults guarantee a value).
    submissionData.status = leadForm.status || "חדש";
    submissionData.source = leadForm.source || "אחר";

    // Optional fields — included only when populated, so empty
    // strings don't overwrite existing data on update or violate
    // any NOT NULL guards on a stricter schema.
    if (leadForm.phone)             submissionData.phone             = leadForm.phone.trim();
    if (leadForm.email)             submissionData.email             = leadForm.email.trim();
    if (leadForm.age)               submissionData.age               = parseInt(leadForm.age, 10);
    if (leadForm.city)              submissionData.city              = leadForm.city;
    if (leadForm.notes)             submissionData.notes             = leadForm.notes;
    if (leadForm.coach_notes)       submissionData.coach_notes       = leadForm.coach_notes;
    if (leadForm.preferred_time)    submissionData.preferred_time    = leadForm.preferred_time;
    if (leadForm.birth_date)        submissionData.birth_date        = leadForm.birth_date;
    if (leadForm.medical_history)   submissionData.medical_history   = leadForm.medical_history;
    if (leadForm.parent_name)       submissionData.parent_name       = leadForm.parent_name;
    if (leadForm.main_goal)         submissionData.main_goal         = leadForm.main_goal;
    if (leadForm.service_interest)  submissionData.service_interest  = leadForm.service_interest;
    if (leadForm.specific_interest) submissionData.specific_interest = leadForm.specific_interest;
    if (leadForm.sport_background)  submissionData.sport_background  = leadForm.sport_background;
    if (leadForm.fitness_level)     submissionData.fitness_level     = leadForm.fitness_level;
    if (leadForm.training_goals)    submissionData.training_goals    = leadForm.training_goals;

    setSaving(true);
    console.log("[LeadForm] Submitting:", submissionData);

    try {
      await onSubmit(submissionData);
      console.log("[LeadForm] Success — closing form");
      clearDraft();
      // Ensure close even if parent onSuccess didn't fire yet
      onClose();
    } catch (error) {
      console.error("[LeadForm] Error:", error);
      const raw = error?.message || error?.body?.message || "";
      let msg = "שגיאה לא צפויה, נסה שוב";
      if (raw.includes("duplicate")) msg = "ליד עם פרטים זהים כבר קיים";
      else if (raw.includes("network") || raw.includes("fetch") || raw.includes("Failed to fetch")) msg = "בעיית תקשורת — בדוק חיבור לאינטרנט";
      else if (raw.includes("row-level security") || raw.includes("RLS") || raw.includes("policy")) msg = "אין הרשאה לשמור — בדוק הגדרות גישה";
      else if (raw.includes("violates")) msg = "שדה חובה חסר או ערך לא תקין";
      else if (/column .* does not exist/i.test(raw)) msg = "עמודה חסרה בטבלה — דווח לתמיכה";
      else if (raw) msg = raw;
      toast.error("שגיאה בשמירת הליד: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !saving) {
        onClose();
      }
    }}>
      {/* Prevent outside interaction from closing the dialog —
          Radix Select renders its options in a separate portal
          which counts as "outside", so a coach tapping a dropdown
          option would inadvertently close the form mid-fill.
          onInteractOutside is the umbrella event (covers pointer
          + focus); the previous version doubled it with
          onPointerDownOutside, which interfered with the Select
          trigger receiving its own pointer events on some setups
          (the dropdown wouldn't open). Single handler is enough. */}
      <DialogContent className="max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl md:text-3xl font-black text-[#222]">
            {editingLead ? '✏️ ערוך ליד' : '➕ הוסף ליד חדש'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {hasDraft && (
            <DraftBanner onContinue={keepDraft} onDiscard={discardDraft} />
          )}
          {/* 1-4: Basic Info */}
          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
            <h3 className="font-bold text-orange-800 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              פרטים בסיסיים
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm font-bold mb-2 block text-[#222]">1. שם מלא *</Label>
                <Input
                  value={leadForm.full_name}
                  onChange={(e) => setLeadForm({ ...leadForm, full_name: e.target.value })}
                  placeholder="הקלד את שמך המלא"
                  className="bg-white rounded-xl border-gray-200 focus:border-[#FF6F20]"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">2. טלפון</Label>
                <Input
                  value={leadForm.phone}
                  onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                  placeholder="הקלד מספר טלפון"
                  className="bg-white rounded-xl border-gray-200 focus:border-[#FF6F20]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">3. גיל</Label>
                <Input
                  type="number"
                  value={leadForm.age}
                  onChange={(e) => setLeadForm({ ...leadForm, age: e.target.value })}
                  placeholder="הקלד גיל"
                  className="bg-white rounded-xl border-gray-200"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">4. עיר מגורים</Label>
                <Input
                  value={leadForm.city}
                  onChange={(e) => setLeadForm({ ...leadForm, city: e.target.value })}
                  placeholder="הקלד עיר מגורים"
                  className="bg-white rounded-xl border-gray-200"
                />
              </div>
            </div>
          </div>

          {/* 5-10: Professional Info */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 text-lg">פרטים מקצועיים</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">5. התעניינות בשירות</Label>
                <Input
                  value={leadForm.service_interest}
                  onChange={(e) => setLeadForm({ ...leadForm, service_interest: e.target.value })}
                  placeholder="למשל: אימון אישי"
                  className="rounded-xl border-gray-200"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">6. יש משהו ספציפי שמעניין אותך?</Label>
                <Input
                  value={leadForm.specific_interest}
                  onChange={(e) => setLeadForm({ ...leadForm, specific_interest: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
              </div>
            </div>

            <div className="mb-4">
              <Label className="text-sm font-medium mb-2 block text-gray-600">7. מה הרקע הספורטיבי?</Label>
              <Textarea
                value={leadForm.sport_background}
                onChange={(e) => setLeadForm({ ...leadForm, sport_background: e.target.value })}
                className="rounded-xl border-gray-200 resize-none h-20"
              />
            </div>

            <div className="mb-4">
              <Label className="text-sm font-medium mb-2 block text-gray-600">8. מה רמת הכושר הנוכחי?</Label>
              <Select value={leadForm.fitness_level} onValueChange={(value) => setLeadForm({ ...leadForm, fitness_level: value })}>
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue placeholder="בחר..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="מתחיל">🌱 מתחיל</SelectItem>
                  <SelectItem value="בינוני">🌿 בינוני</SelectItem>
                  <SelectItem value="מתקדם">🌳 מתקדם</SelectItem>
                  <SelectItem value="מקצועי">🏆 מקצועי</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mb-4">
              <Label className="text-sm font-medium mb-2 block text-gray-600">9. מה מטרת האימון?</Label>
              <Textarea
                value={leadForm.training_goals}
                onChange={(e) => setLeadForm({ ...leadForm, training_goals: e.target.value })}
                placeholder="תאר את המטרות שלך בהכשרה"
                className="rounded-xl border-gray-200 resize-none h-20"
              />
            </div>

            <div className="mb-4">
              <Label className="text-sm font-medium mb-2 block text-gray-600">10. יש פציעות או מגבלות?</Label>
              <Textarea
                value={leadForm.medical_history}
                onChange={(e) => setLeadForm({ ...leadForm, medical_history: e.target.value })}
                placeholder="הוסף פרטים אודות ניסיון ספורט קודם"
                className="rounded-xl border-gray-200 resize-none h-20"
              />
            </div>
          </div>

          {/* 11-12: Contact Info */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 text-lg">פרטים נוספים</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">11. אימייל</Label>
                <Input
                  type="email"
                  value={leadForm.email}
                  onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                  placeholder="הקלד כתובת אימייל"
                  className="rounded-xl border-gray-200"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">12. תאריך לידה</Label>
                <Input
                  type="date"
                  value={leadForm.birth_date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="rounded-xl border-gray-200"
                />
              </div>
            </div>
          </div>

          {/* 13-14: Notes */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">13. הערות (כללי)</Label>
                <Textarea
                  value={leadForm.notes}
                  onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
                  placeholder="הערות נוספות..."
                  className="rounded-xl border-gray-200 resize-none h-24"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">14. הערות למאמן (פנימי בלבד)</Label>
                <Textarea
                  value={leadForm.coach_notes}
                  onChange={(e) => setLeadForm({ ...leadForm, coach_notes: e.target.value })}
                  placeholder="לא מוצג למתאמן..."
                  className="rounded-xl border-gray-200 resize-none h-24 bg-yellow-50"
                />
              </div>
            </div>
          </div>

          {/* 15-17: Admin Info */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 text-lg">ניהול</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">15. מקור הגעה</Label>
                <Select value={leadForm.source} onValueChange={(value) => setLeadForm({ ...leadForm, source: value })}>
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="טלפוני">📞 טלפוני</SelectItem>
                    <SelectItem value="אינסטגרם">📸 אינסטגרם</SelectItem>
                    <SelectItem value="אתר">🌐 אתר</SelectItem>
                    <SelectItem value="המלצה">🤝 המלצה</SelectItem>
                    <SelectItem value="אחר">✨ אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block text-gray-600">16. סטטוס ליד</Label>
                <Select value={leadForm.status} onValueChange={(value) => setLeadForm({ ...leadForm, status: value })}>
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="חדש">⭐ חדש</SelectItem>
                    <SelectItem value="בקשר">🕒 בקשר</SelectItem>
                    <SelectItem value="סגור עסקה">✅ סגור עסקה</SelectItem>
                    <SelectItem value="לא מעוניין">❌ לא מעוניין</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="mb-4">
               <Label className="text-sm font-medium mb-2 block text-gray-600">17. שעת אימון מועדפת</Label>
               <Input
                  value={leadForm.preferred_time}
                  onChange={(e) => setLeadForm({ ...leadForm, preferred_time: e.target.value })}
                  placeholder="למשל: בוקר מוקדם, ערב..."
                  className="rounded-xl border-gray-200"
                />
            </div>
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-gray-100">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 rounded-xl py-6 font-bold border-gray-200 text-gray-700"
            >
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || saving}
              className="flex-1 rounded-xl py-6 font-bold text-white bg-[#FF6F20] hover:bg-[#e65b12]"
            >
              {(isLoading || saving) ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  {editingLead ? <Edit2 className="w-5 h-5 ml-2" /> : <UserPlus className="w-5 h-5 ml-2" />}
                  {editingLead ? 'עדכן ליד' : 'צור ליד חדש'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}