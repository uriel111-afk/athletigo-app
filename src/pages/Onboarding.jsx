import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const LOGO_MAIN = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/f4582ad21_Untitleddesign1.png";

// Constants moved outside
const GOAL_OPTIONS = [
  "חיטוב הגוף",
  "ירידה במשקל",
  "עלייה במסת שריר",
  "שיפור הכושר הגופני",
  "פיתוח מיומנויות (קליסטניקס / גמישות / כוח)",
  "שיקום פציעות",
  "שיפור תנועה כללית",
  "התמדה ואורח חיים בריא"
];

const FITNESS_LEVELS = ["מתחיל", "בינוני", "מתקדם"];
const TRAINING_STYLES = ["אישי", "קבוצה", "אונליין", "תוכנית עצמאית"];

// Step Components defined outside to prevent re-renders losing focus
const Step1_PersonalInfo = ({ formData, setFormData }) => (
  <div className="space-y-6">
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-bold text-gray-900">בואו נכיר אותך! 👋</h2>
      <p className="text-gray-500">פרטים אישיים בסיסיים ליצירת הקשר</p>
    </div>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-right block font-bold">שם מלא *</Label>
        <Input 
          value={formData.full_name}
          onChange={e => setFormData({...formData, full_name: e.target.value})}
          className="bg-white border-gray-200 h-12 text-right"
          placeholder="ישראל ישראלי"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-right block font-bold">טלפון *</Label>
        <Input 
          value={formData.phone}
          onChange={e => setFormData({...formData, phone: e.target.value})}
          className="bg-white border-gray-200 h-12 text-right"
          placeholder="050-0000000"
          type="tel"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-right block font-bold">תאריך לידה *</Label>
        <Input 
          value={formData.birth_date}
          onChange={e => setFormData({...formData, birth_date: e.target.value})}
          className="bg-white border-gray-200 h-12 text-right"
          type="date"
        />
      </div>
    </div>
  </div>
);

