import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Plus, Edit2, Trash2, ChevronLeft,
  Search, Loader2, User, Target, Calendar
} from "lucide-react";
import { toast } from "sonner";
import PageLoader from "@/components/PageLoader";
import ProtectedCoachPage from "@/components/ProtectedCoachPage";
import PlanFormDialog from "@/components/training/PlanFormDialog";
import ViewToggle, { useViewToggle } from "@/components/ViewToggle";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { notifyPlanCreated } from "@/functions/notificationTriggers";

export default function ActivePlans() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTrainee, setFilterTrainee] = useState("all");
  const [view, setView] = useViewToggle('plans_view', 'list');

  // ── Coach ──────────────────────────────────────────────────────────────
  const { data: coach } = useQuery({
    queryKey: ["current-coach-activeplans"],
    queryFn: () => base44.auth.me(),
    retry: 2,
  });

  // ── Plans ──────────────────────────────────────────────────────────────
  const { data: plans = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.PLANS,
    queryFn: () => base44.entities.TrainingPlan.list("-created_at", 1000),
    initialData: [],
  });

  // ── Trainees (for PlanFormDialog) ──────────────────────────────────────
  const { data: trainees = [] } = useQuery({
    queryKey: ["trainees-active-plans"],
    queryFn: async () => {
      const all = await base44.entities.User.list("-created_at", 500);
      return all.filter(
        (u) => !u.account_deleted && u.role !== "admin" && u.user_role !== "coach"
      );
    },
    initialData: [],
  });

  // ── Unique trainees from plans ──────────────────────────────────────
  const traineeOptions = [...new Map(
    plans.filter(p => p.assigned_to && p.assigned_to_name)
      .map(p => [p.assigned_to, { id: p.assigned_to, name: p.assigned_to_name }])
  ).values()];

  // ── Filtered list ──────────────────────────────────────────────────────
  const activePlans = plans.filter((p) => {
    if (p.status !== "פעילה") return false;
    if (filterTrainee !== "all" && p.assigned_to !== filterTrainee) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      p.plan_name?.toLowerCase().includes(q) ||
      p.assigned_to_name?.toLowerCase().includes(q)
    );
  });

  // ── Create Mutation ────────────────────────────────────────────────────
  const createPlanMutation = useMutation({
    mutationFn: async ({ planData, selectedTrainees }) => {
      if (!coach?.id) throw new Error("פרטי מאמן חסרים");
      const goalFocusArray =
        Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0
          ? planData.goal_focus
          : ["כוח"];

      const base = {
        title: planData.plan_name,
        plan_name: planData.plan_name,
        created_by: coach.id,
        created_by_name: coach.full_name,
        goal_focus: goalFocusArray,
        description: planData.description || "",
        start_date: new Date().toISOString().split("T")[0],
        status: "פעילה",
        is_template: false,
      };

      const targets =
        selectedTrainees && selectedTrainees.length > 0
          ? selectedTrainees
          : [null];

      const results = [];
      for (const tid of targets) {
        const trainee = trainees.find((t) => t.id === tid);
        const result = await base44.entities.TrainingPlan.create({
          ...base,
          assigned_to: trainee?.id || "",
          assigned_to_name: trainee?.full_name || "",
        });
        results.push(result);
        if (trainee?.id) {
          try {
            await notifyPlanCreated({
              traineeId: trainee.id,
              planName: planData.plan_name,
              coachName: coach.full_name,
            });
          } catch {}
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLANS });
      setShowPlanDialog(false);
      toast.success("✅ תוכנית נוצרה בהצלחה!");
      if (results && results.length === 1 && results[0]?.id) {
        navigate(createPageUrl("PlanBuilder") + `?planId=${results[0].id}`);
      }
    },
    onError: (err) =>
      toast.error("❌ שגיאה ביצירת תוכנית: " + (err.message || "נסה שוב")),
  });

  // ── Update Mutation ────────────────────────────────────────────────────
  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TrainingPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLANS });
      setShowPlanDialog(false);
      setEditingPlan(null);
      toast.success("✅ תוכנית עודכנה");
    },
    onError: (err) =>
      toast.error("❌ שגיאה בעדכון: " + (err.message || "נסה שוב")),
  });

  // ── Delete Mutation ────────────────────────────────────────────────────
  const deletePlanMutation = useMutation({
    mutationFn: (id) => base44.entities.TrainingPlan.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLANS });
      toast.success("✅ תוכנית נמחקה");
    },
    onError: (err) =>
      toast.error("❌ שגיאה במחיקה: " + (err.message || "נסה שוב")),
  });

  const handleDelete = (plan) => {
    if (!window.confirm(`למחוק את תוכנית "${plan.plan_name}"?`)) return;
    deletePlanMutation.mutate(plan.id);
  };

  const handleEdit = (plan) => {
    setEditingPlan(plan);
    setShowPlanDialog(true);
  };

  const handleSubmit = (data) => {
    if (editingPlan) {
      const goalFocusArray =
        Array.isArray(data.planData.goal_focus) &&
        data.planData.goal_focus.length > 0
          ? data.planData.goal_focus
          : ["כוח"];
      updatePlanMutation.mutate({
        id: editingPlan.id,
        data: {
          plan_name: data.planData.plan_name,
          title: data.planData.plan_name,
          goal_focus: goalFocusArray,
          description: data.planData.description || "",
        },
      });
    } else {
      createPlanMutation.mutate(data);
    }
  };

  if (!coach) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF6F20]" />
        </div>
      </ProtectedCoachPage>
    );
  }

  return (
    <ProtectedCoachPage>
      <div
        className="min-h-screen pb-20 overflow-x-hidden"
        dir="rtl"
        style={{ backgroundColor: "#F5F5F5" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-[#FF6F20]" />
              תוכניות פעילות
            </h1>
            <Button
              onClick={() => {
                setEditingPlan(null);
                setShowPlanDialog(true);
              }}
              className="bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl font-bold h-11 px-4 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              תוכנית חדשה
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="חיפוש..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-9 rounded-xl h-11 bg-white border-gray-200" />
            </div>
            {traineeOptions.length > 1 && (
              <Select value={filterTrainee} onValueChange={setFilterTrainee}>
                <SelectTrigger className="w-40 rounded-xl h-11 bg-white border-gray-200"><SelectValue placeholder="כל המתאמנים" /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">כל המתאמנים</SelectItem>
                  {traineeOptions.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <ViewToggle view={view} onChange={setView} />
          </div>
          <p className="text-xs text-gray-400 mb-3">מציג {activePlans.length} מתוך {plans.filter(p => p.status === "פעילה").length} תוכניות</p>

          {/* Loading */}
          {isLoading && (
            <PageLoader message="טוען תוכניות..." />
          )}

          {/* Empty State */}
          {!isLoading && activePlans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-200 text-center">
              <ClipboardList className="w-14 h-14 text-gray-200 mb-4" />
              <h3 className="text-lg font-bold text-gray-700 mb-1">
                {searchTerm ? "לא נמצאו תוצאות" : "אין תוכניות פעילות"}
              </h3>
              <p className="text-sm text-gray-400 mb-6">
                {searchTerm
                  ? "נסה מילת חיפוש אחרת"
                  : "צור את התוכנית הראשונה שלך עכשיו"}
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => {
                    setEditingPlan(null);
                    setShowPlanDialog(true);
                  }}
                  className="bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl font-bold px-6"
                >
                  <Plus className="w-4 h-4 ml-2" />
                  צור תוכנית ראשונה
                </Button>
              )}
            </div>
          )}

          {/* Plans List / Grid */}
          {!isLoading && activePlans.length > 0 && (
            <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
              {activePlans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  {/* Orange bar */}
                  <div className="h-1 w-full bg-[#FF6F20]" />

                  <div className="p-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-base text-gray-900 leading-snug truncate">
                          {plan.plan_name || plan.title || "תוכנית ללא שם"}
                        </h3>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          <span>{plan.assigned_to_name || "לא שויך"}</span>
                        </div>
                      </div>

                      {/* Action icons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(plan)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50 transition-colors"
                          title="עריכה"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(plan)}
                          disabled={deletePlanMutation.isPending}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="מחיקה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {Array.isArray(plan.goal_focus) &&
                        plan.goal_focus.map((g) => (
                          <span
                            key={g}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "#FFF3E0",
                              color: "#FF6F20",
                            }}
                          >
                            {g}
                          </span>
                        ))}
                      {Array.isArray(plan.weekly_days) &&
                        plan.weekly_days.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {plan.weekly_days.length} ימים בשבוע
                          </span>
                        )}
                    </div>

                    {/* Open button */}
                    <button
                      onClick={() =>
                        navigate(
                          createPageUrl("PlanBuilder") +
                            `?planId=${plan.id}`
                        )
                      }
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                      style={{
                        backgroundColor: "#F5F5F5",
                        color: "#222222",
                      }}
                    >
                      <span>פתח תוכנית</span>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan Form Dialog */}
        <PlanFormDialog
          isOpen={showPlanDialog}
          onClose={() => {
            setShowPlanDialog(false);
            setEditingPlan(null);
          }}
          onSubmit={handleSubmit}
          trainees={trainees}
          editingPlan={
            editingPlan
              ? {
                  ...editingPlan,
                  goal_focus: Array.isArray(editingPlan.goal_focus)
                    ? editingPlan.goal_focus
                    : editingPlan.goal_focus
                    ? editingPlan.goal_focus.split(", ").filter(Boolean)
                    : [],
                }
              : null
          }
          isLoading={
            createPlanMutation.isPending || updatePlanMutation.isPending
          }
        />
      </div>
    </ProtectedCoachPage>
  );
}
