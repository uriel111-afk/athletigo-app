import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

const COACH_STEPS = [
  { key: "trainees", label: "טוען מתאמנים", queryKey: QUERY_KEYS.TRAINEES,
    fn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    }},
  { key: "services", label: "טוען שירותים", queryKey: QUERY_KEYS.SERVICES,
    fn: () => base44.entities.ClientService.list('-created_at', 2000).catch(() => []) },
  { key: "sessions", label: "טוען מפגשים", queryKey: QUERY_KEYS.SESSIONS,
    fn: () => base44.entities.Session.list('-date', 1000).catch(() => []) },
  { key: "plans", label: "טוען תוכניות", queryKey: QUERY_KEYS.PLANS,
    fn: () => base44.entities.TrainingPlan.list('-created_at', 1000).catch(() => []) },
  { key: "leads", label: "טוען לידים", queryKey: QUERY_KEYS.LEADS,
    fn: () => base44.entities.Lead.list('-created_at', 1000).catch(() => []) },
];

const buildTraineeSteps = (userId) => [
  { key: "plans", label: "טוען תוכניות אימון",
    queryKey: ['training-plans', userId],
    fn: () => base44.entities.TrainingPlan.filter({ assigned_to: userId }, '-start_date').catch(() => []) },
  { key: "sessions", label: "טוען מפגשים",
    queryKey: ['trainee-sessions', userId],
    fn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const all = await base44.entities.Session.filter({ date: { $gte: today } }, 'date', 100).catch(() => []);
      return all.filter(s => s.participants?.some(p => p.trainee_id === userId));
    }},
  { key: "notifications", label: "טוען התראות",
    queryKey: ['notifications', userId],
    fn: () => base44.entities.Notification.filter({ user_id: userId }, '-created_at').catch(() => []) },
  { key: "services", label: "טוען חבילות",
    queryKey: ['trainee-services', userId],
    fn: () => base44.entities.ClientService.filter({ trainee_id: userId }).catch(() => []) },
  { key: "measurements", label: "טוען מדידות",
    queryKey: ['my-measurements'],
    fn: () => base44.entities.Measurement.filter({ trainee_id: userId }, '-date').catch(() => []) },
  { key: "results", label: "טוען שיאים",
    queryKey: ['my-results'],
    fn: () => base44.entities.ResultsLog.filter({ trainee_id: userId }, '-date').catch(() => []) },
];

const TIMEOUT_MS = 15000;

export function useDataGate(user) {
  const queryClient = useQueryClient();
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("מתחבר...");
  const [timedOut, setTimedOut] = useState(false);
  const ranRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (!user || ranRef.current) return;
    ranRef.current = true;

    setProgress(10);
    setLabel("טוען משתמש...");

    const isCoach = user.is_coach === true || user.role === 'coach' || user.role === 'admin';
    const steps = isCoach ? COACH_STEPS : buildTraineeSteps(user.id);

    const total = steps.length;
    let completed = 0;
    const prefetchOpts = { staleTime: CACHE_CONFIG.STALE_TIME };

    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);

    const promises = steps.map(async (step) => {
      setLabel(step.label);
      try {
        await queryClient.prefetchQuery({
          queryKey: step.queryKey,
          queryFn: step.fn,
          ...prefetchOpts,
        });
      } catch (e) {
        console.warn(`[DataGate] ${step.key} failed:`, e);
      }
      completed++;
      setProgress(Math.round(10 + (completed / total) * 90));
      if (completed < total) {
        const nextPending = steps.find((_, i) => i >= completed);
        if (nextPending) setLabel(nextPending.label);
      }
    });

    await Promise.all(promises);
    clearTimeout(timer);
    setProgress(100);
    setLabel("מוכן");
    setIsReady(true);
  }, [user, queryClient]);

  useEffect(() => {
    if (user && !ranRef.current) loadAll();
  }, [user, loadAll]);

  const retry = useCallback(() => {
    ranRef.current = false;
    setTimedOut(false);
    setProgress(0);
    setIsReady(false);
    loadAll();
  }, [loadAll]);

  const forceReady = useCallback(() => {
    setIsReady(true);
    setTimedOut(false);
  }, []);

  return { isReady, progress, label, timedOut, retry, forceReady };
}
