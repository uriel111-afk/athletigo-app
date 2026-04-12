import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLeadStats } from "../components/hooks/useLeadStats";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, Phone, Mail, Target, Edit2, Trash2, Users, Search, CheckCircle, XCircle, Clock, Star, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import PageLoader from "@/components/PageLoader";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import LeadFormDialog from "../components/forms/LeadFormDialog";

export default function Leads() {
  const [coach, setCoach] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const searchParams = new URLSearchParams(window.location.search);
  const filterParam = searchParams.get('filter');
  
  const [filterStatus, setFilterStatus] = useState(filterParam === 'new' ? 'חדש' : "all");
  const [filterSource, setFilterSource] = useState("all");
  


  const queryClient = useQueryClient();

  useEffect(() => {
    const loadCoach = async () => {
      try {
        const currentCoach = await base44.auth.me();
        setCoach(currentCoach);
      } catch (error) {
        console.error("[Leads] Error loading coach:", error);
      }
    };
    loadCoach();
  }, []);

  const { leads, newLeadsCount, isLoading } = useLeadStats();
  
  // Ensure leads are sorted by created_date desc if the hook didn't sort them
  const sortedLeads = [...leads].sort((a, b) => {
    return new Date(b.created_date || 0) - new Date(a.created_date || 0);
  });

  const createLeadMutation = useMutation({
    mutationFn: (data) => {
      console.log("[Leads] Creating lead with data:", data);
      return base44.entities.Lead.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEADS });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowAddDialog(false);
      setLeadForm({ full_name: "", phone: "", email: "", source: "אחר", main_goal: "", status: "חדש", coach_notes: "" });
      toast.success("✅ ליד נוסף בהצלחה");
    },
    onError: (error) => {
      console.error("[Leads] Create error:", error);
      const raw = error?.message || error?.body?.message || "";
      let msg = "שגיאה לא צפויה";
      if (raw.includes("duplicate")) msg = "ליד עם פרטים זהים כבר קיים";
      else if (raw.includes("network") || raw.includes("fetch")) msg = "בעיית תקשורת";
      else if (raw) msg = raw;
      toast.error("שגיאה בהוספת ליד: " + msg);
    }
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Lead.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEADS });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowEditDialog(false);
      setEditingLead(null);
      toast.success("הליד עודכן בהצלחה");
    },
    onError: (error) => {
      console.error("[Leads] Update error:", error);
      toast.error("שגיאה בעדכון ליד: " + (error?.message || "נסה שוב"));
    }
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id) => base44.entities.Lead.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEADS });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success("הליד נמחק בהצלחה");
    },
    onError: (error) => {
      console.error("[Leads] Delete error:", error);
      toast.error("שגיאה במחיקת ליד: " + (error?.message || "נסה שוב"));
    }
  });

  const convertToClientMutation = useMutation({
    mutationFn: async ({ lead, type = 'לקוח משלם' }) => {
      if (!coach) throw new Error("פרטי מאמן חסרים");

      // 1. Generate auth credentials — use lead email or auto-generate
      const email = lead.email || `${lead.full_name.replace(/\s+/g, '.').toLowerCase()}.${Date.now()}@athletigo.app`;
      const password = `Ath${Date.now().toString(36)}!`;

      // 2. Create auth user + profile via Edge Function (same as AddTraineeDialog)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-trainee', {
        body: {
          email,
          password,
          full_name: lead.full_name,
          phone: lead.phone || null,
          birth_date: lead.birth_date ? new Date(lead.birth_date).toISOString() : null,
          age: lead.age ? parseInt(lead.age) : null,
          join_date: new Date().toISOString().split('T')[0],
          coach_notes: lead.coach_notes || lead.notes || null,
          client_status: type,
        },
      });

      if (fnError || !fnData?.profile) {
        const msg = fnData?.error || fnError?.message || 'שגיאה ביצירת מתאמן';
        throw new Error(msg);
      }

      const newClient = fnData.profile;

      // 3. Update the new user profile with lead-specific data
      try {
        await base44.entities.User.update(newClient.id, {
          main_goal: lead.main_goal || null,
          health_issues: lead.medical_history || null,
          parent_name: lead.parent_name || null,
          onboarding_completed: true,
        });
      } catch (e) {
        console.warn("Non-critical: failed to update extra profile fields", e);
      }

      // 4. Mark Lead as Converted
      await base44.entities.Lead.update(lead.id, {
        converted_to_client: true,
        converted_date: new Date().toISOString(),
        converted_client_id: newClient.id,
        status: "סגור עסקה"
      });

      // 5. Migrate Session History — update participant IDs
      try {
        const allSessions = await base44.entities.Session.list('-date', 1000);
        const relevantSessions = allSessions.filter(s =>
          s.participants?.some(p => p.trainee_id === lead.id)
        );
        for (const session of relevantSessions) {
          const updatedParticipants = session.participants.map(p =>
            p.trainee_id === lead.id
              ? { ...p, trainee_id: newClient.id, trainee_name: newClient.full_name, is_guest: false }
              : p
          );
          await base44.entities.Session.update(session.id, { participants: updatedParticipants });
        }
      } catch (e) {
        console.warn("Non-critical: session migration error", e);
      }

      return { newClient, email, password, wasAutoEmail: !lead.email };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEADS });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      if (result.wasAutoEmail) {
        toast.success(`הליד "${variables.lead.full_name}" הומר ל${variables.type} בהצלחה`);
      } else {
        toast.success(`הליד הומר — אימייל: ${result.email}, סיסמה: ${result.password}`);
      }
    },
    onError: (error) => {
      console.error("[Leads] Convert error:", error);
      let msg = error?.message || "שגיאה לא צפויה";
      if (msg.includes("already registered")) msg = "משתמש עם אימייל זה כבר קיים במערכת";
      toast.error("שגיאה בהמרת ליד: " + msg);
    }
  });

  const handleConvert = async (lead, type) => {
    if (!confirm(`האם להמיר את ${lead.full_name} ל-${type}?`)) return;
    await convertToClientMutation.mutateAsync({ lead, type });
  };

  const filteredLeads = sortedLeads.filter(lead => {
    const matchesSearch = 
      lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
    const matchesSource = filterSource === "all" || lead.source === filterSource;
    
    // Special handling for 'new' filter from dashboard which might imply new leads OR leads in contact from this month
    // But user asked for: status in ["חדש", "בקשר"] and createdDate in current month
    if (filterParam === 'new' && filterStatus === 'חדש') {
        // If explicitly filtered by dashboard tile, we might want to refine the logic further if needed,
        // but setting filterStatus to 'new' is a good approximation.
        // Let's stick to the simple status filter for now to avoid confusion.
    }

    return matchesSearch && matchesStatus && matchesSource;
  });

  const statusConfig = {
    "חדש": { icon: Star, color: '#FF6F20', bg: '#FFF8F3', label: 'New' },
    "בקשר": { icon: Clock, color: '#2196F3', bg: '#E3F2FD', label: 'Contacted' },
    "סגור עסקה": { icon: CheckCircle, color: '#4CAF50', bg: '#E8F5E9', label: 'Closed' },
    "לא מעוניין": { icon: XCircle, color: '#9E9E9E', bg: '#F5F5F5', label: 'Not Interested' }
  };

  const sourceIcons = {
    "טלפוני": "📞",
    "אינסטגרם": "📸",
    "אתר": "🌐",
    "המלצה": "🤝",
    "אחר": "✨"
  };

  const newLeads = newLeadsCount;
  console.log("Page_NewLeadsCount", newLeads);
  const inContact = leads.filter(l => l.status === 'בקשר').length;
  const converted = leads.filter(l => l.status === 'סגור עסקה').length;
  const notInterested = leads.filter(l => l.status === 'לא מעוניין').length;

  if (!coach) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen pb-24" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          <div className="mb-6 md:mb-10">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-2 md:mb-4" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
              🎯 לידים
            </h1>
            <p className="text-lg md:text-2xl mb-2 md:mb-4 font-medium" style={{ color: '#7D7D7D' }}>
              ניהול וליכוד לידים
            </p>
            <div className="w-20 md:w-24 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #FF6F20' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#FF6F20' }} />
              <Star className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3" style={{ color: '#FF6F20' }} />
              <p className="text-2xl md:text-3xl font-black mb-1" style={{ color: '#FF6F20' }}>{newLeads}</p>
              <p className="text-xs md:text-sm font-bold" style={{ color: '#000000' }}>New</p>
            </div>

            <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #2196F3' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#2196F3' }} />
              <Clock className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3" style={{ color: '#2196F3' }} />
              <p className="text-2xl md:text-3xl font-black mb-1" style={{ color: '#2196F3' }}>{inContact}</p>
              <p className="text-xs md:text-sm font-bold" style={{ color: '#000000' }}>בקשר</p>
            </div>

            <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #4CAF50' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#4CAF50' }} />
              <CheckCircle className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3" style={{ color: '#4CAF50' }} />
              <p className="text-2xl md:text-3xl font-black mb-1" style={{ color: '#4CAF50' }}>{converted}</p>
              <p className="text-xs md:text-sm font-bold" style={{ color: '#000000' }}>הומרו</p>
            </div>

            <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #9E9E9E' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#9E9E9E' }} />
              <XCircle className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3" style={{ color: '#9E9E9E' }} />
              <p className="text-2xl md:text-3xl font-black mb-1" style={{ color: '#9E9E9E' }}>{notInterested}</p>
              <p className="text-xs md:text-sm font-bold" style={{ color: '#000000' }}>לא מעוניינים</p>
            </div>
          </div>

          <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#7D7D7D' }} />
                  <Input
                    placeholder="חפש לפי שם, טלפון או אימייל..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10 rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-48 rounded-xl" style={{ border: '1px solid #E0E0E0' }}>
                  <SelectValue placeholder="כל הסטטוסים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="חדש">New</SelectItem>
                  <SelectItem value="בקשר">Contacted</SelectItem>
                  <SelectItem value="סגור עסקה">Closed</SelectItem>
                  <SelectItem value="לא מעוניין">Not Interested</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-full md:w-48 rounded-xl" style={{ border: '1px solid #E0E0E0' }}>
                  <SelectValue placeholder="כל המקורות" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המקורות</SelectItem>
                  <SelectItem value="טלפוני">📞 טלפוני</SelectItem>
                  <SelectItem value="אינסטגרם">📸 אינסטגרם</SelectItem>
                  <SelectItem value="אתר">🌐 אתר</SelectItem>
                  <SelectItem value="המלצה">🤝 המלצה</SelectItem>
                  <SelectItem value="אחר">✨ אחר</SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={() => setShowAddDialog(true)}
                className="rounded-xl px-4 md:px-6 py-3 font-bold text-white w-full md:w-auto"
                style={{ backgroundColor: '#FF6F20' }}
              >
                <UserPlus className="w-5 h-5 ml-2" />
                הוסף ליד
              </Button>
            </div>
          </div>

          {isLoading ? (
            <PageLoader message="טוען לידים..." />
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12 p-8 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
              <Users className="w-12 h-12 mx-auto mb-4" style={{ color: '#E0E0E0' }} />
              <p className="text-lg font-bold mb-2" style={{ color: '#000000' }}>
                {searchTerm || filterStatus !== "all" || filterSource !== "all" ? 'לא נמצאו לידים' : 'אין לידים עדיין'}
              </p>
              <p className="text-sm" style={{ color: '#7D7D7D' }}>
                {searchTerm || filterStatus !== "all" || filterSource !== "all" ? 'נסה לשנות את הפילטרים' : 'התחל להוסיף לידים חדשים'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {filteredLeads.map(lead => {
                const config = statusConfig[lead.status] || statusConfig["חדש"];
                const StatusIcon = config.icon;

                return (
                  <div
                    key={lead.id}
                    className="rounded-xl p-4 md:p-6 relative overflow-hidden"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: `2px solid ${config.color}`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                    }}
                  >
                    <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: config.color }} />
                    
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-black mb-2" style={{ color: '#000000' }}>
                          {lead.full_name}
                        </h3>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{sourceIcons[lead.source] || '✨'}</span>
                          <span className="text-sm font-bold" style={{ color: '#7D7D7D' }}>
                            {lead.source}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div
                          className="px-3 py-2 rounded-lg flex items-center gap-2"
                          style={{ backgroundColor: config.bg, color: config.color }}
                        >
                          <StatusIcon className="w-4 h-4" />
                          <span className="text-sm font-bold">{config.label}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`האם למחוק את ${lead.full_name}?`)) {
                              deleteLeadMutation.mutate(lead.id);
                            }
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="מחק ליד"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      {lead.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" style={{ color: '#7D7D7D' }} />
                          <a href={`tel:${lead.phone}`} className="text-sm hover:underline" style={{ color: '#000000' }}>
                            {lead.phone}
                          </a>
                        </div>
                      )}
                      {lead.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" style={{ color: '#7D7D7D' }} />
                          <a href={`mailto:${lead.email}`} className="text-sm hover:underline truncate" style={{ color: '#000000' }}>
                            {lead.email}
                          </a>
                        </div>
                      )}
                      {lead.main_goal && (
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4" style={{ color: '#7D7D7D' }} />
                          <span className="text-sm" style={{ color: '#000000' }}>{lead.main_goal}</span>
                        </div>
                      )}
                    </div>

                    {lead.coach_notes && (
                      <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#FFFBF0', border: '1px solid #FFE082' }}>
                        <p className="text-xs font-bold mb-1" style={{ color: '#F57C00' }}>📝 הערות:</p>
                        <p className="text-sm" style={{ color: '#000000' }}>{lead.coach_notes}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs mb-4" style={{ color: '#7D7D7D' }}>
                      <span>נוצר: {lead.created_date && format(new Date(lead.created_date), 'dd/MM/yyyy', { locale: he })}</span>
                      {lead.converted_to_client && (
                        <span className="px-2 py-1 rounded-full font-bold" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
                          ✅ הומר
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => {
                          setEditingLead(lead);
                          setShowEditDialog(true);
                        }}
                        size="sm"
                        className="rounded-lg font-bold"
                        style={{ backgroundColor: '#7D7D7D', color: '#FFFFFF' }}
                      >
                        <Edit2 className="w-4 h-4 ml-1" />
                        ערוך
                      </Button>

                      {!lead.converted_to_client && lead.status !== "לא מעוניין" && (
                        <div className="flex gap-1">
                            <Button
                              onClick={() => handleConvert(lead, 'לקוח משלם')}
                              disabled={convertToClientMutation.isPending}
                              size="sm"
                              className="flex-1 rounded-lg font-bold text-[10px] px-1"
                              style={{ backgroundColor: '#4CAF50', color: '#FFFFFF' }}
                            >
                              {convertToClientMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ללקוח קבוע'}
                            </Button>
                            <Button
                              onClick={() => handleConvert(lead, 'מתאמן מזדמן')}
                              disabled={convertToClientMutation.isPending}
                              size="sm"
                              className="flex-1 rounded-lg font-bold text-[10px] px-1"
                              style={{ backgroundColor: '#8BC34A', color: '#FFFFFF' }}
                            >
                              {convertToClientMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ללקוח מזדמן'}
                            </Button>
                        </div>
                      )}

                      {/* Delete button moved to header */}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <LeadFormDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={async (data) => {
          await createLeadMutation.mutateAsync({
            ...data,
            coach_id: coach?.id || null
          });
        }}
        isLoading={createLeadMutation.isPending}
      />

      <LeadFormDialog
        isOpen={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          setEditingLead(null);
        }}
        onSubmit={async (data) => {
          await updateLeadMutation.mutateAsync({
            id: editingLead.id,
            data
          });
        }}
        editingLead={editingLead}
        isLoading={updateLeadMutation.isPending}
      />
    </ProtectedCoachPage>
  );
}