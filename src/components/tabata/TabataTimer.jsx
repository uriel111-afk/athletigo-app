import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, X, Volume2, VolumeX, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function TabataTimer({ config, onClose }) {
  const [status, setStatus] = useState('prep'); // prep, work, rest, round_rest, finished
  const [timeLeft, setTimeLeft] = useState(10); // Prep time default 10s
  const [currentRound, setCurrentRound] = useState(1);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const timerRef = useRef(null);
  const exercises = config.exercises.length > 0 ? config.exercises : [{name: 'תרגיל', notes: ''}];
  
  // Audio setup (simple beep)
  const playBeep = (freq = 440, duration = 0.1) => {
    if (isMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
      setTimeout(() => ctx.close(), duration * 1000 + 100);
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  useEffect(() => {
    if (isPaused) return;

    if (timeLeft <= 3 && timeLeft > 0) {
      playBeep(status === 'work' ? 440 : 880, 0.1);
    }
    if (timeLeft === 0) {
      playBeep(status === 'work' ? 880 : 1200, 0.3); // Status change beep
      handlePhaseChange();
      return;
    }

    timerRef.current = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timerRef.current);
  }, [timeLeft, isPaused, status]);

  const handlePhaseChange = () => {
    if (status === 'prep') {
      setStatus('work');
      setTimeLeft(config.work_time);
    } else if (status === 'work') {
      // Check if round finished (all exercises done for this round?)
      // Wait, standard Tabata is usually 1 exercise for 8 rounds OR list of exercises?
      // Based on builder, it's a list of exercises. Usually you do full list then repeat rounds, or repeat exercise then move?
      // Let's assume: Do full list of exercises = 1 Round. 
      
      const nextExerciseIndex = currentExerciseIndex + 1;
      
      if (nextExerciseIndex < exercises.length) {
        // Move to rest, then next exercise
        setStatus('rest');
        setTimeLeft(config.rest_time);
      } else {
        // End of round
        if (currentRound < config.rounds) {
          setStatus('round_rest');
          setTimeLeft(config.rest_between_rounds);
        } else {
          setStatus('finished');
        }
      }
    } else if (status === 'rest') {
      setCurrentExerciseIndex(prev => prev + 1);
      setStatus('work');
      setTimeLeft(config.work_time);
    } else if (status === 'round_rest') {
      setCurrentRound(prev => prev + 1);
      setCurrentExerciseIndex(0);
      setStatus('work');
      setTimeLeft(config.work_time);
    }
  };

  const skipPhase = () => {
    setTimeLeft(0);
  };

  const getBackgroundColor = () => {
    switch (status) {
      case 'prep': return 'bg-yellow-400';
      case 'work': return 'bg-green-500';
      case 'rest': return 'bg-red-500';
      case 'round_rest': return 'bg-blue-500';
      case 'finished': return 'bg-purple-600';
      default: return 'bg-gray-900';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'prep': return 'התכונן';
      case 'work': return 'עבודה';
      case 'rest': return 'מנוחה';
      case 'round_rest': return 'מנוחה בין סבבים';
      case 'finished': return 'כל הכבוד! סיימת';
      default: return '';
    }
  };

  const currentExercise = exercises[currentExerciseIndex] || {};

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-between text-white transition-colors duration-500 ${getBackgroundColor()}`} dir="rtl">
      {/* Header */}
      <div className="w-full p-4 flex justify-between items-center safe-area-top">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 rounded-full">
          <X size={28} />
        </Button>
        <div className="text-xl font-black tracking-widest uppercase">TABATA</div>
        <Button variant="ghost" size="icon" onClick={() => setIsMuted(!isMuted)} className="text-white hover:bg-white/20 rounded-full">
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-6 text-center">
        {status === 'finished' ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
            <h1 className="text-5xl font-black mb-4">🎉</h1>
            <h2 className="text-4xl font-bold">אימון הושלם!</h2>
            <div className="text-xl opacity-90">
              {config.rounds} סבבים • {exercises.length} תרגילים
            </div>
            <Button onClick={onClose} className="bg-white text-purple-600 hover:bg-gray-100 font-bold text-lg px-8 py-6 rounded-2xl mt-8">
              חזרה לראשי
            </Button>
          </motion.div>
        ) : (
          <>
            <motion.div 
              key={status}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-8"
            >
              <h2 className="text-3xl font-bold opacity-90 mb-2">{getStatusText()}</h2>
              {status !== 'prep' && status !== 'round_rest' && (
                <div className="text-5xl md:text-6xl font-black leading-tight break-words">
                  {status === 'rest' ? 'הבא: ' : ''}{status === 'rest' ? (exercises[currentExerciseIndex + 1] ? exercises[currentExerciseIndex + 1].name : 'סוף סבב') : currentExercise.name}
                </div>
              )}
              {status === 'round_rest' && (
                 <div className="text-2xl font-bold mt-2">סבב הבא: {currentRound + 1}</div>
              )}
            </motion.div>

            <div className="relative mb-12">
              <div className="text-[180px] leading-none font-black tabular-nums tracking-tighter">
                {timeLeft}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 w-full max-w-sm mb-8">
              <div className="bg-white/20 rounded-2xl p-4 backdrop-blur-sm">
                <div className="text-sm font-bold opacity-75">סבב</div>
                <div className="text-3xl font-black">{currentRound}/{config.rounds}</div>
              </div>
              <div className="bg-white/20 rounded-2xl p-4 backdrop-blur-sm">
                <div className="text-sm font-bold opacity-75">תרגיל</div>
                <div className="text-3xl font-black">{currentExerciseIndex + 1}/{exercises.length}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      {status !== 'finished' && (
        <div className="w-full p-8 pb-12 flex items-center justify-center gap-6 safe-area-bottom">
          <Button 
            onClick={() => setIsPaused(!isPaused)} 
            className="w-20 h-20 rounded-full bg-white text-black hover:bg-gray-200 flex items-center justify-center shadow-lg"
          >
            {isPaused ? <Play size={32} fill="currentColor" /> : <Pause size={32} fill="currentColor" />}
          </Button>
          
          <Button 
            onClick={skipPhase}
            className="w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 text-white border-2 border-white/50 flex items-center justify-center"
          >
            <SkipForward size={24} />
          </Button>
        </div>
      )}
    </div>
  );
}