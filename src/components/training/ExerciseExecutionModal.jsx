import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider"; // Assuming exist or I'll use basic input
import { 
  Check, X, Clock, Repeat, Scale, Activity, 
  Video, Zap, AlignLeft, User, Layers, 
  RotateCcw, GripVertical, Footprints, Maximize2,
  Dumbbell, Timer, Target
} from "lucide-react";
import { Loader2 } from "lucide-react";

export default function ExerciseExecutionModal({ isOpen, onClose, exercise, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    actual_result: "",
    actual_weight: "",
    actual_reps: "",
    rpe: 0,
    trainee_feedback: "",
    completed: false
  });

  useEffect(() => {
    if (exercise) {
      setFormData({
        actual_result: exercise.actual_result || "",
        actual_weight: exercise.actual_weight || "", // specific field if exists
        actual_reps: exercise.actual_reps || "",     // specific field if exists
        rpe: exercise.rpe || 0,
        trainee_feedback: exercise.trainee_feedback || "",
        completed: exercise.completed || false
      });
    }
  }, [exercise, isOpen]);

  if (!exercise) return null;

  const handleSave = () => {
    onSave({
      ...formData,
      completed: true // Auto-complete on save usually
    });
  };

  const formatTime = (val) => {
    if (!val) return "";
    if (typeof val === 'string' && val.includes(':')) return val;
    const seconds = parseInt(val);
    if (isNaN(seconds)) return val;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const MetricItem = ({ icon: Icon, label, value, subLabel }) => {
    if (!value || value === '0' || value === '00:00') return null;
    return (
      <div className="flex flex-col items-center justify-center p-3 bg-gray-50 rounded-xl border border-gray-100 text-center h-full">
        <Icon className="w-5 h-5 text-gray-400 mb-1.5" />
        <span className="text-lg font-black text-gray-900 leading-none">{value}</span>
        <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase">{label}</span>
        {subLabel && <span className="text-[9px] text-gray-400">{subLabel}</span>}
      </div>
    );
  };

  const DetailRow = ({ icon: Icon, label, value }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
        <Icon className="w-4 h-4 text-[#FF6F20] mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-bold text-gray-400 mb-0.5">{label}</p>
          <p className="text-sm font-medium text-gray-800 leading-relaxed whitespace-pre-wrap">{value}</p>
        </div>
      </div>
    );
  };

  // Determine Sub-Exercises
  const subExercises = exercise.tabata_exercises || exercise.combo_exercises || exercise.superset_exercises || exercise.exercises || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:w-full max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 bg-white rounded-2xl" dir="rtl">
        
        {/* Header */}
        <div className="p-5 pb-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-black text-gray-900 leading-tight">{exercise.exercise_name}</h2>
              {exercise.weight_type && exercise.weight_type !== 'bodyweight' && (
                <p className="text-xs font-bold text-gray-400 mt-1">
                  {exercise.weight_type} {exercise.equipment ? `• ${exercise.equipment}` : ''}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          
          {/* Description */}
          {exercise.description && (
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-sm text-blue-800 leading-relaxed">{exercise.description}</p>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <MetricItem icon={Layers} label="סטים" value={exercise.sets} />
            <MetricItem icon={Repeat} label="חזרות" value={exercise.reps_or_time} />
            <MetricItem icon={Scale} label="משקל" value={exercise.weight} subLabel="ק״ג" />
            <MetricItem icon={Clock} label="זמן" value={formatTime(exercise.work_time)} />
            <MetricItem icon={RotateCcw} label="סבבים" value={exercise.rounds} />
            <MetricItem icon={Timer} label="מנוחה" value={formatTime(exercise.rest_time)} />
          </div>

          {/* Sub Exercises List */}
          {subExercises.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                רשימת תרגילים
              </h3>
              <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                {subExercises.map((sub, i) => (
                  <div key={i} className="p-3 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                        {i + 1}
                      </span>
                      <span className="text-sm font-bold text-gray-800">{sub.name}</span>
                    </div>
                    <div className="text-xs font-medium text-gray-600 flex gap-2">
                      {(sub.measurement === 'time' || sub.type === 'time') ? formatTime(sub.value) : `${sub.value} חזרות`}
                      {sub.weight && <span className="text-gray-400">|</span>}
                      {sub.weight && <span>{sub.weight} ק"ג</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details List */}
          <div className="space-y-1">
            <DetailRow icon={User} label="מנח גוף" value={exercise.body_position} />
            <DetailRow icon={GripVertical} label="אחיזה" value={exercise.grip} />
            <DetailRow icon={Maximize2} label="טווח תנועה" value={exercise.range_of_motion} />
            <DetailRow icon={Activity} label="טמפו" value={exercise.tempo} />
            <DetailRow icon={Zap} label="דגשים והערות" value={exercise.coach_notes || exercise.cues} />
          </div>

          {/* Video */}
          {exercise.video_url && (
            <a 
              href={exercise.video_url} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Video className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">צפה בסרטון הדגמה</p>
                <p className="text-[10px] text-gray-400">YouTube / External Link</p>
              </div>
            </a>
          )}

          <div className="h-px bg-gray-100 w-full my-4" />

          {/* --- Performance Input Section --- */}
          <div className="space-y-4">
            <h3 className="font-bold text-base text-gray-900">📝 יומן ביצוע</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">משקל בפועל (ק״ג)</Label>
                <Input 
                  type="number" 
                  placeholder="0" 
                  className="bg-gray-50 border-gray-200 text-center font-bold h-11"
                  value={formData.actual_weight}
                  onChange={(e) => setFormData({...formData, actual_weight: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">חזרות / זמן שבוצעו</Label>
                <Input 
                  placeholder="—" 
                  className="bg-gray-50 border-gray-200 text-center font-bold h-11"
                  value={formData.actual_result}
                  onChange={(e) => setFormData({...formData, actual_result: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs text-gray-500">דרגת קושי (RPE)</Label>
                <span className="text-xs font-bold text-[#FF6F20]">{formData.rpe || '-'}/10</span>
              </div>
              <div className="flex gap-1 justify-between bg-gray-50 p-2 rounded-xl border border-gray-100">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <button
                    key={val}
                    onClick={() => setFormData({...formData, rpe: val})}
                    className={`
                      w-7 h-8 rounded flex items-center justify-center text-sm font-bold transition-all
                      ${formData.rpe === val 
                        ? 'bg-[#FF6F20] text-white shadow-md scale-110' 
                        : 'text-gray-400 hover:bg-gray-200'}
                    `}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">הערות אישיות</Label>
              <Textarea 
                placeholder="איך הרגיש? כאבים? הצלחות?"
                className="bg-gray-50 border-gray-200 min-h-[80px] resize-none text-sm"
                value={formData.trainee_feedback}
                onChange={(e) => setFormData({...formData, trainee_feedback: e.target.value})}
              />
            </div>
          </div>

        </div>

        <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <Button 
            onClick={handleSave}
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-[#FF6F20] hover:bg-[#e65b12] text-white font-bold text-base shadow-lg shadow-orange-100"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5 ml-2" /> שמור וסיים תרגיל</>}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}