import React from "react";
import { Calendar, Target, Play, Edit2, Copy, UserPlus, Trash2, Clock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function CompactPlanCard({ plan, exercises = [], onSelect, onEdit, onDuplicate, onShare, onDelete }) {
  const isTemplate = plan.is_template;
  const statusColors = {
    'פעילה': 'bg-green-500',
    'טיוטה': 'bg-orange-400',
    'הושלמה': 'bg-blue-500',
    'ארכיון': 'bg-gray-400'
  };
  
  const statusColor = statusColors[plan.status] || 'bg-gray-400';
  
  // Format date safely
  const formattedDate = plan.created_date 
    ? new Date(plan.created_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
    : '-';

  return (
    <div 
      className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col h-full"
      dir="rtl"
    >
      {/* Status Stripe (Right side) */}
      <div className={cn("absolute right-0 top-0 bottom-0 w-1.5", isTemplate ? "bg-blue-500" : "bg-[#FF6F20]")} />

      <div className="p-3 pr-5 flex flex-col h-full">
        {/* Header: Name */}
        <h3 className="text-lg font-bold text-gray-900 leading-snug mb-1 line-clamp-2" title={plan.plan_name}>
          {plan.plan_name}
        </h3>

        {/* Date */}
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <Clock className="w-3.5 h-3.5" />
          <span>{formattedDate}</span>
        </div>

        {/* Tags Area */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {plan.goal_focus && (Array.isArray(plan.goal_focus) ? plan.goal_focus : plan.goal_focus.split(',')).map((tag, i) => (
            <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100 truncate max-w-[100px]">
              {tag.trim()}
            </span>
          ))}
          {plan.status === 'טיוטה' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
              טיוטה
            </span>
          )}
        </div>

        {/* Exercises List - NEW */}
        <div className="mb-auto space-y-1.5 min-h-[60px]">
          {plan.preview_text ? (
            <div className="text-xs text-gray-700 break-words leading-tight whitespace-pre-wrap">
              {plan.preview_text}
            </div>
          ) : (
            (exercises && exercises.length > 0) ? (
              exercises.sort((a, b) => (a.order || 0) - (b.order || 0)).slice(0, 5).map((ex) => {
                 const val = ex.mode === 'זמן' 
                    ? (ex.work_time ? `${ex.work_time} דקות` : null)
                    : (ex.reps_or_time ? (ex.reps_or_time.includes(':') ? ex.reps_or_time : `${ex.reps_or_time} חזרות`) : null);
                 
                 const displayVal = val || (ex.sets ? `${ex.sets} סטים` : '');

                 return (
                  <div key={ex.id} className="text-xs text-gray-700 break-words leading-tight">
                    <span className="font-bold ml-1">• {ex.exercise_name || ex.name || "תרגיל"}</span>
                    {displayVal && <span className="text-gray-500">– {displayVal}</span>}
                    {ex.weight && <span className="text-gray-500 mx-1">({ex.weight} ק"ג)</span>}
                  </div>
                 );
              })
            ) : (
              <p className="text-xs text-gray-400 italic">
                {plan.exercises_count ? `${plan.exercises_count} תרגילים` : 'אין תרגילים'}
              </p>
            )
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 my-3" />

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-1">
          <Button 
            onClick={() => onSelect(plan)}
            size="sm"
            className="h-8 text-xs font-bold bg-[#FF6F20] hover:bg-[#e65b12] text-white px-4 rounded-lg flex-1 shadow-sm"
          >
            <Play className="w-3 h-3 ml-1.5 fill-current" />
            הצג
          </Button>

          <div className="flex items-center gap-1 mr-1">
            <Button onClick={(e) => { e.stopPropagation(); onEdit(plan); }} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-[#FF6F20] hover:bg-orange-50 rounded-lg" title="ערוך">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={(e) => { e.stopPropagation(); onDuplicate(plan); }} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="שכפל">
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={(e) => { e.stopPropagation(); onShare(plan); }} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg" title="שתף">
              <UserPlus className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={(e) => { e.stopPropagation(); onDelete(plan); }} size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="מחק">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}