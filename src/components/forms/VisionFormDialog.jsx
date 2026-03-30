import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Target, Telescope, Trophy, Calendar, Heart, ShieldAlert, MessageSquare } from "lucide-react";

export default function VisionFormDialog({ isOpen, onClose, initialData, onSubmit, isCoach, isLoading }) {
  const [formData, setFormData] = useState({
    mainGoalShort: "",
    mainGoalWhy: "",
    longTermVision: "",
    keySkills: "",
    trainingFrequency: "",
    mainMotivation: "",
    obstacles: "",
    coachNotesOnVision: ""
  });

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        mainGoalShort: initialData.mainGoalShort || "",
        mainGoalWhy: initialData.mainGoalWhy || "",
        longTermVision: initialData.longTermVision || "",
        keySkills: initialData.keySkills || "",
        trainingFrequency: initialData.trainingFrequency || "",
        mainMotivation: initialData.mainMotivation || "",
        obstacles: initialData.obstacles || "",
        coachNotesOnVision: initialData.coachNotesOnVision || ""
      });
    }
  }, [isOpen, initialData]);

  const handleSubmit = () => {
    onSubmit(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center md:text-right">עריכת מטרות וחזון</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* 1. Main Goal Short */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <Target className="w-4 h-4 text-[#FF6F20]" />
              מטרה מרכזית
            </Label>
            <Input 
              value={formData.mainGoalShort}
              onChange={(e) => setFormData({...formData, mainGoalShort: e.target.value})}
              placeholder="לדוגמה: לעשות 5 עליות מתח, לרוץ 5 ק״מ בלי לעצור…"
              className="bg-gray-50 border-gray-200 focus:border-[#FF6F20] focus:ring-[#FF6F20]"
            />
            <p className="text-xs text-gray-500">משפט אחד קצר שמתאר את המטרה הכי חשובה לך כרגע.</p>
          </div>

          {/* 2. Main Goal Why */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <Heart className="w-4 h-4 text-[#FF6F20]" />
              למה המטרה הזאת חשובה לך?
            </Label>
            <Textarea 
              value={formData.mainGoalWhy}
              onChange={(e) => setFormData({...formData, mainGoalWhy: e.target.value})}
              placeholder="איך זה ישפיע עליך ביום־יום? על הבריאות, הביטחון, ההרגשה בגוף?"
              className="bg-gray-50 border-gray-200 min-h-[80px] resize-none focus:border-[#FF6F20] focus:ring-[#FF6F20]"
            />
            <p className="text-xs text-gray-500">תכתוב/י בכמה משפטים מה יקרה בחיים שלך כשתשיג/י את המטרה.</p>
          </div>

          {/* 3. Long Term Vision */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <Telescope className="w-4 h-4 text-[#FF6F20]" />
              איך אתה רוצה שהחיים הספורטיביים שלך ייראו בעוד שנה?
            </Label>
            <Textarea 
              value={formData.longTermVision}
              onChange={(e) => setFormData({...formData, longTermVision: e.target.value})}
              placeholder="איך אתה מתאמן? מה אתה כבר עושה בקלות? איך אתה מרגיש בגוף ובנפש?"
              className="bg-gray-50 border-gray-200 min-h-[100px] resize-none focus:border-[#FF6F20] focus:ring-[#FF6F20]"
            />
            <p className="text-xs text-gray-500">דמיין/י את עצמך בעתיד – תכתוב/י כאילו זה כבר קרה.</p>
          </div>

          {/* 4. Key Skills */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <Trophy className="w-4 h-4 text-[#FF6F20]" />
              איזה מיומנויות חשוב לך לפתח?
            </Label>
            <Textarea 
              value={formData.keySkills}
              onChange={(e) => setFormData({...formData, keySkills: e.target.value})}
              placeholder="לדוגמה: קפיצה בחבל, סיבובי מקל, עמידת ידיים, פלאנץ', גמישות…"
              className="bg-gray-50 border-gray-200 min-h-[60px] resize-none focus:border-[#FF6F20] focus:ring-[#FF6F20]"
            />
            <p className="text-xs text-gray-500">רשום/י את המיומנויות שהכי מסקרנות אותך.</p>
          </div>

          {/* 5. Training Frequency */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <Calendar className="w-4 h-4 text-[#FF6F20]" />
              כמה פעמים בשבוע היית רוצה להתאמן?
            </Label>
            <Select 
              value={formData.trainingFrequency} 
              onValueChange={(val) => setFormData({...formData, trainingFrequency: val})}
            >
              <SelectTrigger className="bg-gray-50 border-gray-200 text-right focus:ring-[#FF6F20]">
                <SelectValue placeholder="בחר תדירות" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="1-2 אימונים">1-2 אימונים</SelectItem>
                <SelectItem value="2-3 אימונים">2-3 אימונים</SelectItem>
                <SelectItem value="3-4 אימונים">3-4 אימונים</SelectItem>
                <SelectItem value="4-5 אימונים">4-5 אימונים</SelectItem>
                <SelectItem value="5+ אימונים">5+ אימונים</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">נגדיר יחד קצב שמתאים לחיים שלך.</p>
          </div>

          {/* 6. Main Motivation */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <Target className="w-4 h-4 text-[#FF6F20]" />
              מה הכי מניע אותך להתמיד באימונים?
            </Label>
            <Textarea 
              value={formData.mainMotivation}
              onChange={(e) => setFormData({...formData, mainMotivation: e.target.value})}
              placeholder="בריאות, ביטחון עצמי, שקט נפשי, דוגמה לילדים, הופעה חיצונית…"
              className="bg-gray-50 border-gray-200 min-h-[60px] resize-none focus:border-[#FF6F20] focus:ring-[#FF6F20]"
            />
            <p className="text-xs text-gray-500">מה הסיבה העמוקה שעושה לך חשק לזוז?</p>
          </div>

          {/* 7. Obstacles */}
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2 text-gray-900">
              <ShieldAlert className="w-4 h-4 text-[#FF6F20]" />
              מה עלול להקשות עליך להתמיד? (אופציונלי)
            </Label>
            <Textarea 
              value={formData.obstacles}
              onChange={(e) => setFormData({...formData, obstacles: e.target.value})}
              placeholder="חוסר זמן, עומס עבודה, פחד מפציעה, חוסר מסגרת…"
              className="bg-gray-50 border-gray-200 min-h-[60px] resize-none focus:border-[#FF6F20] focus:ring-[#FF6F20]"
            />
            <p className="text-xs text-gray-500">תזכיר/י לעצמך מראש איפה האתגר, כדי שנוכל לבנות פתרון.</p>
          </div>

          {/* 8. Coach Notes (Coach Only) */}
          {isCoach && (
            <div className="space-y-2 p-4 bg-orange-50 rounded-xl border border-orange-100">
              <Label className="font-bold flex items-center gap-2 text-[#FF6F20]">
                <MessageSquare className="w-4 h-4" />
                הערות המאמן על המטרות והחזון
              </Label>
              <Textarea 
                value={formData.coachNotesOnVision}
                onChange={(e) => setFormData({...formData, coachNotesOnVision: e.target.value})}
                placeholder="הערות פנימיות למאמן..."
                className="bg-white border-orange-200 min-h-[80px] resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row sm:justify-start gap-2">
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading}
            className="flex-1 bg-[#FF6F20] hover:bg-[#E65100] text-white font-bold"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור חזון"}
          </Button>
          <Button 
            onClick={onClose} 
            variant="outline" 
            className="flex-1 border-gray-200"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}