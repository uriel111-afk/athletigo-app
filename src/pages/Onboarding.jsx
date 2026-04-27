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
import PageLoader from "@/components/PageLoader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import InstallPrompt from "@/components/InstallPrompt";
import OnboardingQuestionnaire from "@/components/forms/OnboardingQuestionnaire";
import OnboardingProgressBar from "@/components/OnboardingProgressBar";

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

// Structured medical questionnaire — each item gets a yes/no choice
// + a free-text follow-up that only appears after "כן". Keys are
// stored in formData.medical_answers and serialized into the
// `health_issues` field on submit so the existing schema is honored.
const MEDICAL_QUESTIONS = [
  { key: 'back_neck_pain',      label: 'כאבי גב או צוואר' },
  { key: 'prior_injuries',      label: 'פציעות קודמות' },
  { key: 'chronic_conditions',  label: 'מחלות כרוניות' },
  { key: 'regular_medications', label: 'תרופות קבועות' },
  { key: 'surgeries',           label: 'ניתוחים בעבר' },
];

// Renders one yes/no medical row + an animated details Textarea.
// Stateless — parent owns the {answer, details} object via `value`
// and `onChange`. Hoisted to module scope so it doesn't remount on
// every parent re-render (which would lose focus mid-typing).
function MedicalQuestion({ label, value, onChange }) {
  const answer  = value?.answer ?? null;
  const details = value?.details ?? '';

  const setAnswer = (next) => {
    // Clearing details when switching back to "לא" mirrors the
    // existing has_limitations toggle behavior — old text shouldn't
    // linger as a hidden ghost answer the coach can't see.
    onChange({ answer: next, details: next ? details : '' });
  };
  const setDetails = (next) => onChange({ answer, details: next });

  return (
    <div className="space-y-2 p-3 rounded-xl border border-gray-100 bg-white">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-gray-900 text-right">{label}</span>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setAnswer(false)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              answer === false
                ? 'bg-[#4CAF50] text-white border-2 border-[#4CAF50]'
                : 'bg-white text-gray-500 border-2 border-gray-200'
            }`}
          >
            לא
          </button>
          <button
            type="button"
            onClick={() => setAnswer(true)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              answer === true
                ? 'bg-[#f44336] text-white border-2 border-[#f44336]'
                : 'bg-white text-gray-500 border-2 border-gray-200'
            }`}
          >
            כן
          </button>
        </div>
      </div>
      {answer === true && (
        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="bg-white border-red-100 focus:border-red-300 min-h-[60px] text-right resize-none text-sm animate-in fade-in slide-in-from-top-2 duration-300"
          placeholder="אילו כאבים/מגבלות את/ה חווה? פרט/י..."
          autoFocus
        />
      )}
    </div>
  );
}

// Step Components defined outside to prevent re-renders losing focus
// Native-select style — same palette as the rest of the form.
// Native selects (vs Radix) avoid portal-vs-dialog focus issues
// and "just work" on every device.
const ONB_NATIVE_SELECT_STYLE = {
  width: '100%', padding: '10px 12px', borderRadius: 12,
  border: '1px solid #F0E4D0', background: '#FFFFFF',
  fontSize: 14, direction: 'rtl', color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', height: 48,
  fontFamily: "'Heebo', 'Assistant', sans-serif",
};
// Subtle "אופציונלי" tag next to optional labels.
const OptionalTag = () => (
  <span className="text-xs font-normal text-gray-400 mr-1">(אופציונלי)</span>
);

