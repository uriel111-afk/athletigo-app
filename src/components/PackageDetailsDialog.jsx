import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { Package, Calendar, DollarSign, Activity, ChevronDown, Loader2, Plus, Pause, RefreshCw, Trash2, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import PageLoader from "./PageLoader";

const STATUS_COLORS = {
  "פעיל": "bg-green-100 text-green-800",
  "active": "bg-green-100 text-green-800",
  "completed": "bg-blue-100 text-blue-800",
  "expired": "bg-red-100 text-red-800",
  "paused": "bg-yellow-100 text-yellow-800",
  "cancelled": "bg-gray-100 text-gray-500",
};

export default function PackageDetailsDialog({ isOpen, onClose, packageData, onEdit }) {
  const queryClient = useQueryClient();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", due_date: "", payment_method: "credit", status: "pending" });
  const [section, setSection] = useState(null); // 'sessions' | 'transactions' | 'payments'

  const pkg = packageData;
  if (!pkg) return null;

  const remaining = (pkg.total_sessions || pkg.sessions_count || 0) - (pkg.used_sessions || 0);
  const daysLeft = pkg.expires_at ? Math.ceil((new Date(pkg.expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const statusClass = STATUS_COLORS[pkg.status] || "bg-gray-100 text-gray-600";

  // Fetch linked sessions
  const { data: linkedSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["package-sessions", pkg.id],
    queryFn: () => base44.entities.Session.filter({ service_id: pkg.id }).catch(() => []),
    enabled: isOpen && section === "sessions",
  });

  // Fetch transactions
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ["package-transactions", pkg.id],
    queryFn: () => base44.entities.ServiceTransaction.filter({ service_id: pkg.id }).catch(() => []),
    enabled: isOpen && section === "transactions",
  });

  // Fetch payments
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["package-payments", pkg.id],
    queryFn: () => base44.entities.ServicePayment.filter({ service_id: pkg.id }).catch(() => []),
    enabled: isOpen && section === "payments",
  });

  const handleStatusChange = async (newStatus) => {
    if (newStatus === "cancelled" && linkedSessions.length > 0) {
      if (!window.confirm(`חבילה זו מקושרת ל-${linkedSessions.length} מפגשים. לבטל בכל זאת?`)) return;
    }
    try {
      await base44.entities.ClientService.update(pkg.id, { status: newStatus });
      await base44.entities.ServiceTransaction.create({
        service_id: pkg.id, action_type: `status_${newStatus}`,
        units_changed: 0, notes: `סטטוס שונה ל-${newStatus}`, created_by: null,
      }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      toast.success("סטטוס עודכן");
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + (e?.message || "נסה שוב"));
    }
  };

  const handleAddPayment = async () => {
    if (!paymentForm.amount) { toast.error("נא למלא סכום"); return; }
    try {
      await base44.entities.ServicePayment.create({
        service_id: pkg.id,
        amount: parseFloat(paymentForm.amount),
        due_date: paymentForm.due_date || null,
        payment_method: paymentForm.payment_method,
        status: paymentForm.status,
      });
      queryClient.invalidateQueries({ queryKey: ["package-payments", pkg.id] });
      setShowPaymentForm(false);
      setPaymentForm({ amount: "", due_date: "", payment_method: "credit", status: "pending" });
      toast.success("תשלום נוסף");
    } catch (e) {
      toast.error("שגיאה: " + (e?.message || "נסה שוב"));
    }
  };

  const markPaymentPaid = async (paymentId) => {
    try {
      await base44.entities.ServicePayment.update(paymentId, { status: "paid", paid_at: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ["package-payments", pkg.id] });
      toast.success("סומן כשולם");
    } catch (e) {
      toast.error("שגיאה: " + (e?.message || "נסה שוב"));
    }
  };

  const SectionToggle = ({ id, label, icon: Icon }) => (
    <button onClick={() => setSection(section === id ? null : id)}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${section === id ? "border-[#FF6F20] bg-[#FFF7ED]" : "border-gray-100 bg-gray-50 hover:bg-gray-100"}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-[#FF6F20]" />
        <span className="text-sm font-bold text-gray-800">{label}</span>
      </div>
      <ChevronDown size={14} className={`text-gray-400 transition-transform ${section === id ? "rotate-180" : ""}`} />
    </button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto bg-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-[#FF6F20]" />
            {pkg.package_name || "חבילה"}
          </DialogTitle>
        </DialogHeader>

        {/* Status + type */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{pkg.status}</span>
          <span className="text-xs text-gray-500">{pkg.package_type === "personal" ? "אישי" : pkg.package_type === "group" ? "קבוצתי" : "אונליין"}</span>
          {pkg.trainee_name && <span className="text-xs text-gray-400">• {pkg.trainee_name}</span>}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {pkg.package_type !== "group" && (
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-[#FF6F20]">{remaining}</div>
              <div className="text-[9px] text-gray-500 font-bold">מפגשים נותרו</div>
            </div>
          )}
          {daysLeft !== null && (
            <div className={`rounded-xl p-3 text-center ${daysLeft <= 14 ? "bg-red-50" : "bg-blue-50"}`}>
              <div className={`text-xl font-black ${daysLeft <= 14 ? "text-red-600" : "text-blue-600"}`}>{Math.max(0, daysLeft)}</div>
              <div className="text-[9px] text-gray-500 font-bold">ימים נותרו</div>
            </div>
          )}
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-green-600">₪{pkg.price || pkg.final_price || 0}</div>
            <div className="text-[9px] text-gray-500 font-bold">מחיר</div>
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">התחלה: </span>{pkg.start_date ? format(new Date(pkg.start_date), "dd/MM/yy") : "—"}</div>
          <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">פקיעה: </span>{pkg.expires_at ? format(new Date(pkg.expires_at), "dd/MM/yy") : "—"}</div>
          <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">תשלום: </span>{pkg.payment_status || "—"}</div>
          <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">שיטה: </span>{pkg.payment_method || "—"}</div>
        </div>

        {/* Expandable sections */}
        <div className="space-y-2 mb-4">
          <SectionToggle id="sessions" label="מפגשים מקושרים" icon={Calendar} />
          {section === "sessions" && (
            <div className="bg-white border border-gray-100 rounded-xl p-3 max-h-40 overflow-y-auto">
              {sessionsLoading ? <PageLoader message="טוען..." /> : linkedSessions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">אין מפגשים מקושרים</p>
              ) : linkedSessions.map(s => (
                <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0 text-xs">
                  <span className="font-bold">{s.date} {s.time}</span>
                  <span className={s.status === "התקיים" ? "text-green-600" : "text-gray-400"}>{s.status}</span>
                  <span className={s.was_deducted ? "text-[#FF6F20]" : "text-gray-300"}>{s.was_deducted ? "קוזז" : "—"}</span>
                </div>
              ))}
            </div>
          )}

          <SectionToggle id="transactions" label="היסטוריית תנועות" icon={Activity} />
          {section === "transactions" && (
            <div className="bg-white border border-gray-100 rounded-xl p-3 max-h-40 overflow-y-auto">
              {txLoading ? <PageLoader message="טוען..." /> : transactions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">אין תנועות</p>
              ) : transactions.map(t => (
                <div key={t.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0 text-xs">
                  <span className="font-bold">{t.action_type}</span>
                  <span className="text-gray-500">{t.previous_remaining} → {t.new_remaining}</span>
                  <span className="text-gray-400">{t.created_at ? format(new Date(t.created_at), "dd/MM HH:mm") : ""}</span>
                </div>
              ))}
            </div>
          )}

          <SectionToggle id="payments" label="תשלומים" icon={DollarSign} />
          {section === "payments" && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              {paymentsLoading ? <PageLoader message="טוען..." /> : (
                <>
                  {payments.length === 0 && !showPaymentForm && (
                    <p className="text-xs text-gray-400 text-center py-2">אין תשלומים רשומים</p>
                  )}
                  {payments.map(p => (
                    <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0 text-xs">
                      <span className="font-bold">₪{p.amount}</span>
                      <span className="text-gray-500">{p.due_date || "—"}</span>
                      <button onClick={() => p.status !== "paid" && markPaymentPaid(p.id)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700 hover:bg-green-100 cursor-pointer"}`}>
                        {p.status === "paid" ? "שולם" : "ממתין — לחץ לסמן"}
                      </button>
                    </div>
                  ))}
                  {showPaymentForm ? (
                    <div className="mt-2 p-2 bg-orange-50 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" placeholder="סכום" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="h-8 text-xs rounded-lg" />
                        <Input type="date" value={paymentForm.due_date} onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })} className="h-8 text-xs rounded-lg" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddPayment} size="sm" className="flex-1 h-8 bg-[#FF6F20] hover:bg-[#e65b12] text-white text-xs rounded-lg">שמור</Button>
                        <Button onClick={() => setShowPaymentForm(false)} size="sm" variant="outline" className="h-8 text-xs rounded-lg">ביטול</Button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowPaymentForm(true)} className="w-full mt-2 text-xs text-[#FF6F20] font-bold flex items-center justify-center gap-1 py-1 hover:bg-orange-50 rounded-lg">
                      <Plus size={12} /> הוסף תשלום
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          {onEdit && <Button onClick={() => { onClose(); onEdit(pkg); }} variant="outline" size="sm" className="rounded-xl text-xs"><Edit2 size={12} className="ml-1" />עריכה</Button>}
          {pkg.status === "פעיל" && <Button onClick={() => handleStatusChange("paused")} variant="outline" size="sm" className="rounded-xl text-xs text-yellow-600"><Pause size={12} className="ml-1" />השהיה</Button>}
          {(pkg.status === "paused" || pkg.status === "expired" || pkg.status === "completed") && (
            <Button onClick={() => handleStatusChange("פעיל")} variant="outline" size="sm" className="rounded-xl text-xs text-green-600"><RefreshCw size={12} className="ml-1" />חידוש</Button>
          )}
          <Button onClick={() => handleStatusChange("cancelled")} variant="outline" size="sm" className="rounded-xl text-xs text-red-500"><Trash2 size={12} className="ml-1" />ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
