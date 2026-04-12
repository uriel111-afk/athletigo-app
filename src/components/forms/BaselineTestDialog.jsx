import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Check, Activity, Calendar, Clock } from "lucide-react";

const TECHNIQUES = [
  { id: "basic", label: "Basic" },
  { id: "foot_switch", label: "Foot Switch" },
  { id: "high_knees", label: "High Knees" }
];

// Compact Squared Time Picker (LTR Forced for Min Left / Sec Right)
const CustomTimePicker = ({ label, value, onChange, isOpen }) => {
  const [minutes, seconds] = value.split(':').map(Number);

  const handleChange = (type, val) => {
    let newMin = minutes;
    let newSec = seconds;
    if (type === 'min') newMin = parseInt(val);
    if (type === 'sec') newSec = parseInt(val);
    onChange(`${String(newMin).padStart(2, '0')}:${String(newSec).padStart(2, '0')}`);
  };

  if (!isOpen) return null;

  return null;
};

export default function BaselineTestDialog({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [coach, setCoach] = useState(null);
  const [selectedTraineeId, setSelectedTraineeId] = useState("manual");
  const [manualTraineeName, setManualTraineeName] = useState("");
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [testTime, setTestTime] = useState(new Date().toTimeString().slice(0, 5));
  
  // Global Settings
  const [workDuration, setWorkDuration] = useState("00:30");
  const [restBetweenRounds, setRestBetweenRounds] = useState("00:30");
  const [restBetweenTechniques, setRestBetweenTechniques] = useState("01:00");
  
  // Expanded state for timing tabs
  const [expandedTiming, setExpandedTiming] = useState(null); // 'work', 'rest_rounds', 'rest_tech'

  // Technique Data - Only scores, times are global
  const [techData, setTechniqueData] = useState({
    basic: { rounds: [{ jumps: "", misses: "" }, { jumps: "", misses: "" }, { jumps: "", misses: "" }] },
    foot_switch: { rounds: [{ jumps: "", misses: "" }, { jumps: "", misses: "" }, { jumps: "", misses: "" }] },
    high_knees: { rounds: [{ jumps: "", misses: "" }, { jumps: "", misses: "" }, { jumps: "", misses: "" }] }
  });

  useEffect(() => {
    const loadCoach = async () => {
      const c = await base44.auth.me();
      setCoach(c);
    };
    loadCoach();
  }, []);

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-list'],
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => (u.role === 'user' || u.role === 'trainee') && !u.isCoach);
    },
    initialData: []
  });

  const handleRoundChange = (techId, roundIndex, field, value) => {
    setTechniqueData(prev => {
      const newData = { ...prev };
      const rounds = [...newData[techId].rounds];
      rounds[roundIndex] = { ...rounds[roundIndex], [field]: value };
      newData[techId] = { ...newData[techId], rounds };
      return newData;
    });
  };

  // Derived Calculation Stats
  const calculations = useMemo(() => {
    const stats = {};
    let totalScore = 0;
    let completedTechs = 0;
    let allComplete = true;

    const [wm, ws] = workDuration.split(':').map(Number);
    const workSeconds = (wm * 60) + ws;

    TECHNIQUES.forEach(tech => {
      const data = techData[tech.id];
      const filledRounds = data.rounds.filter(r => r.jumps !== "").length;
      
      const totalJumps = data.rounds.reduce((sum, r) => sum + (parseInt(r.jumps) || 0), 0);
      const avgJumps = totalJumps / 3;
      const baselineScore = workSeconds > 0 ? (avgJumps / workSeconds) : 0;

      if (filledRounds < 3) allComplete = false;
      if (filledRounds === 3) completedTechs++;

      stats[tech.id] = {
        totalJumps,
        avgJumps: avgJumps.toFixed(1),
        score: baselineScore.toFixed(2),
        isComplete: filledRounds === 3
      };

      if (filledRounds === 3) {
        totalScore += baselineScore;
      }
    });

    const overall = completedTechs === 3 ? (totalScore / 3).toFixed(2) : null;
    
    return { stats, overall, allComplete };
  }, [techData, workDuration]);

  const createMutation = useMutation({
    mutationFn: async (data) => base44.entities.ResultsLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      toast.success("✅ מבחן Baseline נשמר בהצלחה");
      onClose();
    },
    onError: () => toast.error("שגיאה בשמירת המבחן")
  });

  const handleSubmit = async () => {
    const selectedTrainee = trainees.find(t => t.id === selectedTraineeId);
    const traineeName = selectedTrainee ? selectedTrainee.full_name : manualTraineeName;

    if (!traineeName) {
      toast.error("נא לבחור או להזין שם מתאמן");
      return;
    }

    if (!calculations.allComplete) {
      if (!window.confirm("חלק מהנתונים חסרים. האם לשמור בכל זאת?")) return;
    }

    // Map to actual results_log columns only
    const payload = {
      trainee_id: selectedTrainee?.id || null,
      date: testDate,
      title: "מבחן Baseline קפיצות בחבל",
      skill_or_exercise: "קפיצות בחבל",
      description: `ציון כללי: ${calculations.overall || 'חלקי'} JPS`,
      record_value: calculations.overall ? String(calculations.overall) : "0",
      record_unit: "jps",
      context: "מבחן שיא",
      effort_level: null,
      created_by: coach?.id || null,
    };

    try {
      await createMutation.mutateAsync(payload);
    } catch (error) {
      console.error("[Baseline] Save error:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[98vw] max-w-3xl h-[95vh] md:h-auto md:max-h-[90vh] flex flex-col p-0 gap-0 bg-white overflow-hidden rounded-xl" dir="rtl">
        
        {/* HEADER */}
        <DialogHeader className="p-4 pb-2 border-b bg-white shrink-0">
          <DialogTitle className="text-xl font-black flex items-center justify-center gap-2 text-black w-full text-center">
            <Activity className="w-5 h-5 text-[#FF6F20]" />
            אתגר Baseline
          </DialogTitle>
        </DialogHeader>

        {/* GLOBAL CONTROLS - Compact 2-Row Layout */}
        <div className="bg-gray-50 p-3 border-b shrink-0 space-y-3">
            {/* Row 1: Who & When */}
            <div className="flex flex-wrap gap-2 items-center justify-between">
                 <div className="flex-1 min-w-[140px]">
                    <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                    <SelectTrigger className="h-9 bg-white text-xs font-bold border-gray-200 shadow-sm">
                        <SelectValue placeholder="בחר מתאמן" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual">-- הזנה ידנית --</SelectItem>
                        {trainees.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                    {selectedTraineeId === "manual" && (
                        <Input 
                            value={manualTraineeName} 
                            onChange={(e) => setManualTraineeName(e.target.value)}
                            placeholder="שם מלא"
                            className="mt-1 h-8 text-xs bg-white"
                        />
                    )}
                 </div>
                 
                 <div className="flex gap-2">
                     <div className="relative">
                         <Calendar className="w-3 h-3 absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
                         <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} className="w-32 h-9 text-xs pr-7 bg-white" />
                     </div>
                     <div className="relative">
                         <Clock className="w-3 h-3 absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
                         <Input type="time" value={testTime} onChange={(e) => setTestTime(e.target.value)} className="w-24 h-9 text-xs pr-7 bg-white" />
                     </div>
                 </div>
            </div>

            {/* Row 2: Timing Settings - Collapsible Tabs */}
            <div className="border-t border-gray-200 pt-2">
                 <div className="grid grid-cols-3 gap-2">
                     {/* Work Duration Tab */}
                     <button 
                        onClick={() => setExpandedTiming(expandedTiming === 'work' ? null : 'work')}
                        className={`flex flex-col items-center p-1.5 rounded-lg transition-all border ${expandedTiming === 'work' ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}
                     >
                        <span className="text-[10px] text-gray-500 font-bold">זמן עבודה</span>
                        <span className={`text-sm font-black ${expandedTiming === 'work' ? 'text-[#FF6F20]' : 'text-gray-800'}`}>
                            {workDuration}
                        </span>
                     </button>

                     {/* Rest Rounds Tab */}
                     <button 
                        onClick={() => setExpandedTiming(expandedTiming === 'rest_rounds' ? null : 'rest_rounds')}
                        className={`flex flex-col items-center p-1.5 rounded-lg transition-all border ${expandedTiming === 'rest_rounds' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}
                     >
                        <span className="text-[10px] text-gray-500 font-bold">מנוחה סבבים</span>
                        <span className={`text-sm font-black ${expandedTiming === 'rest_rounds' ? 'text-blue-600' : 'text-gray-800'}`}>
                            {restBetweenRounds}
                        </span>
                     </button>

                     {/* Rest Tech Tab */}
                     <button 
                        onClick={() => setExpandedTiming(expandedTiming === 'rest_tech' ? null : 'rest_tech')}
                        className={`flex flex-col items-center p-1.5 rounded-lg transition-all border ${expandedTiming === 'rest_tech' ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100'}`}
                     >
                        <span className="text-[10px] text-gray-500 font-bold">מנוחה טכניקות</span>
                        <span className={`text-sm font-black ${expandedTiming === 'rest_tech' ? 'text-purple-600' : 'text-gray-800'}`}>
                            {restBetweenTechniques}
                        </span>
                     </button>
                 </div>

                 {/* Expanded Area */}
                 <CustomTimePicker 
                    isOpen={expandedTiming === 'work'} 
                    label="Work Duration" 
                    value={workDuration} 
                    onChange={setWorkDuration} 
                 />
                 <CustomTimePicker 
                    isOpen={expandedTiming === 'rest_rounds'} 
                    label="Rest Between Rounds" 
                    value={restBetweenRounds} 
                    onChange={setRestBetweenRounds} 
                 />
                 <CustomTimePicker 
                    isOpen={expandedTiming === 'rest_tech'} 
                    label="Rest Between Techniques" 
                    value={restBetweenTechniques} 
                    onChange={setRestBetweenTechniques} 
                 />
            </div>
        </div>

        {/* TABS & CONTENT - Scrollable if needed, but aimed to fit */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
            <Tabs defaultValue="basic" className="flex flex-col h-full">
                <div className="px-3 pt-3 shrink-0">
                    <TabsList className="grid w-full grid-cols-3 h-10 p-1 bg-gray-100 rounded-lg">
                    {TECHNIQUES.map(tech => (
                        <TabsTrigger 
                        key={tech.id} 
                        value={tech.id}
                        className="text-xs font-bold data-[state=active]:bg-[#FF6F20] data-[state=active]:text-white transition-all rounded-md"
                        >
                        {tech.label}
                        </TabsTrigger>
                    ))}
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    {TECHNIQUES.map(tech => (
                    <TabsContent key={tech.id} value={tech.id} className="mt-0 h-full space-y-4">
                        {/* Rounds Inputs */}
                        <div className="grid grid-cols-3 gap-2">
                            {[0, 1, 2].map((roundIndex) => (
                                <div key={roundIndex} className="bg-white rounded-xl border border-gray-200 p-2 shadow-sm">
                                    <div className="text-[10px] font-bold text-gray-400 text-center mb-1 uppercase tracking-wider">Round {roundIndex + 1}</div>
                                    <div className="flex flex-col gap-1">
                                        <Input 
                                            type="number" 
                                            placeholder="קפיצות"
                                            value={techData[tech.id].rounds[roundIndex].jumps}
                                            onChange={(e) => handleRoundChange(tech.id, roundIndex, 'jumps', e.target.value)}
                                            className="text-center font-black text-lg h-10 border-[#FF6F20] focus-visible:ring-[#FF6F20] focus-visible:ring-1"
                                        />
                                        <Input 
                                            type="number" 
                                            placeholder="פספוסים"
                                            value={techData[tech.id].rounds[roundIndex].misses}
                                            onChange={(e) => handleRoundChange(tech.id, roundIndex, 'misses', e.target.value)}
                                            className="text-center text-xs h-7 bg-gray-50 border-transparent placeholder:text-gray-400"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Compact Technique Summary - Directly Below Inputs */}
                        <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
                             <div className="flex flex-col items-center justify-center border-l border-gray-200">
                                 <span className="text-[10px] text-gray-400 font-bold uppercase">סה״כ</span>
                                 <span className="text-sm font-black text-gray-800">{calculations.stats[tech.id].totalJumps}</span>
                             </div>
                             <div className="flex flex-col items-center justify-center border-l border-gray-200">
                                 <span className="text-[10px] text-gray-400 font-bold uppercase">ממוצע</span>
                                 <span className="text-sm font-black text-gray-800">{calculations.stats[tech.id].avgJumps}</span>
                             </div>
                             <div className="flex flex-col items-center justify-center bg-white rounded-md shadow-sm py-1 border border-orange-100">
                                 <span className="text-[9px] text-[#FF6F20] font-bold uppercase">SCORE</span>
                                 <div className="flex items-baseline gap-0.5">
                                    <span className="text-base font-black text-[#FF6F20] leading-none">{calculations.stats[tech.id].score}</span>
                                    <span className="text-[8px] text-gray-400 font-bold">JPS</span>
                                 </div>
                             </div>
                        </div>
                    </TabsContent>
                    ))}
                </div>
            </Tabs>
        </div>

        {/* FOOTER - Global Summary & Actions */}
        <div className="p-3 border-t bg-[#FFF8F3] shrink-0">
             {calculations.overall && (
                 <div className="mb-3 flex justify-between items-center px-2">
                     <span className="font-bold text-sm text-gray-700">ציון Baseline משוקלל:</span>
                     <div className="flex items-baseline gap-1 bg-white px-3 py-1 rounded-lg border border-orange-200 shadow-sm">
                         <span className="text-2xl font-black text-[#FF6F20]">{calculations.overall}</span>
                         <span className="text-xs font-bold text-gray-400">JPS</span>
                     </div>
                 </div>
             )}
             
             <div className="flex gap-2">
                 <Button variant="ghost" onClick={onClose} className="flex-1 h-10 font-bold text-gray-500">
                     ביטול
                 </Button>
                 <Button 
                    onClick={handleSubmit} 
                    disabled={createMutation.isPending}
                    className="flex-[2] h-10 bg-[#FF6F20] hover:bg-[#E65F1D] text-white font-bold rounded-lg shadow-md"
                 >
                     {createMutation.isPending ? <Loader2 className="animate-spin" /> : "שמור תוצאות"}
                 </Button>
             </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}