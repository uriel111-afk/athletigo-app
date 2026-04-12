import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { QUERY_KEYS, CACHE_CONFIG } from "@/components/utils/queryKeys";

const STEPS = [
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

    if (!isCoach) {
      // Trainee — no blocking data gate needed
      setProgress(100);
      setLabel("מוכן");
      setIsReady(true);
      return;
    }

    // Coach — load all data in parallel, track progress
    const total = STEPS.length;
    let completed = 0;
    const prefetchOpts = { staleTime: CACHE_CONFIG.STALE_TIME };

    // Set up timeout
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);

    const promises = STEPS.map(async (step) => {
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
        const nextPending = STEPS.find((s, i) => i >= completed);
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