const Step1_PersonalInfo = ({ formData, setFormData }) => (
  <div className="space-y-6">
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-bold text-gray-900">בואו נכיר אותך! 👋</h2>
      <p className="text-gray-500">רק שם וטלפון חובה — שאר הפרטים אופציונליים וניתן להשלים בכל רגע.</p>
    </div>

    {/* Required */}
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
    </div>

    {/* Optional section — collapsible visually via the heading + */}
    <div className="space-y-4 pt-2 border-t border-gray-100">
      <div className="text-right text-sm font-bold text-gray-700">פרטים נוספים <OptionalTag /></div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-right block text-sm text-gray-600">אימייל <OptionalTag /></Label>
          <Input
            value={formData.email}
            onChange={e => setFormData({...formData, email: e.target.value})}
            className="bg-white border-gray-100 h-12 text-right"
            placeholder="email@example.com"
            type="email"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-right block text-sm text-gray-600">תאריך לידה <OptionalTag /></Label>
          <Input
            value={formData.birth_date}
            onChange={e => setFormData({...formData, birth_date: e.target.value})}
            className="bg-white border-gray-100 h-12 text-right"
            type="date"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-right block text-sm text-gray-600">גובה (ס״מ) <OptionalTag /></Label>
          <Input
            value={formData.height_cm}
            onChange={e => setFormData({...formData, height_cm: e.target.value})}
            className="bg-white border-gray-100 h-12 text-right"
            placeholder="170"
            type="number"
            min={50} max={250}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-right block text-sm text-gray-600">משקל (ק״ג) <OptionalTag /></Label>
          <Input
            value={formData.weight_kg}
            onChange={e => setFormData({...formData, weight_kg: e.target.value})}
            className="bg-white border-gray-100 h-12 text-right"
            placeholder="75"
            type="number"
            min={20} max={300}
            step="0.1"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-right block text-sm text-gray-600">ניסיון ספורטיבי קודם <OptionalTag /></Label>
        <select
          value={formData.fitness_level}
          onChange={(e) => setFormData({...formData, fitness_level: e.target.value})}
          style={ONB_NATIVE_SELECT_STYLE}
        >
          <option value="">— בחר —</option>
          <option value="ללא ניסיון">ללא ניסיון</option>
          <option value="מתחיל">🌱 מתחיל</option>
          <option value="בינוני">🌿 בינוני</option>
          <option value="מתקדם">🌳 מתקדם</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-right block text-sm text-gray-600">איך הגעת אלינו? <OptionalTag /></Label>
        <select
          value={formData.referral_source}
          onChange={(e) => setFormData({...formData, referral_source: e.target.value})}
          style={ONB_NATIVE_SELECT_STYLE}
        >
          <option value="">— בחר —</option>
          <option value="instagram">📸 אינסטגרם</option>
          <option value="facebook">📘 פייסבוק</option>
          <option value="friend">🤝 חבר/ה</option>
          <option value="google">🔍 גוגל</option>
          <option value="other">✨ אחר</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-right block text-sm text-gray-600">פציעות או מגבלות <OptionalTag /></Label>
        <Textarea
          value={formData.medical_history}
          onChange={e => setFormData({...formData, medical_history: e.target.value})}
          className="bg-white border-gray-100 min-h-[70px] text-right resize-none"
          placeholder="ספר/י על פציעות או מגבלות שחשוב שהמאמן ידע..."
        />
      </div>

      <p className="text-xs text-gray-500 text-right pt-1">
        ניתן להשלים פרטים נוספים בכל שלב מתוך הפרופיל שלך.
      </p>
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        {/* Structured medical questionnaire — five yes/no questions
            with conditional details fields. Each "כן" reveals a
            text input that fades in (animation lives inside the
            MedicalQuestion component). The answers are merged into
            `health_issues` on submit. */}
        <div className="space-y-2 pt-2 mt-2 border-t border-gray-100">
          <Label className="text-right block font-bold text-gray-900">שאלון רפואי מפורט</Label>
          <p className="text-xs text-gray-500 text-right mb-2">
            מענה לכל אחת מהשאלות עוזר לי לבנות לך תוכנית בטוחה ומותאמת.
          </p>
          {MEDICAL_QUESTIONS.map((q) => (
            <MedicalQuestion
              key={q.key}
              label={q.label}
              value={formData.medical_answers?.[q.key]}
              onChange={(next) => setFormData({
                ...formData,
                medical_answers: {
                  ...(formData.medical_answers || {}),
                  [q.key]: next,
                },
              })}
            />
          ))}
        </div>

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
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const queryClient = useQueryClient();

  // Form State
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
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
    health_declaration_approved: false,
    // Optional profile fields surfaced in Step1 (NEW columns added
    // by 20260427_users_optional_profile.sql + reuse of existing
    // medical_history / fitness_level columns).
    height_cm: "",
    weight_kg: "",
    medical_history: "",
    referral_source: "",
    // OnboardingQuestionnaire (Step 2) — single object so the
    // wizard's controlled value/onChange API is one prop.
    questionnaire: {
      training_goal:        '',
      fitness_level:        '',
      preferred_frequency:  '',
      current_challenges:   [],
      training_preferences: [],
      additional_notes:     '',
    },
    // Structured medical questionnaire — { answer: bool|null, details: string }
    // per question key. Defaults to all-null so nothing is implicitly
    // claimed before the trainee actually answers.
    medical_answers: {
      back_neck_pain:      { answer: null, details: '' },
      prior_injuries:      { answer: null, details: '' },
      chronic_conditions:  { answer: null, details: '' },
      regular_medications: { answer: null, details: '' },
      surgeries:           { answer: null, details: '' },
    },
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
            email: currentUser.email || "",
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
    mutationFn: async (data) => {
      console.log("[Onboarding] updateUserMutation called with data:", data);
      const result = await base44.auth.updateMe(data);
      console.log("[Onboarding] updateUserMutation result:", result);
      return result;
    },
    onSuccess: (result) => {
      console.log("[Onboarding] updateUserMutation onSuccess:", result);
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
    onError: (error) => {
      console.error("[Onboarding] updateUserMutation onError:", error);
    }
  });

  const notifyCoachMutation = useMutation({
    mutationFn: async () => {
      console.log("[Onboarding] notifyCoachMutation called");
      // Find the coach (admin) to notify
      let coachId = user?.created_by;
      console.log("[Onboarding] Initial coachId from user.created_by:", coachId);

      // If created_by is self or null, find the main coach
      if (!coachId || coachId === user.id) {
        console.log("[Onboarding] Finding coach from users list...");
        try {
          const users = await base44.entities.User.list(); // Assuming coach is visible
          const coach = users.find(u => u.role === 'coach' || u.role === 'admin');
          if (coach) {
            coachId = coach.id;
            console.log("[Onboarding] Found coach:", coach.full_name, coachId);
          } else {
            console.log("[Onboarding] No coach found in users list");
          }
        } catch (err) {
          console.error("[Onboarding] Error finding coach for notification:", err);
        }
      }

      if (coachId) {
        console.log("[Onboarding] Creating notification for coach:", coachId);
        const traineeName = formData.full_name || user.full_name || 'המתאמן/ת';
        await base44.entities.Notification.create({
          user_id: coachId,
          type: 'onboarding_complete',
          title: '🎉 מתאמן/ת חדש/ה סיים/ה הרשמה',
          message: `${traineeName} השלים/ה את תהליך ההרשמה — לצפייה בפרטים`,
          link: `/TraineeProfile?userId=${user.id}`,
          is_read: false,
          data: { trainee_id: user.id, trainee_name: traineeName },
        });
        console.log("[Onboarding] Notification created successfully");
      } else {
        console.log("[Onboarding] No coachId found, skipping notification");
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
      case 1: // Mandatory: name + phone only. Email / birth_date /
              // height / weight / fitness_level / medical_history /
              // referral_source are all optional and can be filled
              // later from the trainee profile.
        return !!(formData.full_name && formData.phone);
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
    console.log("[Onboarding] handleComplete called");
    console.log("[Onboarding] formData:", formData);
    console.log("[Onboarding] user:", user);

    if (updateUserMutation.isPending) {
      console.log("[Onboarding] Mutation already pending, returning");
      return;
    }

    try {
      console.log("[Onboarding] Starting fault-tolerant completion process");

      // Merge other_goal into training_goals
      let finalGoals = [...formData.training_goals];
      if (formData.other_goal) {
        finalGoals.push(formData.other_goal);
      }

      console.log("[Onboarding] Final goals:", finalGoals);

      // CRITICAL: These fields MUST be updated to mark onboarding as
      // complete. client_status flips onboarding → casual so the
      // trainee's TraineeHome shows the casual experience (sessions
      // + messages only) until the coach sells a package and bumps
      // them to active. The coach can also flip to 'active' manually
      // from the profile badge if they want the full app immediately.
      const criticalData = {
        onboarding_completed: true,
        role: "trainee",
        client_status: "casual",
      };

      // Fold the structured medical answers into health_issues so
      // the existing `users.health_issues` column captures both the
      // free-form text and the questionnaire details. Each "כן"
      // answer becomes one labeled line; "לא" rows are skipped.
      const medicalLines = MEDICAL_QUESTIONS
        .filter((q) => formData.medical_answers?.[q.key]?.answer === true)
        .map((q) => {
          const details = (formData.medical_answers[q.key].details || '').trim();
          return details ? `${q.label}: ${details}` : `${q.label}: כן`;
        });
      const fullHealthIssues = [formData.health_issues?.trim(), ...medicalLines]
        .filter(Boolean)
        .join('\n');

      // OPTIONAL: These fields are nice-to-have but shouldn't block
      // completion. Numbers are parsed only when the user actually
      // entered something so we don't write a stray 0.
      const optionalData = {
        full_name: formData.full_name,
        phone: formData.phone,
        birth_date: formData.birth_date ? new Date(formData.birth_date).toISOString() : null,
        training_goals: finalGoals,
        sport_background: formData.sport_background,
        fitness_level: formData.fitness_level,
        health_issues: fullHealthIssues,
        health_declaration_accepted: true,
        training_frequency: formData.training_frequency,
        motivation: formData.motivation,
        preferred_training_style: formData.preferred_training_style,
        onboarding_notes: formData.onboarding_notes,
        // New optional profile columns (per
        // 20260427_users_optional_profile.sql migration). The
        // base44Client 42703 retry layer drops these silently if the
        // migration hasn't been run yet, so the save still succeeds.
        height_cm: formData.height_cm ? parseInt(formData.height_cm, 10) : null,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg)   : null,
        medical_history: formData.medical_history || null,
        referral_source: formData.referral_source || null,
        // OnboardingQuestionnaire (Step 2) results — added by
        // 20260427_onboarding_questionnaire.sql. JSONB columns
        // accept null for "not answered". The retry layer drops
        // any column the live schema is missing.
        preferred_frequency:  formData.questionnaire?.preferred_frequency  || null,
        current_challenges:   formData.questionnaire?.current_challenges?.length    ? formData.questionnaire.current_challenges    : null,
        training_preferences: formData.questionnaire?.training_preferences?.length  ? formData.questionnaire.training_preferences  : null,
        additional_notes:     formData.questionnaire?.additional_notes     || null,
      };

      // Merge the questionnaire's chosen goals (now multi-select)
      // into the canonical training_goals[] column. Be lenient about
      // legacy single-string values from older drafts.
      const qGoalRaw = formData.questionnaire?.training_goal;
      const qGoals = Array.isArray(qGoalRaw) ? qGoalRaw : (qGoalRaw ? [qGoalRaw] : []);
      if (qGoals.length) {
        const existing = Array.isArray(optionalData.training_goals) ? optionalData.training_goals : [];
        const merged = [...qGoals, ...existing.filter(g => !qGoals.includes(g))];
        optionalData.training_goals = merged;
      }
      // Same for fitness_level — questionnaire wins over Step1's
      // optional native select if both were filled.
      if (formData.questionnaire?.fitness_level) {
        optionalData.fitness_level = formData.questionnaire.fitness_level;
      }

      // Combine data with critical fields taking precedence
      const updateData = { ...optionalData, ...criticalData };

      console.log("[Onboarding] Update data prepared:", updateData);
      console.log("[Onboarding] Calling updateUserMutation with fault-tolerance...");

      try {
        await updateUserMutation.mutateAsync(updateData);
        console.log("[Onboarding] updateUserMutation completed successfully");

        // Seed the measurements table with the trainee's first
        // height/weight reading so the coach has a baseline to track
        // progress against. Best-effort — failure here doesn't block
        // onboarding completion. Both column-name shapes are written
        // (height/weight + height_cm/weight_kg) so the row lands
        // regardless of which schema this install uses; base44's
        // 42703 retry layer drops missing columns silently.
        const heightNum = formData.height_cm ? parseInt(formData.height_cm, 10) : null;
        const weightNum = formData.weight_kg ? parseFloat(formData.weight_kg) : null;
        if (user?.id && (heightNum || weightNum)) {
          try {
            await base44.entities.Measurement.create({
              trainee_id: user.id,
              user_id: user.coach_id || null,
              date: new Date().toISOString().split('T')[0],
              source: 'onboarding',
              notes: 'מדידה ראשונה — אונבורדינג',
              height: heightNum,
              weight: weightNum,
              height_cm: heightNum,
              weight_kg: weightNum,
            });
            console.log("[Onboarding] seeded baseline measurement row");
          } catch (mErr) {
            console.warn("[Onboarding] measurement seed failed (non-critical):", mErr?.message);
          }
        }
      } catch (updateError) {
        console.error("[Onboarding] updateUserMutation error:", updateError);
        // Try with only critical fields if full update fails
        console.log("[Onboarding] Retrying with critical fields only:", criticalData);
        try {
          await updateUserMutation.mutateAsync(criticalData);
          console.log("[Onboarding] Retry with critical fields succeeded");
          toast.warning("חלק מהשדות לא נשמרו, אך תהליך האונבורדינג הושלם");
        } catch (criticalError) {
          console.error("[Onboarding] Critical update failed:", criticalError);
          throw criticalError; // Re-throw if critical fields fail
        }
      }

      // Notify coach - but don't fail the whole process if it fails
      console.log("[Onboarding] Attempting coach notification (optional)...");
      try {
        await notifyCoachMutation.mutateAsync();
        console.log("[Onboarding] notifyCoachMutation completed successfully");
      } catch (notifyError) {
        console.warn("[Onboarding] Coach notification failed (non-critical):", notifyError);
        // Don't block completion if notification fails
      }

      console.log("[Onboarding] Onboarding completion successful!");
      toast.success("תהליך האונבורדינג הושלם בהצלחה!");

      // Show install prompt if not shown before, then redirect
      if (localStorage.getItem('install_prompt_shown') !== 'true') {
        setShowInstallPrompt(true);
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
        window.location.href = createPageUrl("TraineeHome");
      }
      
    } catch (error) {
      console.error("[Onboarding] Completion error:", error);
      console.error("[Onboarding] Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      toast.error("שגיאה בשמירת הנתונים. נסה שוב.");
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    // Wrapper: no vertical centering so tall content flows from the
    // top and the page itself scrolls naturally. `items-start` keeps
    // the card pinned to the top of the viewport, `py-6` adds breathing
    // room above + below. Card no longer uses overflow-hidden — that
    // was clipping the medical questionnaire and trapping scroll.
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col items-center py-6 px-4" dir="rtl">
      {/* Install prompt — shown once after onboarding completes */}
      {showInstallPrompt && (
        <InstallPrompt onDismiss={() => {
          setShowInstallPrompt(false);
          setTimeout(() => { window.location.href = createPageUrl("TraineeHome"); }, 300);
        }} />
      )}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-sm p-6 md:p-8 relative">
        {/* Outer onboarding progress bar — covers the full 4-step
            casual flow (פרטים → היכרות → הצהרת בריאות → תשלום ואישור).
            The questionnaire keeps its own inner 4-dot indicator for
            its sub-screens, so the trainee sees both layers. */}
        <OnboardingProgressBar currentStep={step === 1 ? 'details' : 'questionnaire'} />

        {/* Logo */}
        <div className="flex justify-center mb-6 mt-2">
          <img src={LOGO_MAIN} alt="Logo" className="h-12 object-contain" />
        </div>

        {/* Content — Step 1 = personal info, Step 2 = the new
            OnboardingQuestionnaire (replaces the legacy Step2_Goals
            / Step3_Profile / Step4_Preferences trio). */}
        <div className="min-h-[400px]">
          {step === 1 && (
            <Step1_PersonalInfo formData={formData} setFormData={setFormData} />
          )}
          {step === 2 && (
            <OnboardingQuestionnaire
              value={formData.questionnaire}
              onChange={(next) => setFormData(prev => ({ ...prev, questionnaire: next }))}
              onComplete={handleComplete}
              onSkip={handleComplete}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex gap-3">
          {/* Outer nav. Step 1: just "המשך" → Step 2 (questionnaire).
              Step 2: only the "← חזור" affordance, since the
              questionnaire renders its own next + back + complete
              buttons internally and calls handleComplete via
              onComplete prop. */}
          {step === 1 && (
            <Button
              onClick={handleNext}
              className="flex-1 h-12 rounded-xl bg-[#FF6F20] hover:bg-[#E65100] text-white font-bold shadow-md hover:shadow-lg transition-all"
            >
              המשך
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
          )}
          {step === 2 && (
            <Button
              onClick={handleBack}
              variant="outline"
              className="flex-1 h-12 rounded-xl border-gray-200 font-bold text-gray-600 hover:bg-gray-50"
            >
              <ArrowRight className="w-4 h-4 ml-2" />
              חזור לפרטים
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}