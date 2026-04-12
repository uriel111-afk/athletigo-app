import React, { useState, useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/components/utils/queryKeys";

export default function PackageFormDialog({ isOpen, onClose, traineeId, traineeName, editingPackage = null }) {
  const queryClient = useQueryClient();
  const { user: coach } = useContext(AuthContext);

  const defaults = editingPackage ? {
    package_name: editingPackage.package_name || "",
    service_type: editingPackage.service_type || "personal",
    billing_model: editingPackage.billing_model || "punch_card",
    total_sessions: editingPackage.total_sessions?.toString() || "",
    unit_type: editingPackage.unit_type || "sessions",
    price: editingPackage.price?.toString() || "",
    final_price: editingPackage.final_price?.toString() || "",
    payment_method: editingPackage.payment_method || "credit",
    payment_status: editingPackage.payment_status || "ממתין לתשלום",
    start_date: editingPackage.start_date?.split("T")[0] || new Date().toISOString().split("T")[0],
    end_date: editingPackage.end_date?.split("T")[0] || "",
    auto_deduct_enabled: editingPackage.auto_deduct_enabled !== false,
    notes_internal: editingPackage.notes_internal || "",
  } : {
    package_name: "", service_type: "personal", billing_model: "punch_card",
    total_sessions: "", unit_type: "sessions", price: "", final_price: "",
    payment_method: "credit", payment_status: "ממתין לתשלום",
    start_date: new Date().toISOString().split("T")[0], end_date: "",
    auto_deduct_enabled: true, notes_internal: "",
  };

  const [form, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSave = async () => {
    if (!form.package_name) { toast.error("נא למלא שם חבילה"); return; }

    const data = {
      trainee_id: traineeId,
      trainee_name: traineeName || null,
      coach_id: coach?.id || null,
      package_name: form.package_name,
      service_type: form.service_type,
      billing_model: form.billing_model,
      total_sessions: form.total_sessions ? parseInt(form.total_sessions) : null,
      used_sessions: editingPackage?.used_sessions || 0,
      sessions_remaining: form.total_sessions ? parseInt(form.total_sessions) - (editingPackage?.used_sessions || 0) : null,
      unit_type: form.unit_type,
      price: form.price ? parseFloat(form.price) : null,
      final_price: form.final_price ? parseFloat(form.final_price) : null,
      payment_method: form.payment_method || null,
      payment_status: form.payment_status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      auto_deduct_enabled: form.auto_deduct_enabled,
      notes_internal: form.notes_internal || null,
      status: "פעיל",
    };

    setSaving(true);
    try {
      if (editingPackage) {
        await base44.entities.ClientService.update(editingPackage.id, data);
        toast.success("חבילה עודכנה");
      } else {
        await base44.entities.ClientService.create(data);
        toast.success("חבילה נוצרה בהצלחה");
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
    } catch (error) {
      console.error("[PackageForm] Error:", error);
      toast.error("שגיאה בשמירת חבילה: " + (error?.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto bg-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-[#FF6F20]" />
            {editingPackage ? "ערוך חבילה" : "חבילה חדשה"}
            {traineeName && <span className="text-sm font-normal text-gray-500">— {traineeName}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">שם חבילה *</Label>
            <Input value={form.package_name} onChange={e => set("package_name", e.target.value)} placeholder="לדוגמה: חבילת 10 אימונים" className="rounded-lg" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">סוג שירות</Label>
              <Select value={form.service_type} onValueChange={v => set("service_type", v)}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">אישי</SelectItem>
                  <SelectItem value="group">קבוצתי</SelectItem>
                  <SelectItem value="online">אונליין</SelectItem>
                  <SelectItem value="hybrid">היברידי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">מודל</Label>
              <Select value={form.billing_model} onValueChange={v => set("billing_model", v)}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="punch_card">כרטיסייה</SelectItem>
                  <SelectItem value="subscription">מנוי חודשי</SelectItem>
                  <SelectItem value="single">חד-פעמי</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">סה"כ יחידות</Label>
              <Input type="number" value={form.total_sessions} onChange={e => set("total_sessions", e.target.value)} placeholder="10" className="rounded-lg" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">יחידת מידה</Label>
              <Select value={form.unit_type} onValueChange={v => set("unit_type", v)}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sessions">מפגשים</SelectItem>
                  <SelectItem value="weeks">שבועות</SelectItem>
                  <SelectItem value="months">חודשים</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">מחיר (₪)</Label>
              <Input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="500" className="rounded-lg" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">מחיר סופי (₪)</Label>
              <Input type="number" value={form.final_price} onChange={e => set("final_price", e.target.value)} placeholder="450" className="rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">שיטת תשלום</Label>
              <Select value={form.payment_method} onValueChange={v => set("payment_method", v)}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">אשראי</SelectItem>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="bit">ביט</SelectItem>
                  <SelectItem value="transfer">העברה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">סטטוס תשלום</Label>
              <Select value={form.payment_status} onValueChange={v => set("payment_status", v)}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="שולם">שולם</SelectItem>
                  <SelectItem value="ממתין לתשלום">ממתין</SelectItem>
                  <SelectItem value="חלקי">חלקי</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">תאריך התחלה</Label>
              <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className="rounded-lg" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">תאריך סיום</Label>
              <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className="rounded-lg" />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
            <input type="checkbox" checked={form.auto_deduct_enabled} onChange={e => set("auto_deduct_enabled", e.target.checked)} className="w-4 h-4 accent-[#FF6F20]" />
            <div>
              <span className="text-sm font-bold text-gray-800">קיזוז אוטומטי</span>
              <p className="text-[10px] text-gray-500">מפחית יחידה אוטומטית כשמפגש מסומן כ"הושלם"</p>
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1 block">הערות פנימיות</Label>
            <Textarea value={form.notes_internal} onChange={e => set("notes_internal", e.target.value)} placeholder="הערות למאמן בלבד..." className="rounded-lg resize-none min-h-[60px]" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl font-bold text-white bg-[#FF6F20] hover:bg-[#e65b12]">
            {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : (editingPackage ? "עדכן חבילה" : "צור חבילה")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
