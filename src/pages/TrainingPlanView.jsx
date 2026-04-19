import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProtectedCoachPage from "@/components/ProtectedCoachPage";
import UnifiedPlanBuilder from "@/components/training/UnifiedPlanBuilder";

/**
 * TrainingPlanView — loads a plan by ?planId= and renders the full
 * UnifiedPlanBuilder editor (canEdit + isCoach).
 *
 * This gives all three exercise-editor contexts:
 *   1. Add exercise  → SectionCard "+" → ModernExerciseForm dialog
 *   2. Edit exercise → SectionCard pencil → ModernExerciseForm dialog
 *   3. Add section   → "הוסף סקשן חדש" button → SectionForm dialog
 */
export default function TrainingPlanView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("planId");

  const {
    data: plan,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["training-plan-single", planId],
    queryFn: async () => {
      const result = await base44.entities.TrainingPlan.get(planId);
      if (!result) throw new Error('Plan not found');
      return result;
    },
    enabled: !!planId,
    retry: 1,
  });

  if (isError) {
    console.error('[TrainingPlanView] Failed to load plan:', planId, error?.message);
  }

  // ── No planId in URL ───────────────────────────────────────────────────
  if (!planId) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center" dir="rtl">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-4">לא צוין מזהה תוכנית</p>
            <Button
              onClick={() => navigate(createPageUrl("ActivePlans"))}
              className="bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl"
            >
              חזור לרשימה
            </Button>
          </div>
        </div>
      </ProtectedCoachPage>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20]" />
        </div>
      </ProtectedCoachPage>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────
  if (isError || !plan) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center" dir="rtl">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium mb-4">לא ניתן לטעון את התוכנית</p>
            <Button
              onClick={() => navigate(createPageUrl("ActivePlans"))}
              className="bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl"
            >
              חזור לרשימה
            </Button>
          </div>
        </div>
      </ProtectedCoachPage>
    );
  }

  // ── Render editor ──────────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      <UnifiedPlanBuilder
        plan={plan}
        isCoach={true}
        canEdit={true}
        onBack={() => navigate(createPageUrl("ActivePlans"))}
      />
    </ProtectedCoachPage>
  );
}
