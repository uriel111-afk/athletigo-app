import React from "react";
import { Card } from "@/components/ui/card";
import { 
  Dumbbell, 
  Clock, 
  Target, 
  Zap,
  AlertCircle,
  CheckCircle2,
  TrendingUp
} from "lucide-react";

export default function SectionOverviewCard({ section, exercises, theme }) {
  const totalExercises = exercises.length;
  const comboExercises = exercises.filter(e => e.mode === 'קומבו').length;
  const regularExercises = totalExercises - comboExercises;
  
  // Calculate total volume estimates
  const totalSets = exercises.reduce((sum, ex) => {
    if (ex.sets) {
      const sets = parseInt(ex.sets) || 0;
      return sum + sets;
    }
    return sum;
  }, 0);

  // Calculate estimated duration
  const estimatedDuration = exercises.reduce((sum, ex) => {
    let exerciseTime = 0;
    
    // Rest time
    if (ex.rest_time && ex.sets) {
      const rest = parseInt(ex.rest_time) || 0;
      const sets = parseInt(ex.sets) || 0;
      exerciseTime += rest * sets;
    }
    
    // Work time (if time-based)
    if (ex.mode === 'זמן' && ex.reps_or_time && ex.sets) {
      const time = parseInt(ex.reps_or_time) || 0;
      const sets = parseInt(ex.sets) || 0;
      exerciseTime += time * sets;
    }
    
    // Estimate for reps (assume ~2-3 seconds per rep)
    if (ex.mode === 'חזרות' && ex.reps_or_time && ex.sets) {
      const reps = parseInt(ex.reps_or_time) || 0;
      const sets = parseInt(ex.sets) || 0;
      exerciseTime += (reps * 2.5 * sets);
    }
    
    return sum + exerciseTime;
  }, 0);

  const estimatedMinutes = Math.round(estimatedDuration / 60);

  // Equipment summary
  const equipmentList = [...new Set(
    exercises
      .filter(e => e.equipment)
      .map(e => e.equipment)
  )];

  // Modes breakdown
  const modesCounts = exercises.reduce((acc, ex) => {
    acc[ex.mode] = (acc[ex.mode] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 rounded-2xl mb-6" style={{ 
      backgroundColor: '#FAFAFA', 
      border: `2px solid ${theme.headerBar}`,
      borderRight: `6px solid ${theme.headerBar}`
    }}>
      <div className="flex items-center gap-3 mb-6">
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
          style={{ backgroundColor: theme.headerBar, color: 'white' }}
        >
          {section.icon || theme.defaultIcon}
        </div>
        <div className="flex-1">
          <h4 className="text-2xl font-black mb-1" style={{ color: '#000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            {section.section_name}
          </h4>
          {(section.description || theme.subtitle) && (
            <p className="text-sm" style={{ color: '#7D7D7D' }}>
              {section.description || theme.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px solid #E6E6E6' }}>
          <Dumbbell className="w-5 h-5 mx-auto mb-2" style={{ color: theme.headerBar }} />
          <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>{totalExercises}</p>
          <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>תרגילים</p>
        </div>

        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px solid #E6E6E6' }}>
          <Target className="w-5 h-5 mx-auto mb-2" style={{ color: '#FF6F20' }} />
          <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>{totalSets}</p>
          <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>סה"כ סטים</p>
        </div>

        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px solid #E6E6E6' }}>
          <Clock className="w-5 h-5 mx-auto mb-2" style={{ color: '#4CAF50' }} />
          <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>~{estimatedMinutes}</p>
          <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>דקות (משוער)</p>
        </div>

        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px solid #E6E6E6' }}>
          <Zap className="w-5 h-5 mx-auto mb-2" style={{ color: '#FFA96E' }} />
          <p className="text-2xl font-black mb-1" style={{ color: '#000' }}>{comboExercises}</p>
          <p className="text-xs font-bold" style={{ color: '#7D7D7D' }}>קומבו</p>
        </div>
      </div>

      {/* Exercise Types Breakdown */}
      {Object.keys(modesCounts).length > 0 && (
        <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: 'white', border: '1px solid #E6E6E6' }}>
          <p className="text-xs font-bold mb-3" style={{ color: '#7D7D7D' }}>
            🎯 פילוח סוגי תרגילים
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(modesCounts).map(([mode, count]) => (
              <span 
                key={mode}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: '#FFE4D3', color: '#FF6F20' }}
              >
                {mode}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Equipment List */}
      {equipmentList.length > 0 && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'white', border: '1px solid #E6E6E6' }}>
          <p className="text-xs font-bold mb-3" style={{ color: '#7D7D7D' }}>
            🛠️ ציוד נדרש
          </p>
          <div className="flex flex-wrap gap-2">
            {equipmentList.map((equipment, idx) => (
              <span 
                key={idx}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: '#F7F7F7', color: '#000', border: '1px solid #E6E6E6' }}
              >
                {equipment}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="mt-4 space-y-2">
        {totalExercises === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: '#FFEBEE', border: '1px solid #f44336' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#f44336' }} />
            <p className="text-xs font-bold" style={{ color: '#f44336' }}>
              הסקשן ריק - הוסף תרגילים
            </p>
          </div>
        )}
        {totalExercises > 0 && totalExercises < 3 && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: '#FFF3E0', border: '1px solid #FF9800' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF9800' }} />
            <p className="text-xs font-bold" style={{ color: '#FF9800' }}>
              סקשן קצר - שקול להוסיף תרגילים נוספים
            </p>
          </div>
        )}
        {totalExercises >= 3 && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: '#E8F5E9', border: '1px solid #4CAF50' }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#4CAF50' }} />
            <p className="text-xs font-bold" style={{ color: '#4CAF50' }}>
              סקשן מוכן לשימוש
            </p>
          </div>
        )}
      </div>
    </div>
  );
}