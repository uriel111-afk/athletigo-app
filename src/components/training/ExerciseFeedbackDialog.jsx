import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";

export default function ExerciseFeedbackDialog({ 
  exercise, 
  isOpen, 
  onClose, 
  onSubmit 
}) {
  const [controlRating, setControlRating] = useState(exercise?.control_rating || 5);
  const [difficultyRating, setDifficultyRating] = useState(exercise?.difficulty_rating || 5);
  const [feedback, setFeedback] = useState(exercise?.trainee_feedback || "");

  const handleSubmit = () => {
    onSubmit({
      control_rating: controlRating,
      difficulty_rating: difficultyRating,
      trainee_feedback: feedback,
      completed: true
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-center mb-2" style={{ color: '#000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            ✅ מעולה!
          </DialogTitle>
          <p className="text-center text-base" style={{ color: '#4D4D4D' }}>
            איך היה לך ב-{exercise?.exercise_name}?
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Control Rating */}
          <div>
            <p className="text-sm font-bold mb-3 text-center" style={{ color: '#000' }}>
              🎯 רמת שליטה
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                <button
                  key={rating}
                  onClick={() => setControlRating(rating)}
                  className="w-12 h-12 rounded-xl font-bold text-base transition-all"
                  style={{
                    backgroundColor: controlRating === rating ? '#4CAF50' : '#F7F7F7',
                    color: controlRating === rating ? 'white' : '#000',
                    border: controlRating === rating ? '2px solid #4CAF50' : '1px solid #E6E6E6'
                  }}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Rating */}
          <div>
            <p className="text-sm font-bold mb-3 text-center" style={{ color: '#000' }}>
              💪 רמת קושי
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                <button
                  key={rating}
                  onClick={() => setDifficultyRating(rating)}
                  className="w-12 h-12 rounded-xl font-bold text-base transition-all"
                  style={{
                    backgroundColor: difficultyRating === rating ? '#FF6F20' : '#F7F7F7',
                    color: difficultyRating === rating ? 'white' : '#000',
                    border: difficultyRating === rating ? '2px solid #FF6F20' : '1px solid #E6E6E6'
                  }}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback */}
          <div>
            <p className="text-sm font-bold mb-3" style={{ color: '#000' }}>
              💭 הערות למאמן (אופציונלי)
            </p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="איך הרגשת? מה היה קשה?"
              className="rounded-xl min-h-[100px]"
              style={{ border: '1px solid #E6E6E6' }}
            />
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full rounded-xl py-6 font-bold text-lg"
            style={{ backgroundColor: '#FF6F20', color: 'white' }}
          >
            <Check className="w-6 h-6 ml-2" />
            שמור ותמשיך
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}