import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Activity, TrendingUp, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

const TECH_MAP = {
  basic: { label: 'Basic', labelHe: 'בסיס', icon: Zap, color: '#FF6F20' },
  foot_switch: { label: 'Foot Switch', labelHe: 'החלפת רגליים', icon: Activity, color: '#2196F3' },
  high_knees: { label: 'High Knees', labelHe: 'הרמת ברכיים', icon: TrendingUp, color: '#4CAF50' },
};

export default function BaselineDetailView({ isOpen, onClose, baselineId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !baselineId) return;
    setLoading(true);
    base44.entities.Baseline.filter({ id: baselineId })
      .then(results => setData(results?.[0] || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [isOpen, baselineId]);

  if (!isOpen) return null;

  const tech = data ? TECH_MAP[data.technique] || TECH_MAP.basic : null;
  const TechIcon = tech?.icon || Zap;
  const rounds = data?.rounds_data || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto bg-white p-0" dir="rtl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF6F20]" />
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-gray-500">לא נמצאו נתונים</div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-100" style={{ backgroundColor: tech.color + '08' }}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-black">
                  <TechIcon className="w-5 h-5" style={{ color: tech.color }} />
                  מדידת בייסליין — {tech.label}
                </DialogTitle>
              </DialogHeader>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(data.date), 'dd/MM/yyyy', { locale: he })}</span>
                {data.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{data.time}</span>}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Parameters */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'זמן עבודה', value: `${Math.floor(data.work_time_seconds / 60)}:${String(data.work_time_seconds % 60).padStart(2, '0')}` },
                  { label: 'סיבובים', value: data.rounds_count },
                  { label: 'זמן מנוחה', value: `${Math.floor(data.rest_time_seconds / 60)}:${String(data.rest_time_seconds % 60).padStart(2, '0')}` },
                ].map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400 font-bold">{p.label}</div>
                    <div className="text-sm font-black text-gray-900">{p.value}</div>
                  </div>
                ))}
              </div>

              {/* Rounds Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm text-right" dir="rtl">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">סיבוב</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">קפיצות</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">פספוסים</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rounds.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-bold text-gray-800">Round {r.round || i + 1}</td>
                        <td className="px-3 py-2 text-gray-900 font-semibold">{r.jumps}</td>
                        <td className="px-3 py-2 text-gray-500">{r.misses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Score Summary */}
              <div className="grid grid-cols-3 gap-2 bg-gray-900 rounded-xl p-3">
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 font-bold mb-0.5">סה"כ</div>
                  <div className="text-lg font-black text-white">{data.total_jumps}</div>
                </div>
                <div className="text-center border-x border-gray-700">
                  <div className="text-[10px] text-gray-400 font-bold mb-0.5">ממוצע</div>
                  <div className="text-lg font-black text-white">{data.average_jumps}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-bold mb-0.5" style={{ color: tech.color }}>SCORE</div>
                  <div className="text-xl font-black" style={{ color: tech.color }}>{data.baseline_score} <span className="text-xs">JPS</span></div>
                </div>
              </div>

              {data.notes && (
                <div className="bg-gray-50 rounded-xl p-3 text-right">
                  <p className="text-xs text-gray-500 font-medium mb-1">הערות:</p>
                  <p className="text-sm text-gray-800">{data.notes}</p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
