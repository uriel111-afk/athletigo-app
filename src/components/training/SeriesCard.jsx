import React from 'react';
import { Folder, ChevronLeft, CheckCircle, Circle, Clock, Archive } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function SeriesCard({ series, plans = [], onClick, isCoach = false, onEdit, onDelete }) {
  const completedPlans = plans.filter(p => p.status === 'הושלמה').length;
  const totalPlans = plans.length;
  const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'archived': return 'text-gray-500 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case 'active': return 'פעילה';
      case 'completed': return 'הושלמה';
      case 'archived': return 'ארכיון';
      default: return status;
    }
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-2xl p-5 border-2 border-gray-100 hover:border-[#FF6F20] transition-all cursor-pointer shadow-sm hover:shadow-md relative group overflow-hidden"
    >
      {/* Progress Background Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-100">
        <div 
          className="h-full bg-[#FF6F20] transition-all duration-500" 
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-[#FF6F20]">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-lg text-gray-900 leading-tight">{series.name}</h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {totalPlans} תוכניות • {completedPlans} הושלמו
            </p>
          </div>
        </div>
        
        <div className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getStatusColor(series.status)}`}>
          {getStatusLabel(series.status)}
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2 h-10">
        {series.description || "אין תיאור לסדרה זו"}
      </p>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{series.start_date ? new Date(series.start_date).toLocaleDateString('he-IL') : 'לא הוגדר תאריך'}</span>
        </div>

        {isCoach && (
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
             <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 px-2 text-gray-500 hover:text-blue-600"
                onClick={(e) => { e.stopPropagation(); onEdit(series); }}
             >
               ערוך
             </Button>
          </div>
        )}
        
        {!isCoach && (
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-[#FF6F20] group-hover:text-white transition-colors">
                <ChevronLeft className="w-5 h-5" />
            </div>
        )}
      </div>
    </div>
  );
}