import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trophy, Target, Zap, TrendingUp, Sparkles } from "lucide-react";

export default function WorkoutScoreDialog({ 
  isOpen, 
  onClose, 
  scores,
  onFinish
}) {
  const [traineeFeedback, setTraineeFeedback] = useState({
    control_feeling: 5,
    difficulty_feeling: 5,
    general_feedback: ""
  });

  if (!scores) return null;

  // Calculate points system
  const basePoints = 30; // Base points for completion
  const controlBonus = Math.round(scores.control_score * 2); // Max 20 points
  const difficultyBonus = Math.round(scores.difficulty_score * 1); // Max 10 points
  const totalPoints = basePoints + controlBonus + difficultyBonus;

  const getScoreColor = (score) => {
    if (score >= 8) return '#4CAF50';
    if (score >= 6) return '#FF9800';
    return '#f44336';
  };

  const getScoreLabel = (score) => {
    if (score >= 9) return 'מצוין! 🔥';
    if (score >= 7) return 'טוב מאוד! 💪';
    if (score >= 5) return 'סביר 👍';
    return 'צריך שיפור 📈';
  };

  const getMotivationalText = (overallScore) => {
    if (overallScore >= 9) return 'ביצוע מושלם! אתה מתקדם במהירות אדירה 🚀';
    if (overallScore >= 7.5) return 'עבודה מעולה! המשך בדרך הזאת 💪';
    if (overallScore >= 6) return 'התקדמות יפה! עוד קצת ותגיע למצוינות 📈';
    if (overallScore >= 4) return 'התחלה טובה! המשך להתאמן ותראה שיפור ⭐';
    return 'כל אימון הוא התקדמות! המשך כך ותשתפר 🎯';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-3xl md:text-4xl font-black text-center mb-2" style={{ color: '#000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            🏆 אימון הושלם!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Total Points Card */}
          <div className="text-center p-8 rounded-2xl relative overflow-hidden" style={{ backgroundColor: '#000000' }}>
            <div className="absolute top-0 left-0 w-full h-full opacity-10">
              <Sparkles className="w-full h-full" style={{ color: '#FF6F20' }} />
            </div>
            <div className="relative z-10">
              <Trophy className="w-20 h-20 mx-auto mb-4" style={{ color: '#FF6F20' }} />
              <p className="text-sm font-bold mb-2" style={{ color: '#FF6F20' }}>
                נקודות שצברת
              </p>
              <p className="text-7xl font-black mb-2" style={{ color: '#FFFFFF', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                {totalPoints}
              </p>
              <div className="flex justify-center gap-6 text-sm mt-4">
                <div>
                  <p style={{ color: '#FFFFFF', opacity: 0.7 }}>השלמה</p>
                  <p className="font-bold" style={{ color: '#FF6F20' }}>+{basePoints}</p>
                </div>
                <div>
                  <p style={{ color: '#FFFFFF', opacity: 0.7 }}>בונוס שליטה</p>
                  <p className="font-bold" style={{ color: '#4CAF50' }}>+{controlBonus}</p>
                </div>
                <div>
                  <p style={{ color: '#FFFFFF', opacity: 0.7 }}>בונוס קושי</p>
                  <p className="font-bold" style={{ color: '#FFA726' }}>+{difficultyBonus}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Overall Score */}
          <div className="text-center p-6 rounded-2xl" style={{ backgroundColor: '#E8F5E9', border: '3px solid #4CAF50' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#7D7D7D' }}>
              ציון כללי
            </p>
            <p className="text-5xl font-black mb-2" style={{ color: '#4CAF50', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
              {scores.overall_score.toFixed(1)}
            </p>
            <p className="text-base font-bold" style={{ color: '#2E7D32' }}>
              {getScoreLabel(scores.overall_score)}
            </p>
          </div>

          {/* Detailed Scores */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px solid #4CAF50' }}>
              <Target className="w-8 h-8 mx-auto mb-3" style={{ color: '#4CAF50' }} />
              <p className="text-xs font-bold mb-2" style={{ color: '#7D7D7D' }}>
                ציון שליטה
              </p>
              <p className="text-4xl font-black mb-1" style={{ color: '#4CAF50', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                {scores.control_score.toFixed(1)}
              </p>
              <p className="text-xs font-bold" style={{ color: '#2E7D32' }}>
                {getScoreLabel(scores.control_score)}
              </p>
            </div>

            <div className="p-6 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px solid #FF6F20' }}>
              <Zap className="w-8 h-8 mx-auto mb-3" style={{ color: '#FF6F20' }} />
              <p className="text-xs font-bold mb-2" style={{ color: '#7D7D7D' }}>
                ציון קושי
              </p>
              <p className="text-4xl font-black mb-1" style={{ color: '#FF6F20', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                {scores.difficulty_score.toFixed(1)}
              </p>
              <p className="text-xs font-bold" style={{ color: '#E65F1D' }}>
                {getScoreLabel(scores.difficulty_score)}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl text-center" style={{ backgroundColor: '#F7F7F7' }}>
              <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>
                {scores.completed_exercises}
              </p>
              <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>
                תרגילים
              </p>
            </div>
            <div className="p-4 rounded-xl text-center" style={{ backgroundColor: '#F7F7F7' }}>
              <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>
                {scores.duration_minutes}′
              </p>
              <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>
                דקות
              </p>
            </div>
            <div className="p-4 rounded-xl text-center" style={{ backgroundColor: '#F7F7F7' }}>
              <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>
                {Math.round((scores.completed_exercises / scores.total_exercises) * 100)}%
              </p>
              <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>
                השלמה
              </p>
            </div>
          </div>

          {/* Motivational Message */}
          <div className="p-6 rounded-xl text-center" style={{ backgroundColor: '#FFE4D3', border: '2px solid #FF6F20' }}>
            <TrendingUp className="w-8 h-8 mx-auto mb-3" style={{ color: '#FF6F20' }} />
            <p className="text-base font-bold mb-2" style={{ color: '#000' }}>
              {getMotivationalText(scores.overall_score)}
            </p>
          </div>

          {/* Trainee Feedback Section */}
          <div className="space-y-6 p-6 rounded-xl" style={{ backgroundColor: '#E3F2FD', border: '2px solid #2196F3' }}>
            <div className="text-center mb-4">
              <h3 className="text-xl font-black mb-2" style={{ color: '#000' }}>📝 המשוב שלך</h3>
              <p className="text-sm" style={{ color: '#4D4D4D' }}>עזור למאמן להבין איך הרגשת באימון</p>
            </div>

            {/* Control Feeling */}
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000' }}>
                🎯 איך הרגשת את השליטה שלך בתרגילים? (1-10)
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <button
                    key={num}
                    onClick={() => setTraineeFeedback({ ...traineeFeedback, control_feeling: num })}
                    className="py-3 rounded-xl font-black text-lg transition-all"
                    style={{
                      backgroundColor: traineeFeedback.control_feeling === num ? '#4CAF50' : '#FFFFFF',
                      color: traineeFeedback.control_feeling === num ? 'white' : '#000',
                      border: traineeFeedback.control_feeling === num ? '2px solid #4CAF50' : '2px solid #E0E0E0'
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: '#4D4D4D' }}>
                1 = חסר שליטה, 10 = שליטה מלאה
              </p>
            </div>

            {/* Difficulty Feeling */}
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000' }}>
                💪 מה הייתה רמת הקושי הכללית? (1-10)
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <button
                    key={num}
                    onClick={() => setTraineeFeedback({ ...traineeFeedback, difficulty_feeling: num })}
                    className="py-3 rounded-xl font-black text-lg transition-all"
                    style={{
                      backgroundColor: traineeFeedback.difficulty_feeling === num ? '#FF6F20' : '#FFFFFF',
                      color: traineeFeedback.difficulty_feeling === num ? 'white' : '#000',
                      border: traineeFeedback.difficulty_feeling === num ? '2px solid #FF6F20' : '2px solid #E0E0E0'
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: '#4D4D4D' }}>
                1 = קל מאוד, 10 = קשה מאוד
              </p>
            </div>

            {/* General Feedback */}
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000' }}>
                💬 משוב כללי (אופציונלי)
              </Label>
              <Textarea
                value={traineeFeedback.general_feedback}
                onChange={(e) => setTraineeFeedback({ ...traineeFeedback, general_feedback: e.target.value })}
                placeholder="ספר למאמן איך הרגשת, מה עבד טוב, מה היה מאתגר..."
                className="rounded-xl min-h-[100px] text-base"
                style={{ border: '2px solid #E0E0E0', backgroundColor: '#FFFFFF' }}
              />
            </div>
          </div>

          <Button
            onClick={() => onFinish(traineeFeedback)}
            className="w-full rounded-xl py-6 font-bold text-xl"
            style={{ backgroundColor: '#FF6F20', color: 'white' }}
          >
            סיום ושמירה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}