import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFormPersistence } from "../hooks/useFormPersistence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function AddTraineeDialog({ open, onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [coach, setCoach] = useState(null);

  const defaultFormData = {
    fullName: "",
    phone: "",
    email: "",
    birthDate: "",
    joinDate: new Date().toISOString().split('T')[0],
    address: "",
    coachNotes: "",
    clientStatus: "לקוח פעיל"
  };

  const [formData, setFormData, clearDraft] = useFormPersistence("trainee_form_new", defaultFormData);

  useEffect(() => {
    // Load current coach for notifications
    base44.auth.me().then(setCoach).catch(console.error);
  }, []);

  // Calculate age automatically
  const calculateAge = (birthDate) => {
    if (!birthDate) return "";
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.fullName || !formData.email) {
      toast.error("נא למלא שם מלא ואימייל (שדות חובה)");
      return;
    }

    setLoading(true);

    try {
      // 1. Check if email exists
      const existingUsers = await base44.entities.User.list(); // Ideally should filter, but list() is safer if filter not 100%
      const emailExists = existingUsers.find(u => u.email?.toLowerCase() === formData.email.toLowerCase());
      
      if (emailExists) {
        toast.error("כתובת האימייל כבר קיימת במערכת");
        setLoading(false);
        return;
      }

      // 2. Prepare data
      const age = calculateAge(formData.birthDate);
      
      // 3. Create User
      // Note: Using base44.entities.User.create as per existing patterns in this codebase
      const newUser = await base44.entities.User.create({
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        birth_date: formData.birthDate ? new Date(formData.birthDate).toISOString() : null,
        age: age ? parseInt(age) : null,
        join_date: formData.joinDate,
        address: formData.address,
        coach_notes: formData.coachNotes,
        client_status: formData.clientStatus,
        role: 'trainee', // Automatically set
        account_deleted: false,
        onboarding_completed: true // Assume manual add bypasses onboarding
      });

      // 4. Create Notification
      if (coach) {
        await base44.entities.Notification.create({
          user_id: coach.id,
          type: 'new_trainee',
          title: 'מתאמן חדש נוסף',
          message: `המתאמן ${formData.fullName} נוסף למערכת בהצלחה.`,
          is_read: false
        });
      }

      // 5. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });

      toast.success("מתאמן חדש נוסף למערכת ✅");
      clearDraft(); // Clear draft on success

      // 6. Redirect
      navigate(createPageUrl(`TraineeProfile?userId=${newUser.id}`));
      onClose();

    } catch (error) {
      console.error("Error creating trainee:", error);
      toast.error("שגיאה ביצירת המתאמן. אנא נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !loading && onClose(isOpen)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-[#222]">
            יצירת מתאמן חדש
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block font-bold text-gray-700">שם מלא *</Label>
              <Input 
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                className="h-12 rounded-xl border-gray-200 focus:border-[#4CAF50] focus:ring-[#4CAF50]"
                placeholder="ישראל ישראלי"
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">אימייל *</Label>
              <Input 
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="h-12 rounded-xl border-gray-200 focus:border-[#4CAF50] focus:ring-[#4CAF50]"
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block font-bold text-gray-700">טלפון</Label>
              <Input 
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="h-12 rounded-xl border-gray-200"
                placeholder="050-0000000"
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">תאריך לידה</Label>
              <Input 
                type="date"
                value={formData.birthDate}
                onChange={(e) => handleChange('birthDate', e.target.value)}
                className="h-12 rounded-xl border-gray-200"
              />
              {formData.birthDate && (
                <span className="text-xs text-gray-500 mt-1 block">
                  גיל מחושב: {calculateAge(formData.birthDate)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block font-bold text-gray-700">תאריך הצטרפות</Label>
              <Input 
                type="date"
                value={formData.joinDate}
                onChange={(e) => handleChange('joinDate', e.target.value)}
                className="h-12 rounded-xl border-gray-200"
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">סטטוס לקוח</Label>
              <Select 
                value={formData.clientStatus} 
                onValueChange={(val) => handleChange('clientStatus', val)}
              >
                <SelectTrigger className="h-12 rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ליד חדש">ליד חדש</SelectItem>
                  <SelectItem value="לקוח פעיל">לקוח פעיל</SelectItem>
                  <SelectItem value="לקוח לא פעיל">לקוח לא פעיל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block font-bold text-gray-700">כתובת</Label>
            <Input 
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="h-12 rounded-xl border-gray-200"
              placeholder="רחוב, מספר, עיר"
            />
          </div>

          <div>
            <Label className="mb-2 block font-bold text-gray-700">הערות מאמן</Label>
            <Textarea 
              value={formData.coachNotes}
              onChange={(e) => handleChange('coachNotes', e.target.value)}
              className="min-h-[100px] rounded-xl border-gray-200 resize-none"
              placeholder="הערות פנימיות..."
            />
          </div>

          <div className="flex gap-4 mt-6">
            <Button 
              variant="outline" 
              onClick={() => {
                clearDraft();
                onClose();
              }}
              className="flex-1 h-12 rounded-xl border-gray-200"
              disabled={loading}
            >
              ביטול
            </Button>
            <Button 
              onClick={handleSubmit}
              className="flex-1 h-12 rounded-xl bg-[#4CAF50] hover:bg-[#43A047] text-white"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin ml-2" />
                  שומר...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 ml-2" />
                  שמור מתאמן
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}