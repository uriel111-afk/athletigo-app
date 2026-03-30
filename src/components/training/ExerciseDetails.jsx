import React from "react";
import { Clock, Repeat, Weight, Timer, Zap, Target, Activity } from "lucide-react";

export default function ExerciseDetails({ exercise }) {
  const formatTime = (seconds) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const DetailItem = ({ icon: Icon, label, value }) => {
    if (!value || value === "—") return null;
    
    return (
      <div 
        className="flex items-center gap-3 p-3 md:p-4 rounded-xl"
        style={{ backgroundColor: '#F7F7F7', border: '1px solid #E6E6E6' }}
      >
        <div 
          className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#FFF8F3' }}
        >
          <Icon className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#FF6F20' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold mb-0.5" style={{ color: '#7D7D7D' }}>
            {label}
          </p>
          <p className="text-base md:text-lg font-black truncate" style={{ color: '#000000' }}>
            {value}
          </p>
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title, icon }) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl">{icon}</span>
      <h4 className="text-base md:text-lg font-black" style={{ color: '#000000' }}>
        {title}
      </h4>
      <div className="flex-1 h-0.5 rounded-full ml-2" style={{ backgroundColor: '#E6E6E6' }} />
    </div>
  );

  // Mode-specific rendering
  if (exercise.mode === 'סופרסט' && exercise.superset_exercises) {
    return (
      <div className="space-y-4 mt-4">
        <div 
          className="p-5 rounded-2xl"
          style={{
            backgroundColor: '#FFFFFF',
            border: '2px solid #FF6F20',
            boxShadow: '0 4px 12px rgba(255, 111, 32, 0.08)'
          }}
        >
          <SectionHeader title="סופרסט" icon="🔗" />
          
          <div className="space-y-3">
            {exercise.superset_exercises.map((ex, i) => (
              <div 
                key={i}
                className="p-4 rounded-xl"
                style={{ backgroundColor: '#FFF8F3', border: '1px solid #FFD9B3' }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div 
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: '#FF6F20', color: 'white' }}
                  >
                    {i + 1}
                  </div>
                  <p className="font-black text-base" style={{ color: '#000000' }}>
                    {ex.name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p style={{ color: '#4D4D4D' }}>
                    <span className="font-bold">{ex.measurement === 'reps' ? '🔁' : '⏱'}</span>{' '}
                    {ex.value} {ex.measurement === 'reps' ? 'חזרות' : 'שניות'}
                  </p>
                  {ex.weight && (
                    <p style={{ color: '#4D4D4D' }}>
                      <span className="font-bold">⚖️</span> {ex.weight} ק"ג
                    </p>
                  )}
                  {ex.rest && (
                    <p style={{ color: '#4D4D4D' }}>
                      <span className="font-bold">😴</span> {formatTime(parseInt(ex.rest))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <DetailItem 
              icon={Repeat} 
              label="סבבים" 
              value={exercise.superset_rounds}
            />
            <DetailItem 
              icon={Clock} 
              label="מנוחה בין סבבים" 
              value={exercise.superset_rest_between_rounds ? formatTime(parseInt(exercise.superset_rest_between_rounds)) : null}
            />
          </div>
        </div>
      </div>
    );
  }

  if (exercise.mode === 'טבטה' && exercise.tabata_exercises) {
    return (
      <div className="space-y-4 mt-4">
        <div 
          className="p-5 rounded-2xl"
          style={{
            backgroundColor: '#FFFFFF',
            border: '2px solid #FF6F20',
            boxShadow: '0 4px 12px rgba(255, 111, 32, 0.08)'
          }}
        >
          <SectionHeader title="טבטה" icon="⚡" />
          
          <div className="space-y-2 mb-4">
            {exercise.tabata_exercises.map((ex, i) => (
              <div 
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl"
                style={{ backgroundColor: '#FFF8F3', border: '1px solid #FFD9B3' }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: '#FF6F20', color: 'white' }}
                  >
                    {i + 1}
                  </div>
                  <p className="font-black text-sm md:text-base" style={{ color: '#000000' }}>
                    {ex.name}
                  </p>
                </div>
                {ex.weight && (
                    <span className="text-sm font-bold text-gray-600">{ex.weight} ק"ג</span>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DetailItem 
              icon={Timer} 
              label="זמן עבודה" 
              value={exercise.work_time ? formatTime(parseInt(exercise.work_time)) : null}
            />
            <DetailItem 
              icon={Clock} 
              label="מנוחה" 
              value={exercise.tabata_rest ? formatTime(parseInt(exercise.tabata_rest)) : null}
            />
            <DetailItem 
              icon={Activity} 
              label="מנוחה בין תרגילים" 
              value={exercise.tabata_rest_between_exercises ? formatTime(parseInt(exercise.tabata_rest_between_exercises)) : null}
            />
            <DetailItem 
              icon={Repeat} 
              label="סטים" 
              value={exercise.tabata_sets}
            />
          </div>
        </div>
      </div>
    );
  }

  if (exercise.mode === 'קומבו' && exercise.combo_exercises) {
    return (
      <div className="space-y-4 mt-4">
        <div 
          className="p-5 rounded-2xl"
          style={{
            backgroundColor: '#FFFFFF',
            border: '2px solid #FF6F20',
            boxShadow: '0 4px 12px rgba(255, 111, 32, 0.08)'
          }}
        >
          <SectionHeader title="קומבו" icon="🌀" />
          
          <div className="space-y-2 mb-4">
            {exercise.combo_exercises.map((ex, i) => (
              <div 
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl"
                style={{ backgroundColor: '#FFF8F3', border: '1px solid #FFD9B3' }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: '#FF6F20', color: 'white' }}
                  >
                    {i + 1}
                  </div>
                  <p className="font-black text-sm md:text-base" style={{ color: '#000000' }}>
                    {ex.name}
                  </p>
                </div>
                {ex.weight && (
                    <span className="text-sm font-bold text-gray-600">{ex.weight} ק"ג</span>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DetailItem 
              icon={Repeat} 
              label="סטים" 
              value={exercise.combo_sets}
            />
            <DetailItem 
              icon={Target} 
              label="חזרות" 
              value={exercise.combo_reps}
            />
            <DetailItem 
              icon={Clock} 
              label="מנוחה בין סטים" 
              value={exercise.combo_rest_between_sets ? formatTime(parseInt(exercise.combo_rest_between_sets)) : null}
            />
          </div>
        </div>
      </div>
    );
  }

  // Parameter definitions matching ModernExerciseForm for consistency
  const PARAM_DEFINITIONS = {
    sets: { icon: Repeat, label: "סטים" },
    reps: { icon: Target, label: "חזרות" },
    work_time: { icon: Clock, label: "זמן עבודה" },
    rest_time: { icon: Clock, label: "זמן מנוחה" },
    weight: { icon: Weight, label: "משקל" },
    weight_type: { icon: Weight, label: "סוג עומס" },
    rpe: { icon: Zap, label: "RPE (קושי)" },
    rounds: { icon: Repeat, label: "סבבים" },
    rest_between_exercises: { icon: Clock, label: "מנוחה בין תרגילים" },
    rest_between_sets: { icon: Clock, label: "מנוחה בין סטים" },
    side_right: { icon: Activity, label: "צד ימין" },
    side_left: { icon: Activity, label: "צד שמאל" },
    tempo: { icon: Activity, label: "טמפו" },
    static_hold_time: { icon: Timer, label: "החזקה סטטית" },
    equipment: { icon: Weight, label: "ציוד נדרש" },
    coach_notes: { icon: Zap, label: "דגשים" },
    video_url: { icon: Activity, label: "וידאו" }
  };

  // Determine order of display
  let displayOrder = exercise.params_order;
  
  // Fallback if no order saved
  if (!displayOrder || !Array.isArray(displayOrder) || displayOrder.length === 0) {
      displayOrder = ["sets", "reps", "weight", "rest_time", "equipment", "coach_notes"];
      if (exercise.mode === 'זמן') displayOrder = ["work_time", "rounds", "rest_time", "equipment", "coach_notes"];
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {displayOrder.map(paramId => {
           // Map paramId to actual values and labels
           let value = null;
           let label = PARAM_DEFINITIONS[paramId]?.label || paramId;
           let Icon = PARAM_DEFINITIONS[paramId]?.icon || Activity;
           const isLarge = ['exercises', 'equipment', 'coach_notes', 'video_url', 'weight_type'].includes(paramId);

           // Value Resolvers
           if (paramId === 'reps') {
               if (exercise.reps_or_time && exercise.mode !== 'זמן') value = exercise.reps_or_time;
           }
           else if (paramId === 'work_time') {
               if (exercise.work_time) value = formatTime(parseInt(exercise.work_time));
               else if (exercise.mode === 'זמן' && exercise.reps_or_time) value = formatTime(parseInt(exercise.reps_or_time));
           }
           else if (paramId === 'rest_time' && exercise.rest_time) value = formatTime(parseInt(exercise.rest_time));
           else if (paramId === 'sets' && exercise.sets) value = exercise.sets;
           else if (paramId === 'weight' && exercise.weight) value = `${exercise.weight} ק״ג`;
           else if (paramId === 'weight_type' && exercise.weight_type) value = exercise.weight_type === 'bodyweight' ? 'משקל גוף' : exercise.weight_type;
           else if (paramId === 'equipment' && exercise.equipment) value = exercise.equipment;
           else if (paramId === 'coach_notes') {
               // Handled separately below for styling, or render here if we want uniform list
               // User wants "same order", so let's render it here but with full width styling if needed
               // However, DetailItem is card-like. 
               if (exercise.cues) value = exercise.cues; // legacy
               if (exercise.coach_notes) value = exercise.coach_notes;
           }
           else if (paramId === 'rpe' && exercise.rpe) value = exercise.rpe;
           else if (paramId === 'side_right' && exercise.side_right) value = "✅";
           else if (paramId === 'side_left' && exercise.side_left) value = "✅";
           else if (paramId === 'tempo' && exercise.tempo) value = exercise.tempo;
           
           // If no value found for this param, skip
           if (!value) return null;

           // Custom rendering for large items to break the grid
           if (paramId === 'equipment') {
               return (
                <div key={paramId} className="col-span-1 md:col-span-2 p-4 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '1px solid #FFD9B3' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#FF6F20' }}>🎯 ציוד נדרש</p>
                  <p className="text-sm font-bold" style={{ color: '#000000' }}>{value}</p>
                </div>
               );
           }
           if (paramId === 'coach_notes' || paramId === 'cues') {
               return (
                <div key={paramId} className="col-span-1 md:col-span-2 p-4 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                  <p className="text-xs font-bold mb-1.5 flex items-center gap-1" style={{ color: '#FF6F20' }}><Zap className="w-4 h-4" /> דגשים טכניים</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#000000' }}>{value}</p>
                </div>
               );
           }
           
           return <DetailItem key={paramId} icon={Icon} label={label} value={value} />;
        })}
      </div>
    </div>
  );
}