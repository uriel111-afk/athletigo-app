import React, { useState, useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, User, Users, Monitor, ChevronLeft, Plus, Minus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { DraftBanner } from "@/components/DraftBanner";

const TYPES = [
  { id: "personal", label: "אישי", desc: "מפגשי 1-על-1", icon: User, color: "#FF6F20" },
  { id: "group", label: "קבוצתי", desc: "מנוי חודשי", icon: Users, color: "#4CAF50" },
  { id: "online", label: "אונליין", desc: "היברידי — מפגשים + זמן", icon: Monitor, color: "#2196F3" },
];

const INITIAL_DATA = {
  package_type: "",
  package_name: "",
  sessions_count: 10,
  frequency_per_week: 2,
  duration_months: 1,
  price: "",
  start_date: "",
  expires_at: "",
  payment_status: "ממתין לתשלום",
  payment_method: "credit",
  notes_internal: "",
};

const NumPicker = ({ value, onChange, min = 1, max = 99, label }) => {
  const v = parseInt(value) || min;
  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-[10px] font-bold text-gray-400 mb-1">{label}</span>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, v - 1))}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95">
          <Minus size={14} />
        </button>
        <span className="w-10 text-center text-xl font-black text-gray-900">{v}</span>
        <button type="button" onClick={() => onChange(Math.min(max, v + 1))}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

export default function PackageFormDialog({ isOpen, onClose, traineeId, traineeName, editingPackage = null }) {
  const queryClient = useQueryClient();
  const { user: coach } = useContext(AuthContext);

  const [step, setStep] = useState(editingPackage ? 2 : 1);
  const [saving, setSaving] = useState(false);

  const initialData = editingPackage ? {
    package_type: editingPackage.package_type || "personal",
    package_name: editingPackage.package_name || "",
    sessions_count: editingPackage.sessions_count || editingPackage.total_sessions || 10,
    frequency_per_week: editingPackage.frequency_per_week || 2,
    duration_months: editingPackage.duration_months || 1,
    price: editingPackage.price?.toString() || "",
    start_date: editingPackage.start_date?.split("T")[0] || new Date().toISOString().split("T")[0],
    expires_at: editingPackage.expires_at || "",
    payment_status: editingPackage.payment_status || "ממתין לתשלום",
    payment_method: editingPackage.payment_method || "credit",
    notes_internal: editingPackage.notes_internal || "",
  } : { ...INITIAL_DATA, start_date: new Date().toISOString().split("T")[0] };

  const scopeKey = `${traineeId ?? 'no-trainee'}_${editingPackage?.id ?? 'new'}`;
  const {
    data: form, setData: setForm,
    hasDraft, keepDraft, discardDraft, clearDraft,
  } = useFormDraft('PackageEdit', scopeKey, isOpen, initialData);

  useKeepScreenAwake(isOpen);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectType = (type) => {
    const names = { personal: "חבילה אישית", group: "מנוי קבוצתי", online: "חבילה אונליין" };
    set("package_type", type);
    if (!form.package_name) set("package_name", names[type]);
    setStep(2);
  };

  // Auto-calculate expiry for group/online
  const calcExpiry = () => {
    if (!form.start_date || !form.duration_months) return "";
    const d = new Date(form.start_date);
    d.setMonth(d.getMonth() + form.duration_months);
    return d.toISOString().split("T")[0];
  };

  const handleSave = async () => {
    if (!form.package_name) { toast.error("נא למלא שם חבילה"); return; }

    const isPersonal = form.package_type === "personal";
    const isGroup = form.package_type === "group";
    const isOnline = form.package_type === "online";
    const expiresAt = (isGroup || isOnline) ? (form.expires_at || calcExpiry()) : form.expires_at || null;

    const data = {
      trainee_id: traineeId,
      trainee_name: traineeName || null,
      coach_id: coach?.id || null,
      created_by: coach?.id || null,
      package_name: form.package_name,
      package_type: form.package_type,
      service_type: form.package_type,
      billing_model: isGroup ? "subscription" : "punch_card",
      sessions_count: (isPersonal || isOnline) ? form.sessions_count : null,
      total_sessions: (isPersonal || isOnline) ? form.sessions_count : null,
      used_sessions: editingPackage?.used_sessions || 0,
      sessions_remaining: (isPersonal || isOnline) ? form.sessions_count - (editingPackage?.used_sessions || 0) : null,
      frequency_per_week: form.frequency_per_week || null,
      duration_months: (isGroup || isOnline) ? form.duration_months : null,
      price: form.price ? parseFloat(form.price) : null,
      final_price: form.price ? parseFloat(form.price) : null,
      payment_method: form.payment_method || null,
      payment_status: form.payment_status,
      start_date: form.start_date || null,
      end_date: expiresAt,
      expires_at: expiresAt,
      auto_deduct_enabled: !isGroup,
      unit_type: isGroup ? "months" : "sessions",
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
      queryClient.invalidateQueries({ queryKey: ["trainee-services"] });
      queryClient.invalidateQueries({ queryKey: ["all-trainees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      clearDraft();
      onClose();
    } catch (error) {
      console.error("[PackageForm] Error:", error);
      toast.error("שגיאה בשמירת חבילה: " + (error?.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  const typeConfig = TYPES.find(t => t.id === form.package_type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-[#FF6F20]" />
            {editingPackage ? "ערוך חבילה" : "חבילה חדשה"}
            {traineeName && <span className="text-sm font-normal text-gray-500">— {traineeName}</span>}
          </DialogTitle>
        </DialogHeader>

        {hasDraft && (
          <DraftBanner onContinue={keepDraft} onDiscard={discardDraft} />
        )}

        {/* ── Step 1: Choose type ─────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-gray-500 text-center">בחר סוג חבילה</p>
            {TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => selectType(t.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-current transition-all active:scale-[0.98]"
                  style={{ color: t.color }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.color + "15" }}>
                    <Icon size={24} />
                  </div>
                  <div className="text-right flex-1">
                    <div className="font-black text-base text-gray-900">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.desc}</div>
                  </div>
                  <ChevronLeft size={18} className="text-gray-300" />
                </button>
              );
            })}
          </div>
        )}

        {/* ── Step 2: Details ─────────────────────────────── */}
        {step >= 2 && (
          <div className="space-y-4 mt-2">
            {/* Type badge */}
            {typeConfig && (
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => !editingPackage && setStep(1)} className="text-[10px] font-bold text-gray-400 hover:text-[#FF6F20]">
                  {!editingPackage && "← שנה סוג"}
                </button>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: typeConfig.color + "15", color: typeConfig.color }}>
                  {typeConfig.label}
                </span>
              </div>
            )}

            {/* Name */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">שם חבילה</Label>
              <Input value={form.package_name} onChange={e => set("package_name", e.target.value)} className="rounded-lg" />
            </div>

            {/* Type-specific fields */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              {(form.package_type === "personal" || form.package_type === "online") && (
                <div className="flex justify-around">
                  <NumPicker value={form.sessions_count} onChange={v => set("sessions_count", v)} label="מספר מפגשים" max={100} />
                  <NumPicker value={form.frequency_per_week} onChange={v => set("frequency_per_week", v)} label="פעמים בשבוע" max={7} />
                </div>
              )}
              {(form.package_type === "group" || form.package_type === "online") && (
                <div className="flex justify-around">
                  <NumPicker value={form.duration_months} onChange={v => set("duration_months", v)} label="חודשים" max={24} />
                  {form.package_type === "group" && (
                    <NumPicker value={form.frequency_per_week} onChange={v => set("frequency_per_week", v)} label="פעמים בשבוע" max={7} />
                  )}
                </div>
              )}
            </div>

            {/* Price */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">מחיר (₪)</Label>
              <Input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0" className="rounded-lg text-lg font-bold" />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">תאריך התחלה</Label>
                <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  פקיעה {(form.package_type === "group" || form.package_type === "online") ? "(מחושב)" : "(אופציונלי)"}
                </Label>
                <Input type="date" value={form.expires_at || calcExpiry()} onChange={e => set("expires_at", e.target.value)} className="rounded-lg" />
              </div>
            </div>

            {/* Payment */}
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

            {/* Notes */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">הערות פנימיות</Label>
              <Textarea value={form.notes_internal} onChange={e => set("notes_internal", e.target.value)} placeholder="הערות למאמן..." className="rounded-lg resize-none min-h-[50px]" />
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving || !form.package_name}
              className="w-full h-12 rounded-xl font-bold text-white bg-[#FF6F20] hover:bg-[#e65b12]">
              {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : (editingPackage ? "עדכן חבילה" : "צור חבילה")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
