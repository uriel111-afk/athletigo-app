import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Activity, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function BaselineJumpRopeDialog({ isOpen, onClose, user }) {
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [secondsPerRound, setSecondsPerRound] = useState(30);
  const [rounds, setRounds] = useState([
    { jumps: "", misses: "" },
    { jumps: "", misses: "" },
    { jumps: "", misses: "" },
  ]);

  const stats = useMemo(() => {
    const filled = rounds.filter(r => r.jumps !== "" || r.misses !== "");
    if (filled.length === 0) return null;
    const totalJumps = rounds.reduce((sum, r) => sum + (parseFloat(r.jumps) || 0), 0);
    const totalMisses = rounds.reduce((sum, r) => sum + (parseFloat(r.misses) || 0), 0);
    const totalAttempts = totalJumps + totalMisses;
    const numRounds = rounds.length;
    const totalSeconds = numRounds * secondsPerRound;
    const jps = totalSeconds > 0 ? parseFloat((totalJumps / totalSeconds).toFixed(2)) : 0;
    const accuracy = totalAttempts > 0 ? Math.round((totalJumps / totalAttempts) * 100) : 0;
    const avgJumps = numRounds > 0 ? parseFloat((totalJumps / numRounds).toFixed(1)) : 0;
    const avgMisses = numRounds > 0 ? parseFloat((totalMisses / numRounds).toFixed(1)) : 0;
    return { totalJumps, totalMisses, totalAttempts, jps, accuracy, avgJumps, avgMisses, totalSeconds, numRounds };
  }, [rounds, secondsPerRound]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Measurement.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-measurements'] });
      toast.success("✅ תוצאת Baseline נשמרה");
      handleClose();
    },
    onError: (err) => toast.error("❌ שגיאה בשמירה: " + (err?.message || "נסה שוב")),
  });

  const handleClose = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setSecondsPerRound(30);
    setRounds([{ jumps: "", misses: "" }, { jumps: "", misses: "" }, { jumps: "", misses: "" }]);
    onClose();
  };

  const updateRound = (index, field, value) => {
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRound = () => {
    if (rounds.length < 20) setRounds(prev => [...prev, { jumps: "", misses: "" }]);
  };

  const removeRound = (index) => {
    if (rounds.length > 1) setRounds(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!date) { toast.error("נא לבחור תאריך"); return; }
    if (!stats) { toast.error("נא להזין נתוני סבבים"); return; }
    if (!user?.id) { toast.error("שגיאה: משתמש לא נטען"); return; }

    const roundResults = rounds.map((r, i) => ({
      round: i + 1,
      jumps: parseFloat(r.jumps) || 0,
      misses: parseFloat(r.misses) || 0,
      seconds: secondsPerRound,
      jps: secondsPerRound > 0 ? parseFloat(((parseFloat(r.jumps) || 0) / secondsPerRound).toFixed(2)) : 0,
    }));

    const data = {
      trainee_id: user.id,
      trainee_name: user.full_name || "",
      date,
      notes: `Baseline Jump Rope — ${stats.jps} JPS | ${stats.numRounds} סבבים × ${secondsPerRound}s | דיוק: ${stats.accuracy}%`,
      // Baseline-specific columns
      baseline_rounds: stats.numRounds,
      baseline_duration_seconds: secondsPerRound,
      baseline_round_results: roundResults,
      baseline_total_jumps: stats.totalJumps,
      baseline_total_misses: stats.totalMisses,
      baseline_average_jumps: stats.avgJumps,
      baseline_average_misses: stats.avgMisses,
      baseline_jump_rate_per_second: stats.jps,
      recorded_by: user.id,
      recorded_by_name: user.full_name || "",
    };

    try {
      await createMutation.mutateAsync(data);
    } catch {}
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2" style={{ color: '#000000', fontFamily: 'Barlow, Heebo, sans-serif' }}>
            <Activity className="w-5 h-5 text-[#FF6F20]" />
            Baseline Jump Rope
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Date + Seconds per round */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-bold mb-1 block" style={{ color: '#000000' }}>תאריך</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl h-11"
                style={{ border: '1px solid #E0E0E0', fontSize: 16 }}
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-1 block" style={{ color: '#000000' }}>שניות לסיבוב</Label>
              <Input
                type="number"
                value={secondsPerRound}
                onChange={(e) => setSecondsPerRound(Math.max(1, parseInt(e.target.value) || 30))}
                min={1}
                max={120}
                className="rounded-xl h-11"
                style={{ border: '1px solid #E0E0E0', fontSize: 16 }}
              />
            </div>
          </div>

          {/* Rounds */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-bold" style={{ color: '#000000' }}>
                סיבובים ({rounds.length})
              </Label>
              <button
                onClick={addRound}
                disabled={rounds.length >= 20}
                className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg text-white min-h-[36px]"
                style={{ backgroundColor: rounds.length >= 20 ? '#E0E0E0' : '#FF6F20' }}
              >
                <Plus className="w-3.5 h-3.5" />
                סיבוב
              </button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 mb-1 px-1">
              <span className="col-span-1 text-xs font-bold text-center" style={{ color: '#7D7D7D' }}>#</span>
              <span className="col-span-5 text-xs font-bold text-center" style={{ color: '#7D7D7D' }}>קפיצות ✅</span>
              <span className="col-span-5 text-xs font-bold text-center" style={{ color: '#7D7D7D' }}>פספוסים ❌</span>
              <span className="col-span-1" />
            </div>

            <div className="space-y-2">
              {rounds.map((round, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-1 text-sm font-black text-center" style={{ color: '#FF6F20' }}>{idx + 1}</span>
                  <Input
                    type="number"
                    className="col-span-5 rounded-xl text-center h-11"
                    style={{ border: '1px solid #E0E0E0', fontSize: 16 }}
                    inputMode="numeric"
                    placeholder="0"
                    min={0}
                    value={round.jumps}
                    onChange={(e) => updateRound(idx, 'jumps', e.target.value)}
                  />
                  <Input
                    type="number"
                    className="col-span-5 rounded-xl text-center h-11"
                    style={{ border: '1px solid #E0E0E0', fontSize: 16 }}
                    inputMode="numeric"
                    placeholder="0"
                    min={0}
                    value={round.misses}
                    onChange={(e) => updateRound(idx, 'misses', e.target.value)}
                  />
                  <button
                    onClick={() => removeRound(idx)}
                    disabled={rounds.length <= 1}
                    className="col-span-1 flex items-center justify-center min-h-[44px]"
                  >
                    <Trash2 className="w-4 h-4" style={{ color: rounds.length <= 1 ? '#E0E0E0' : '#f44336' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Stats */}
          {stats && (
            <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <p className="text-sm font-black mb-3" style={{ color: '#FF6F20' }}>סיכום מבחן</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-white rounded-xl">
                  <p className="text-2xl font-black" style={{ color: '#FF6F20' }}>{stats.jps}</p>
                  <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>קפיצות/שנייה (JPS)</p>
                </div>
                <div className="text-center p-3 bg-white rounded-xl">
                  <p className="text-2xl font-black" style={{ color: '#000000' }}>{stats.accuracy}%</p>
                  <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>דיוק</p>
                </div>
                <div className="text-center p-3 bg-white rounded-xl">
                  <p className="text-xl font-black" style={{ color: '#000000' }}>{stats.totalJumps}</p>
                  <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>סה"כ קפיצות</p>
                </div>
                <div className="text-center p-3 bg-white rounded-xl">
                  <p className="text-xl font-black" style={{ color: '#000000' }}>{stats.avgJumps}</p>
                  <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>ממוצע לסיבוב</p>
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1 rounded-xl font-bold min-h-[44px]"
              style={{ border: '1px solid #E0E0E0', color: '#000000' }}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || !stats}
              className="flex-1 rounded-xl font-bold text-white min-h-[44px]"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {createMutation.isPending ? (
                <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</>
              ) : (
                <><CheckCircle className="w-4 h-4 ml-2" />שמור תוצאה</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
