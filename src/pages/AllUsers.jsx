import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import RenameUserDialog from "../components/forms/RenameUserDialog";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import { toast } from "sonner";
import { useClientStats } from "../components/hooks/useClientStats";
import { useSessionStats } from "../components/hooks/useSessionStats";
import { useProgramStats } from "../components/hooks/useProgramStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Users, Search, Loader2, Filter, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import UserCard from "../components/UserCard";

export default function AllUsers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [filterType, setFilterType] = useState(new URLSearchParams(window.location.search).get('filter') || "all"); // all, paying, casual, active
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [userToRename, setUserToRename] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const renameUserMutation = useMutation({
    mutationFn: async ({ id, fullName }) => {
      await base44.entities.User.update(id, { full_name: fullName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] }); // Assuming useClientStats uses this key or similar
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success("שם המשתמש עודכן בהצלחה");
      setShowRenameDialog(false);
      setUserToRename(null);
    },
    onError: (error) => {
      console.error("Failed to rename user:", error);
      toast.error("שגיאה בעדכון השם");
    }
  });

  // 1. Fetch Users & Services (Shared Hook)
  const { allTrainees, allServices, activeClientsCount, traineesLoading } = useClientStats();

  // 2. Fetch Sessions (Shared Hook)
  const { sessions: allSessions } = useSessionStats();

  // 3. Fetch Training Plans (Shared Hook)
  const { plans: allPlans } = useProgramStats();

  // Helper: Calculate Age
  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const birthDate = new Date(dob);
    const ageDifMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  // Filtering logic
  const filteredTrainees = allTrainees.filter(trainee => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      trainee.full_name?.toLowerCase().includes(searchLower) ||
      trainee.email?.toLowerCase().includes(searchLower) ||
      trainee.phone?.includes(searchTerm);
    
    if (!matchesSearch) return false;

    // Type filter
    if (filterType === 'active') {
        // Active = has active service OR user status is 'active' and belongs to this coach
        const hasActiveService = allServices.some(s => s.trainee_id === trainee.id && s.status === 'פעיל');
        const isActiveUser = trainee.status === 'active' || trainee.client_status === 'לקוח פעיל';
        if (!hasActiveService && !isActiveUser) return false;
    } else if (filterType === 'paying') {
        // Check if user has paid services
        const hasPaidService = allServices.some(s => s.trainee_id === trainee.id && s.payment_status === 'שולם');
        if (!hasPaidService) return false;
    } else if (filterType === 'group') {
        // Check if user has any active group service
        const hasGroupService = allServices.some(s => s.trainee_id === trainee.id && s.status === 'פעיל' && (s.service_type || '').includes('קבוצ'));
        if (!hasGroupService) return false;
    }

    return true;
  });

  // Stats - Logic from Shared Hook
  const activeClients = activeClientsCount;
  const casualTrainees = allTrainees.length - activeClients;

  console.log("Page_ActiveClientsCount", activeClients);

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen overflow-y-auto overflow-x-hidden pb-24" dir="rtl" style={{ backgroundColor: '#F5F5F5', color: '#222222', WebkitOverflowScrolling: 'touch', maxWidth: '100vw' }}>
        <div className="max-w-7xl mx-auto px-4 md:p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-black mb-2" style={{ color: '#222222', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                  כל המשתמשים
                </h1>
                <p className="text-lg" style={{ color: '#666666' }}>
                  תצוגה מרכזית אחידה לכל המתאמנים במערכת
                </p>
              </div>
              <Button onClick={() => setIsAddTraineeOpen(true)}
                className="bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl font-bold h-11 px-5 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                הוסף מתאמן
              </Button>
            </div>
            <div className="w-20 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
          </div>



          {/* Search and Filter */}
          <div className="mb-8 p-4 rounded-xl bg-white shadow-sm" style={{ border: '1px solid #E0E0E0' }}>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#999999' }} />
                <Input
                  placeholder="חפש לפי שם, אימייל או טלפון..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-12 rounded-xl text-[#222222] placeholder:text-gray-400"
                  style={{ border: '1px solid #E0E0E0', backgroundColor: '#FAFAFA' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5" style={{ color: '#999999' }} />
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="rounded-xl w-48 text-[#222222]" style={{ border: '1px solid #E0E0E0', backgroundColor: '#FAFAFA' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E0E0E0] text-[#222222]">
                    <SelectItem value="all" className="hover:bg-gray-50">כל המשתמשים</SelectItem>
                    <SelectItem value="paying" className="hover:bg-gray-50">לקוחות משלמים</SelectItem>
                    <SelectItem value="casual" className="hover:bg-gray-50">מזדמנים</SelectItem>
                    <SelectItem value="active" className="hover:bg-gray-50">פעילים</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold" style={{ color: '#222222' }}>
              תוצאות ({filteredTrainees.length})
            </h2>
          </div>

          {/* Users Grid */}
          {traineesLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: '#FF6F20' }} />
              <p className="text-lg" style={{ color: '#666666' }}>טוען משתמשים...</p>
            </div>
          ) : filteredTrainees.length === 0 ? (
            <div className="p-12 rounded-xl text-center bg-white" style={{ border: '1px solid #E0E0E0' }}>
              <Users className="w-16 h-16 mx-auto mb-4" style={{ color: '#CCCCCC' }} />
              <h3 className="text-xl font-bold mb-2" style={{ color: '#222222' }}>
                לא נמצאו משתמשים
              </h3>
              <p className="text-base" style={{ color: '#666666' }}>
                נסה לשנות את הפילטרים או את מילות החיפוש
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTrainees.map((trainee) => {
                // --- Logic for Card Data ---
                
                // 1. Active Package
                const traineeServices = allServices.filter(s => s.trainee_id === trainee.id);
                const activePackage = traineeServices.find(s => 
                  s.status === 'פעיל' || 
                  (s.total_sessions > 0 && (s.used_sessions || 0) < s.total_sessions)
                );

                // 2. Upcoming Session
                const traineeSessions = allSessions.filter(s => 
                  s.participants?.some(p => p.trainee_id === trainee.id)
                );
                const now = new Date();
                const upcomingSession = traineeSessions
                  .filter(s => {
                    const sDate = new Date(`${s.date}T${s.time}`);
                    return sDate > now && (s.status === 'מאושר' || s.status === 'ממתין לאישור');
                  })
                  .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
                  [0];

                // 3. Training Plans Count
                const planCount = allPlans.filter(p => 
                  p.assigned_to === trainee.id || p.created_by === trainee.id
                ).length;

                return (
                  <UserCard 
                    key={trainee.id}
                    trainee={trainee}
                    activePackage={activePackage}
                    upcomingSession={upcomingSession}
                    planCount={planCount}
                    calculateAge={calculateAge}
                    onRename={(user) => {
                      setUserToRename(user);
                      setShowRenameDialog(true);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        <RenameUserDialog
          isOpen={showRenameDialog}
          onClose={() => {
            setShowRenameDialog(false);
            setUserToRename(null);
          }}
          onSubmit={(newName) => {
            if (userToRename) {
              renameUserMutation.mutate({ id: userToRename.id, fullName: newName });
            }
          }}
          user={userToRename}
          isLoading={renameUserMutation.isPending}
        />

        <AddTraineeDialog open={isAddTraineeOpen} onClose={() => setIsAddTraineeOpen(false)} />
      </div>
    </ProtectedCoachPage>
  );
}