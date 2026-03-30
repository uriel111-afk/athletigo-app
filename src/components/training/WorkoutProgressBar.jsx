import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, CheckCircle, Flame } from "lucide-react";


export default function WorkoutProgressBar({ plan, sections, exercises }) {
  const [prevProgress, setPrevProgress] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  const safeExercises = exercises ? exercises.filter(Boolean) : [];
  const totalExercises = safeExercises.length;
  const completedExercises = safeExercises.filter((e) => e.completed).length;
  const progressPercentage = totalExercises > 0 ? Math.round(completedExercises / totalExercises * 100) : 0;

  useEffect(() => {
    if (progressPercentage === 100 && prevProgress < 100) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4000);
    }
    setPrevProgress(progressPercentage);
  }, [progressPercentage, prevProgress]);

  if (!plan) return null;

  return (
    <>
      <div className="mx-1 fixed bottom-0 left-0 right-0 z-20 w-full"

      style={{
        backgroundColor: '#FFFFFF',
        borderTop: '2px solid #EDEDED',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.04)'
      }}>

        <div className="mx-auto px-3 max-w-7xl md:px-6 md:py-4">
          {/* Progress Bar */}
          <div className="mt-4 mb-2 relative w-full md:mb-3">
            <div className="my-1 py-1 rounded-full relative w-full h-2.5 md:h-3 overflow-hidden" style={{ backgroundColor: '#F7F7F7' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercentage}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute inset-y-0 right-0 rounded-full"
                style={{
                  background: progressPercentage === 100 ?
                  'linear-gradient(90deg, #4CAF50 0%, #66BB6A 100%)' :
                  'linear-gradient(90deg, #FF6F20 0%, #FF8C42 100%)',
                  boxShadow: progressPercentage === 100 ?
                  '0 2px 8px rgba(76, 175, 80, 0.3)' :
                  '0 2px 8px rgba(255, 111, 32, 0.3)'
                }} />
            </div>

            {/* Floating Percentage */}
            <motion.div
              initial={{ right: 0 }}
              animate={{ right: `${progressPercentage}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute top-1/2 -translate-y-1/2 z-10 translate-x-1/2 pointer-events-none">

                <div
                className="bg-white text-xs font-black px-2 py-1 rounded-md shadow-sm border"
                style={{
                  color: progressPercentage === 100 ? '#4CAF50' : '#FF6F20',
                  borderColor: progressPercentage === 100 ? '#E8F5E9' : '#FFF3E0'
                }}>

                    {progressPercentage}%
                </div>
            </motion.div>
          </div>

          {/* Compact Header */}
          <div className="mt-3 mb-16 py-1 flex items-center justify-between md:mb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-6 h-6 md:w-7 md:h-7" style={{ color: '#FF6F20' }} />
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-black truncate" style={{ color: '#000000' }}>
                  {plan.plan_name}
                </h3>
                <p className="text-sm md:text-base font-bold" style={{ color: '#7D7D7D' }}>
                  {completedExercises}/{totalExercises}
                </p>
              </div>
            </div>

            {/* Percentage moved to progress bar */}
          </div>

          {/* Section Progress Indicators - no horizontal scroll */}
          {sections && sections.length > 0 &&
          <div className="flex flex-wrap gap-1.5 md:gap-2">
              {sections.filter(Boolean).map((section) => {
              const sectionExercises = safeExercises.filter((e) => e.training_section_id === section.id);
              const sectionCompleted = sectionExercises.filter((e) => e.completed).length;
              const sectionTotal = sectionExercises.length;
              const sectionProgress = sectionTotal > 0 ? sectionCompleted / sectionTotal * 100 : 0;

              return (
                <div
                  key={section.id}
                  className="px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg text-[10px] md:text-xs font-bold whitespace-nowrap"
                  style={{
                    backgroundColor: sectionProgress === 100 ? '#E8F5E9' : '#FFF8F3',
                    color: sectionProgress === 100 ? '#4CAF50' : '#FF6F20',
                    border: sectionProgress === 100 ? '1px solid #4CAF50' : '1px solid #FFD9B3'
                  }}>

                    {section.icon || '✨'} {section.section_name}: {sectionCompleted}/{sectionTotal}
                  </div>);

            })}
            </div>
          }
        </div>
      </div>

      {/* Celebration Modal */}
      <AnimatePresence>
        {showCelebration &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>

            <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 50 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="max-w-md w-full p-8 md:p-10 rounded-3xl text-center"
            style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>

              <motion.div
              animate={{
                rotate: [0, 10, -10, 10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 0.6, repeat: 2 }}
              className="w-24 h-24 md:w-32 md:h-32 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                boxShadow: '0 8px 24px rgba(255, 215, 0, 0.4)'
              }}>

                <Trophy className="w-12 h-12 md:w-16 md:h-16 text-white" />
              </motion.div>

              <h2 className="text-3xl md:text-4xl font-black mb-3" style={{ color: '#000000' }}>
                כל הכבוד! 🎉
              </h2>
              <p className="text-lg md:text-xl mb-6" style={{ color: '#4CAF50' }}>
                השלמת את האימון!
              </p>

              <div className="flex items-center justify-center gap-2 p-4 rounded-xl" style={{ backgroundColor: '#F1F8F4' }}>
                <CheckCircle className="w-6 h-6" style={{ color: '#4CAF50' }} />
                <span className="text-base md:text-lg font-bold" style={{ color: '#000000' }}>
                  {totalExercises} תרגילים הושלמו
                </span>
              </div>

              <p className="mt-6 text-sm" style={{ color: '#7D7D7D' }}>
                המשך כך! 💪
              </p>
            </motion.div>
          </motion.div>
        }
      </AnimatePresence>
    </>);

}