const Step2_Goals = ({ formData, setFormData, handleGoalToggle }) => (
  <div className="space-y-6">
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-bold text-gray-900">המטרות שלך 🎯</h2>
      <p className="text-gray-500">בחר/י את כל המטרות שרלוונטיות אליך</p>
    </div>

    <div className="grid grid-cols-1 gap-3">
      {GOAL_OPTIONS.map(goal => (
        <div 
          key={goal}
          onClick={() => handleGoalToggle(goal)}
          className={`
            p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between
            ${formData.training_goals.includes(goal) 
              ? 'border-[#FF6F20] bg-orange-50' 
              : 'border-gray-100 bg-white hover:border-gray-200'}
          `}
        >
          <span className={`font-medium ${formData.training_goals.includes(goal) ? 'text-[#FF6F20]' : 'text-gray-700'}`}>
            {goal}
          </span>
          {formData.training_goals.includes(goal) && (
            <div className="bg-[#FF6F20] rounded-full p-1">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      ))}
      
      <div className="space-y-2 mt-2">
        <Label className="text-right block font-bold text-gray-700">אחר</Label>
        <Input 
          value={formData.other_goal}
          onChange={e => setFormData({...formData, other_goal: e.target.value})}
          className="bg-white border-gray-200 h-12 text-right"
          placeholder="מטרה אחרת..."
        />
      </div>
    </div>
  </div>
);

const Step3_Profile = ({ formData, setFormData }) => (
  <div className="space-y-6">
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-bold text-gray-900">הפרופיל שלך 💪</h2>
      <p className="text-gray-500">עזור לי להכיר את הגוף והיכולות שלך</p>
    </div>

    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-right block font-bold">מה הרקע הספורטיבי שלך?</Label>
        <Textarea 
          value={formData.sport_background}
          onChange={e => setFormData({...formData, sport_background: e.target.value})}
          className="bg-white border-gray-200 min-h-[80px] text-right resize-none"
          placeholder="התאמנתי בעבר ב..."
        />
      </div>

      <div className="space-y-2">
        <Label className="text-right block font-bold">רמת כושר נוכחית</Label>
        <Select 
          value={formData.fitness_level} 
          onValueChange={val => setFormData({...formData, fitness_level: val})}
        >
          <SelectTrigger className="w-full h-12 bg-white border-gray-200 text-right" dir="rtl">
            <SelectValue placeholder="בחר רמה" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {FITNESS_LEVELS.map(level => (
              <SelectItem key={level} value={level}>{level}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <Label className="text-right block font-bold text-gray-900">מצב בריאותי כללי *</Label>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setFormData({ ...formData, has_limitations: false, health_issues: "" })}
            className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${
              formData.has_limitations === false
                ? "border-[#4CAF50] bg-green-50 text-[#2E7D32]"
                : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
            }`}
          >
            כשיר לפעילות / אין מגבלות
          </button>
          <button
            onClick={() => setFormData({ ...formData, has_limitations: true })}
            className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${
              formData.has_limitations === true
                ? "border-[#f44336] bg-red-50 text-[#c62828]"
                : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
            }`}
          >
            יש לי מגבלה / פציעה
          </button>
        </div>

        {formData.has_limitations === false && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <Label className="text-right block text-xs text-gray-400">הערה (לא חובה)</Label>
            <Input
              value={formData.health_issues}
              onChange={(e) => setFormData({ ...formData, health_issues: e.target.value })}
              className="bg-white border-gray-200 text-right h-10 text-sm"
              placeholder="הכל תקין..."
            />
          </div>
        )}

        {formData.has_limitations === true && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <Label className="text-right block font-bold text-[#c62828]">פרטי המגבלה / הפציעה *</Label>
            <Textarea
              value={formData.health_issues}
              onChange={(e) => setFormData({ ...formData, health_issues: e.target.value })}
              className="bg-white border-red-100 focus:border-red-300 min-h-[80px] text-right resize-none"
              placeholder="אנא פרט/י כאן..."
            />
          </div>
        )}

        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 mt-2">
          <Checkbox 
            id="health-declare" 
            checked={formData.health_declaration_approved}
            onCheckedChange={(checked) => setFormData({ ...formData, health_declaration_approved: checked })}
            className="mt-1 data-[state=checked]:bg-[#FF6F20] data-[state=checked]:border-[#FF6F20]"
          />
          <label htmlFor="health-declare" className="text-xs text-gray-600 leading-relaxed cursor-pointer select-none">
            אני מאשר/ת שהמידע שמסרתי מדויק, ומבין/ה את הסיכונים הכרוכים בפעילות גופנית. הצהרה זו מהווה אישור רפואי להשתתפות.
          </label>
        </div>
      </div>
    </div>
  </div>
);

const Step4_Preferences = ({ formData, setFormData }) => (
  <div className="space-y-6">
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-bold text-gray-900">העדפות אימון 📅</h2>
      <p className="text-gray-500">בוא נתאים את המסגרת הנכונה עבורך</p>
    </div>

    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-right block font-bold">כמה פעמים בשבוע תרצה/י להתאמן?</Label>
        <Input 
          value={formData.training_frequency}
          onChange={e => setFormData({...formData, training_frequency: e.target.value})}
          className="bg-white border-gray-200 h-12 text-right"
          placeholder="למשל: 3 פעמים"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-right block font-bold">סגנון אימון מועדף</Label>
        <Select 
          value={formData.preferred_training_style} 
          onValueChange={val => setFormData({...formData, preferred_training_style: val})}
        >
          <SelectTrigger className="w-full h-12 bg-white border-gray-200 text-right" dir="rtl">
            <SelectValue placeholder="בחר סגנון" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {TRAINING_STYLES.map(style => (
              <SelectItem key={style} value={style}>{style}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-right block font-bold">מה הכי מניע אותך להתחיל עכשיו?</Label>
        <Textarea 
          value={formData.motivation}
          onChange={e => setFormData({...formData, motivation: e.target.value})}
          className="bg-white border-gray-200 min-h-[80px] text-right resize-none"
          placeholder="אני רוצה להרגיש..."
        />
      </div>

      <div className="space-y-2">
        <Label className="text-right block font-bold">הערות נוספות</Label>
        <Textarea 
          value={formData.onboarding_notes}
          onChange={e => setFormData({...formData, onboarding_notes: e.target.value})}
          className="bg-white border-gray-200 min-h-[80px] text-right resize-none"
          placeholder="כל דבר אחר שחשוב לדעת..."
        />
      </div>
    </div>
  </div>
);

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  // Form State
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    birth_date: "",
    training_goals: [],
    other_goal: "",
    sport_background: "",
    fitness_level: "",
    health_issues: "",
    training_frequency: "",
    motivation: "",
    preferred_training_style: "",
    onboarding_notes: "",
    has_limitations: null,
    health_declaration_approved: false
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        if (currentUser?.onboarding_completed) {
          window.location.href = createPageUrl("TraineeHome");
          return;
        }

        if (currentUser) {
          setFormData(prev => ({
            ...prev,
            full_name: currentUser.full_name || "",
            phone: currentUser.phone || "",
            birth_date: currentUser.birth_date ? currentUser.birth_date.split('T')[0] : "",
            training_goals: currentUser.training_goals || [],
            // other fields
          }));
        }
      } catch (error) {
        console.error("[Onboarding] Error loading user:", error);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const updateUserMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    }
  });

  const notifyCoachMutation = useMutation({
    mutationFn: async () => {
      // Find the coach (admin) to notify
      let coachId = user?.created_by;
      
      // If created_by is self or null, find the main coach
      if (!coachId || coachId === user.id) {
        try {
          const users = await base44.entities.User.list(); // Assuming coach is visible
          const coach = users.find(u => u.isCoach === true || u.role === 'admin');
          if (coach) coachId = coach.id;
        } catch (err) {
          console.error("Error finding coach for notification", err);
        }
      }

      if (coachId) {
        await base44.entities.Notification.create({
          userId: coachId,
          type: "system",
          title: "אונבורדינג הושלם 🚀",
          message: `המתאמן ${formData.full_name || user.full_name} נרשם והשלים את תהליך האונבורדינג בהצלחה.`,
          isRead: false,
          relatedEntityType: "user",
          relatedEntityId: user.id,
          actionUrl: createPageUrl("TraineeProfile") + `?userId=${user.id}`
        });
      }
    }
  });

  const handleNext = () => {
    if (!isStepValid()) {
      toast.error("נא למלא את כל שדות החובה");
      return;
    }
    setStep(prev => prev + 1);
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
    window.scrollTo(0, 0);
  };

  const isStepValid = () => {
    switch (step) {
      case 1: // Mandatory Info
        return formData.full_name && formData.phone && formData.birth_date;
      case 2: // Goals
        return true; 
      default:
        return true;
    }
  };

  const handleGoalToggle = (goal) => {
    setFormData(prev => {
      const goals = prev.training_goals || [];
      if (goals.includes(goal)) {
        return { ...prev, training_goals: goals.filter(g => g !== goal) };
      } else {
        return { ...prev, training_goals: [...goals, goal] };
      }
    });
  };

  const handleComplete = async () => {
    if (updateUserMutation.isPending) return;

    try {
      // Merge other_goal into training_goals
      let finalGoals = [...formData.training_goals];
      if (formData.other_goal) {
        finalGoals.push(formData.other_goal);
      }

      const updateData = {
        full_name: formData.full_name,
        phone: formData.phone,
        birth_date: new Date(formData.birth_date).toISOString(),
        training_goals: finalGoals,
        sport_background: formData.sport_background,
        fitness_level: formData.fitness_level,
        health_issues: formData.health_issues,
        health_declaration_accepted: true,
        training_frequency: formData.training_frequency,
        motivation: formData.motivation,
        preferred_training_style: formData.preferred_training_style,
        onboarding_notes: formData.onboarding_notes,
        
        // Role Logic
        role: "trainee",
        onboarding_completed: true
      };

      await updateUserMutation.mutateAsync(updateData);
      await notifyCoachMutation.mutateAsync();

      toast.success("תהליך האונבורדינג הושלם בהצלחה! 🎉");
      setTimeout(() => {
        window.location.href = createPageUrl("MyPlan");
      }, 1500);

    } catch (error) {
      console.error("Onboarding completion error:", error);
      toast.error("שגיאה בשמירת הנתונים. נסה שוב.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-sm p-6 md:p-8 relative overflow-hidden">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-100">
          <div 
            className="h-full bg-[#FF6F20] transition-all duration-500 ease-out"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-6 mt-2">
          <img src={LOGO_MAIN} alt="Logo" className="h-12 object-contain" />
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {step === 1 && <Step1_PersonalInfo formData={formData} setFormData={setFormData} />}
          {step === 2 && <Step2_Goals formData={formData} setFormData={setFormData} handleGoalToggle={handleGoalToggle} />}
          {step === 3 && <Step3_Profile formData={formData} setFormData={setFormData} />}
          {step === 4 && <Step4_Preferences formData={formData} setFormData={setFormData} />}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <Button 
              onClick={handleBack}
              variant="outline"
              className="flex-1 h-12 rounded-xl border-gray-200 font-bold text-gray-600 hover:bg-gray-50"
            >
              <ArrowRight className="w-4 h-4 ml-2" />
              חזור
            </Button>
          )}
          
          {step < 4 ? (
            <Button 
              onClick={handleNext}
              className="flex-1 h-12 rounded-xl bg-[#FF6F20] hover:bg-[#E65100] text-white font-bold shadow-md hover:shadow-lg transition-all"
            >
              המשך
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
          ) : (
            <Button 
              onClick={handleComplete}
              disabled={updateUserMutation.isPending}
              className="flex-1 h-12 rounded-xl bg-[#FF6F20] hover:bg-[#E65100] text-white font-bold shadow-md hover:shadow-lg transition-all"
            >
              {updateUserMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "סיום והתחלה! 🚀"
              )}
            </Button>
          )}
        </div>

        {/* Step Indicator */}
        <div className="mt-6 text-center text-sm text-gray-400 font-medium">
          שלב {step} מתוך 4
        </div>
      </div>
    </div>
  );
}