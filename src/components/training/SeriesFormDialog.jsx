import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FolderPlus, Save } from "lucide-react";

export default function SeriesFormDialog({ isOpen, onClose, onSubmit, initialData, trainees, isLoading }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active",
    assigned_to: "",
    start_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        description: initialData.description || "",
        status: initialData.status || "active",
        assigned_to: initialData.assigned_to || "",
        start_date: initialData.start_date || new Date().toISOString().split('T')[0]
      });
    } else {
      setFormData({
        name: "",
        description: "",
        status: "active",
        assigned_to: "",
        start_date: new Date().toISOString().split('T')[0]
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Find trainee name if assigned
    let assigned_to_name = "";
    if (formData.assigned_to && trainees) {
        const t = trainees.find(u => u.id === formData.assigned_to);
        if (t) assigned_to_name = t.full_name;
    }
    
    onSubmit({
        ...formData,
        assigned_to_name
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-gray-900">
            <FolderPlus className="w-6 h-6 text-[#FF6F20]" />
            {initialData ? "עריכת סדרת אימונים" : "סדרת אימונים חדשה"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-right font-bold">שם הסדרה</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="למשל: תוכנית חיזוק בסיסית - שלב 1"
              required
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_to" className="text-right font-bold">שיוך למתאמן (אופציונלי)</Label>
            <Select 
                value={formData.assigned_to} 
                onValueChange={(val) => setFormData({...formData, assigned_to: val})}
                disabled={!!initialData?.assigned_to} // Disable changing assignee on edit typically
            >
              <SelectTrigger className="w-full text-right" dir="rtl">
                <SelectValue placeholder="בחר מתאמן" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="none">-- לא משויך (תבנית) --</SelectItem>
                {trainees && trainees.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-right font-bold">תיאור</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="תיאור קצר של הסדרה ומטרותיה..."
              className="text-right resize-none"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="status" className="text-right font-bold">סטטוס</Label>
                <Select 
                    value={formData.status} 
                    onValueChange={(val) => setFormData({...formData, status: val})}
                >
                <SelectTrigger className="w-full text-right" dir="rtl">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                    <SelectItem value="active">פעילה</SelectItem>
                    <SelectItem value="completed">הושלמה</SelectItem>
                    <SelectItem value="archived">ארכיון</SelectItem>
                </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="start_date" className="text-right font-bold">תאריך התחלה</Label>
                <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    className="text-right"
                />
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              ביטול
            </Button>
            <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full sm:w-auto bg-[#FF6F20] hover:bg-[#e65b12] text-white font-bold"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
              {initialData ? "שמור שינויים" : "צור סדרה"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}