import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowRight, ClipboardList, User, Target, Calendar,
  Loader2, ChevronDown, ChevronUp, Dumbbell, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ProtectedCoachPage from "@/components/ProtectedCoachPage";
import { format } from "date-fns";
import { he } from "date-fns/locale";

const WEEK_DAY_LABELS = {
  ראשון: "א׳", שני: "ב׳", שלישי: "ג׳", רביעי: "ד׳",
  חמישי: "ה׳", שישי: "ו׳", שבת: "ש׳",
};

export default function TrainingPlanView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("planId");

  // ── Plan ───────────────────────────────────────────────────────────────
  const {
    data: plan,
    isLoading: planLoading,
    isError: planError,
  } = useQuery({
    queryKey: ["training-plan-view", planId],
    queryFn: () => base44.entities.TrainingPlan.get(planId),
    enabled: !!planId,
    retry: 1,
  });

  // ── Sections ───────────────────────────────────────────────────────────
  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["plan-sections", planId],
    queryFn: () =>
      base44.entities.TrainingSection.filter(
        { training_plan_id: planId },
        "order"
      ),
    enabled: !!planId,
    retry: 1,
  });

  // ── Exercises ──────────────────────────────────────────────────────────
  const { data: exercises = [], isLoading: exercisesLoading } = useQuery({
    queryKey: ["plan-exercises", planId],
    queryFn: () =>
      base44.entities.Exercise.filter({ training_plan_id: planId }),
    enabled: !!planId,
    retry: 1,
  });

  const isLoading = planLoading || sectionsLoading || exercisesLoading;

  // Helper: exercises for a section
  const sectionExercises = (sectionId) =>
    exercises
      .filter((e) => e.training_section_id === sectionId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!planId) {
    return (
      <ProtectedCoachPage>
        <div className="min-h-screen flex items-center justify-center" dir="rtl">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">לא צוין מזהה תוכנית</p>
            <Button
              onClick={() => navigate(createPageUrl("ActivePlans"))}
              className="mt-4 bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl"
            >
              חזור לרשימה
            </Button>
          </div>
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
        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="w-4 h-4 text-gray-600" />
          </button>
          <span className="font-black text-base text-gray-900 truncate flex-1">
            {plan?.plan_name || plan?.title || "תוכנית אימון"}
          </span>
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor:
                plan?.status === "פעילה" ? "#E8F5E9" : "#F5F5F5",
              color: plan?.status === "פעילה" ? "#4CAF50" : "#999",
            }}
          >
            {plan?.status || ""}
          </span>
        </div>

        {isLoading && (
          <div className="flex justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20]" />
          </div>
        )}

        {planError && !planLoading && (
          <div className="max-w-xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">לא ניתן לטעון את התוכנית</p>
            <Button
              onClick={() => navigate(createPageUrl("ActivePlans"))}
              className="mt-4 bg-[#FF6F20] hover:bg-[#e65b12] text-white rounded-xl"
            >
              חזור לרשימה
            </Button>
          </div>
        )}

        {!isLoading && plan && (
          <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
            {/* Plan Info Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-1 w-full bg-[#FF6F20]" />
              <div className="p-5 space-y-4">
                <h2 className="text-xl font-black text-gray-900">
                  {plan.plan_name || plan.title}
                </h2>

                {/* Trainee */}
                {plan.assigned_to_name && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center">
                      <User className="w-4 h-4 text-[#FF6F20]" />
                    </div>
                    <span className="font-medium">{plan.assigned_to_name}</span>
                  </div>
                )}

                {/* Goal focus tags */}
                {Array.isArray(plan.goal_focus) && plan.goal_focus.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-1.5">
                      מוקדי אימון
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.goal_focus.map((g) => (
                        <span
                          key={g}
                          className="text-xs font-bold px-3 py-1 rounded-full"
                          style={{ backgroundColor: "#FFF3E0", color: "#FF6F20" }}
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Weekly days */}
                {Array.isArray(plan.weekly_days) && plan.weekly_days.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> ימי אימון
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.weekly_days.map((d) => (
                        <span
                          key={d}
                          className="text-xs font-bold w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-700"
                        >
                          {WEEK_DAY_LABELS[d] || d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {plan.description && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-1">תיאור</p>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {plan.description}
                    </p>
                  </div>
                )}

                {/* Created at */}
                {plan.created_at && (
                  <p className="text-[11px] text-gray-400">
                    נוצר ב‑
                    {format(new Date(plan.created_at), "d בMMMM yyyy", {
                      locale: he,
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Sections */}
            <div>
              <h3 className="text-base font-black text-gray-800 mb-3 flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-[#FF6F20]" />
                סקשנים ותרגילים
              </h3>

              {sections.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                  <Dumbbell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium text-sm">
                    עדיין לא הוספו סקשנים לתוכנית זו
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    כנס לעריכת התוכנית המלאה כדי להוסיף סקשנים ותרגילים
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sections.map((section, idx) => {
                    const exs = sectionExercises(section.id);
                    return (
                      <SectionBlock
                        key={section.id}
                        section={section}
                        exercises={exs}
                        index={idx}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Navigate to full editor */}
            <Button
              onClick={() =>
                navigate(
                  createPageUrl("TrainingPlans") + `?planId=${plan.id}`
                )
              }
              variant="outline"
              className="w-full h-11 rounded-xl border-[#FF6F20] text-[#FF6F20] font-bold hover:bg-orange-50"
            >
              <ClipboardList className="w-4 h-4 ml-2" />
              פתח בעורך המלא
            </Button>
          </div>
        )}
      </div>
    </ProtectedCoachPage>
  );
}

// ── Section Block (collapsible) ───────────────────────────────────────────
function SectionBlock({ section, exercises, index }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-right hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-base flex-shrink-0">
            {section.icon || "📌"}
          </div>
          <div className="text-right">
            <p className="font-black text-sm text-gray-900">
              {section.section_name || `סקשן ${index + 1}`}
            </p>
            <p className="text-[11px] text-gray-400">
              {section.category && `${section.category} • `}
              {exercises.length} תרגילים
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {exercises.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">
              אין תרגילים בסקשן זה
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {exercises.map((ex, i) => (
                <div key={ex.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-[10px] font-black text-gray-500 flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">
                      {ex.exercise_name || "תרגיל"}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {[
                        ex.sets && `${ex.sets} סטים`,
                        ex.reps && `${ex.reps} חזרות`,
                        ex.weight && `${ex.weight} ק"ג`,
                        ex.duration && `${ex.duration} שניות`,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
