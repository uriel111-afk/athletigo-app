import React, { useState } from "react";
import { User, ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompactPlanCard from "./CompactPlanCard";
import SeriesCard from "./SeriesCard";

export default function TraineePlanGroup({ 
  traineeName, 
  plans, 
  exercises = [],
  seriesList = [], 
  isTemplateGroup = false,
  actions // { onSelect, onEdit, onDuplicate, onShare, onDelete, onSeriesEdit }
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Combine items to show logic
  const totalItems = seriesList.length + plans.length;
  const shouldLimit = totalItems > 3;
  
  // If not expanded, take first 3 items (Prioritize Series, then Plans)
  const visibleSeries = isExpanded ? seriesList : seriesList.slice(0, 3);
  const remainingSlots = Math.max(0, 3 - visibleSeries.length);
  const visiblePlans = isExpanded ? plans : plans.filter(p => !p.series_id).slice(0, isExpanded ? plans.length : remainingSlots);
  // Note: Logic above has a small flaw if plans are inside series. 
  // We should filter standalone plans first.
  const standalonePlans = plans.filter(p => !p.series_id);
  const visibleStandalonePlans = isExpanded ? standalonePlans : standalonePlans.slice(0, Math.max(0, 3 - visibleSeries.length));

  return (
    <div className="bg-gray-50/50 rounded-2xl border border-gray-100 overflow-hidden mb-4 transition-all hover:border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm ${isTemplateGroup ? 'bg-blue-500' : 'bg-[#FF6F20]'}`}>
            {isTemplateGroup ? <LayoutGrid className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 leading-none mb-0.5">{traineeName}</h3>
            <span className="text-[10px] text-gray-500 font-medium">
              {totalItems} {totalItems === 1 ? 'תוכנית' : 'תוכניות'}
            </span>
          </div>
        </div>

        {shouldLimit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 text-xs text-[#FF6F20] hover:text-[#e65b12] hover:bg-orange-50 font-bold gap-1"
          >
            {isExpanded ? 'הצג פחות' : 'הצג הכל'}
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        )}
      </div>

      {/* Grid Content */}
      <div className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Render Series */}
        {visibleSeries.map(series => (
          <SeriesCard 
            key={series.id}
            series={series}
            plans={plans.filter(p => p.series_id === series.id)}
            isCoach={true}
            onClick={() => actions.onSeriesEdit(series)}
            onEdit={actions.onSeriesEdit}
          />
        ))}

        {/* Render Standalone Plans */}
        {visibleStandalonePlans.map(plan => (
          <CompactPlanCard
            key={plan.id}
            plan={plan}
            exercises={[]} 
            onSelect={actions.onSelect}
            onEdit={actions.onEdit}
            onDuplicate={actions.onDuplicate}
            onShare={actions.onShare}
            onDelete={actions.onDelete}
          />
        ))}
      </div>
    </div>
  );
}