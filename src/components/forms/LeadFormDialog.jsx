import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Edit2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useFormPersistence } from "../hooks/useFormPersistence";

export default function LeadFormDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  editingLead = null,
  isLoading = false 
}) {
  const defaultFormState = {
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
    preferred_time: ""
  };

  const formKey = `lead_form_${editingLead ? editingLead.id : 'new'}`;
  
  const currentDefaults = editingLead ? {
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
    preferred_time: editingLead.preferred_time || ""
  } : defaultFormState;

  const [leadForm, setLeadForm, clearDraft, draftExists] = useFormPersistence(formKey, currentDefaults);

  const handleCancel = () => {
    clearDraft();
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

  const handleSubmit = async () => {
    if (!leadForm.full_name || !leadForm.phone) {
      toast.error("נא למלא שם מלא וטלפון");
      return;
    }

    // Filter to only include fields that exist in the leads table
    const submissionData = {
      full_name: leadForm.full_name,
      phone: leadForm.phone,
      email: leadForm.email || null,
      age: leadForm.age ? parseInt(leadForm.age) : null,
      city: leadForm.city || null,
      status: leadForm.status || "חדש",
      source: leadForm.source || "אחר",
      notes: leadForm.notes || null,
      coach_notes: leadForm.coach_notes || null,
      preferred_time: leadForm.preferred_time || null,
      birth_date: leadForm.birth_date || null,
      medical_history: leadForm.medical_history || null,
      parent_name: leadForm.parent_name || null,
      main_goal: leadForm.main_goal || leadForm.training_goals || null,
      training_goals: leadForm.training_goals || null,
      service_interest: leadForm.service_interest || null,
      specific_interest: leadForm.specific_interest || null,
      sport_background: leadForm.sport_background || null,
      fitness_level: leadForm.fitness_level || null
    };

    try {
      await onSubmit(submissionData);
      clearDraft(); // Clear draft on success submit
    } catch (error) {
      console.error("Submission failed", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        // Just closing (clicking outside), do not clear draft
        onClose();
      }
    }}>
      <DialogContent className="w-[95vw] md:w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl md:text-3xl font-black text-[#222]">
            {editingLead ? '✏️ ערוך ליד' : '➕ הוסף ליד חדש'}
          </DialogTitle>
          {draftExists && (
            <div className="text-sm text-gray-500 mt-1">
              טיוטה שמורה
            </div>
          )}
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* 1-4: Basic Info */}
          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
            <h3 className="font-bold text-orange-800 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              פרטי חובה
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
                <Label className="text-sm font-bold mb-2 block text-[#222]">2. טלפון *</Label>
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
                    <SelectItem value="בטיפול">🕒 בטיפול</SelectItem>
                    <SelectItem value="תיאום שיחה">📞 תיאום שיחה</SelectItem>
                    <SelectItem value="המתנה">✋ המתנה</SelectItem>
                    <SelectItem value="סגור – הפך ללקוח">✅ סגור – הפך ללקוח</SelectItem>
                    <SelectItem value="סגור – לא רלוונטי">❌ סגור – לא רלוונטי</SelectItem>
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
              disabled={isLoading}
              className="flex-1 rounded-xl py-6 font-bold text-white bg-[#FF6F20] hover:bg-[#e65b12]"
            >
              {isLoading ? (
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