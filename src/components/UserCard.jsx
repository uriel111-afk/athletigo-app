import React, { useState } from "react";
import { Users, Package, Calendar, Target, ChevronRight, ChevronDown, Edit2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const UserCard = ({ trainee, activePackage, upcomingSession, planCount, calculateAge, onRename }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const age = calculateAge(trainee.birth_date);
  const dob = trainee.birth_date 
    ? new Date(trainee.birth_date).toLocaleDateString('he-IL') 
    : 'N/A';
  const joinDate = trainee.created_date 
    ? new Date(trainee.created_date).toLocaleDateString('he-IL') 
    : 'N/A';

  const hasActivePackage = !!activePackage;

  // Navigation Handlers
  const handleViewProfile = (e) => {
    e.stopPropagation();
    navigate(createPageUrl("TraineeProfile") + `?userId=${trainee.id}`);
  };

  const handleShortcut = (e, type) => {
    e.stopPropagation();
    // Navigate based on shortcut type - simplified to open relevant page
    if (type === 'package') {
      // Open profile services tab (assuming it exists or general profile)
      navigate(createPageUrl("TraineeProfile") + `?userId=${trainee.id}&tab=services`);
    } else if (type === 'session') {
      // Open sessions for this user (if sessions page supports filtering, otherwise profile sessions tab)
      navigate(createPageUrl("TraineeProfile") + `?userId=${trainee.id}&tab=overview`);
    } else if (type === 'plan') {
      // Open training plans for this user (profile plans tab is safest shortcut)
      navigate(createPageUrl("TraineeProfile") + `?userId=${trainee.id}&tab=plans`);
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl transition-all duration-300 bg-white ${isExpanded ? 'shadow-xl scale-[1.01]' : 'hover:shadow-lg'}`}
      style={{ 
        border: hasActivePackage ? '2.5px solid #FF6F20' : '1px solid #E0E0E0',
        boxShadow: isExpanded ? '0 10px 25px rgba(0,0,0,0.08)' : '0 2px 10px rgba(0,0,0,0.05)'
      }}
    >
      {/* Card Header - Click to Expand/Collapse */}
      <div 
        className="p-5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* Profile Image / Avatar */}
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
              style={{ 
                backgroundColor: hasActivePackage ? '#FFF3E0' : '#F5F5F5', 
                color: hasActivePackage ? '#FF6F20' : '#7D7D7D',
                border: hasActivePackage ? '1px solid #FFE0B2' : '1px solid #EEEEEE'
              }}
            >
              {trainee.profile_image ? (
                <img src={trainee.profile_image} alt={trainee.full_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                trainee.full_name?.[0] || 'U'
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[#222222] leading-tight mb-1">
                  {trainee.full_name}
                </h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(createPageUrl("TraineeProfile") + `?userId=${trainee.id}`);
                  }}
                  className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-[#FF6F20] transition-colors"
                  title="ערוך פרופיל"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs text-[#666666] flex flex-wrap gap-2 items-center">
                 <span className="whitespace-nowrap">גיל: {age}</span>
                 <span className="hidden sm:inline text-[#DDDDDD]">|</span>
                 <span className="whitespace-nowrap">ת.לידה: {dob}</span>
                 <span className="hidden sm:inline text-[#DDDDDD]">|</span>
                 <span className="whitespace-nowrap">הצטרף: {joinDate}</span>
              </div>
            </div>
          </div>

          {/* Expand Icon */}
          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-5 h-5 text-[#999999]" />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-5 pb-5 pt-0 space-y-3">
          <div className="w-full h-px bg-[#F0F0F0] mb-4" />

          {/* Shortcuts Grid */}
          <div className="grid grid-cols-1 gap-3">
            
            {/* Package Shortcut */}
            <div 
              onClick={(e) => handleShortcut(e, 'package')}
              className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAFA] border border-[#E0E0E0] cursor-pointer hover:bg-[#F0F0F0] hover:border-[#D0D0D0] transition-colors group/item"
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white shadow-sm text-[#FF6F20] border border-[#EEEEEE]">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#999999] uppercase tracking-wider">חבילה</span>
                    <span className="text-sm font-bold text-[#333333] truncate max-w-[180px]">
                      {activePackage ? activePackage.package_name : "אין חבילה פעילה"}
                    </span>
                    {activePackage && activePackage.total_sessions > 0 && (
                       <span className="text-[10px] text-[#666666]">
                         {activePackage.used_sessions || 0}/{activePackage.total_sessions} נוצלו
                       </span>
                    )}
                  </div>
               </div>
               <ChevronRight className="w-4 h-4 text-[#CCCCCC] group-hover/item:text-[#FF6F20] transition-colors" />
            </div>

            {/* Session Shortcut */}
            <div 
              onClick={(e) => handleShortcut(e, 'session')}
              className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAFA] border border-[#E0E0E0] cursor-pointer hover:bg-[#F0F0F0] hover:border-[#D0D0D0] transition-colors group/item"
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white shadow-sm text-[#4CAF50] border border-[#EEEEEE]">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#999999] uppercase tracking-wider">מפגשים</span>
                    <div className="text-sm font-bold text-[#333333]">
                      {upcomingSession ? (
                         <span>
                           {new Date(upcomingSession.date).toLocaleDateString('he-IL', {day: 'numeric', month: 'numeric'})} | {upcomingSession.time}
                         </span>
                      ) : (
                         <span className="text-[#999999] font-normal">אין מפגש קרוב</span>
                      )}
                    </div>
                  </div>
               </div>
               <ChevronRight className="w-4 h-4 text-[#CCCCCC] group-hover/item:text-[#FF6F20] transition-colors" />
            </div>

            {/* Plans Shortcut */}
            <div 
              onClick={(e) => handleShortcut(e, 'plan')}
              className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAFA] border border-[#E0E0E0] cursor-pointer hover:bg-[#F0F0F0] hover:border-[#D0D0D0] transition-colors group/item"
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white shadow-sm text-[#9C27B0] border border-[#EEEEEE]">
                     <Target className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#999999] uppercase tracking-wider">תוכניות</span>
                    <span className="text-sm font-bold text-[#333333]">
                      {planCount} תוכניות
                    </span>
                  </div>
               </div>
               <ChevronRight className="w-4 h-4 text-[#CCCCCC] group-hover/item:text-[#FF6F20] transition-colors" />
            </div>

          </div>

          {/* View Profile Button */}
          <button 
            onClick={handleViewProfile}
            className="w-full mt-4 py-3 rounded-xl bg-[#222222] text-white text-sm font-bold hover:bg-[#000000] transition-colors flex items-center justify-center gap-2"
          >
            צפה בפרופיל מלא
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserCard;