import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { CACHE_CONFIG } from "@/components/utils/queryKeys";

const todayISO = () => new Date().toISOString().split("T")[0];

// Coach "Challenges" page data — trainees, skill tracks, their milestones,
// per-track challenges, and today's sent daily challenges, fetched in one
// shot and cached. Mutations on the page invalidate ["coach-challenges", coachId]
// so changes reflect immediately, and switching pages no longer re-runs the
// whole fetch behind a PageLoader.
export function useCoachChallenges(coachId) {
  return useQuery({
    queryKey: ["coach-challenges", coachId],
    enabled: !!coachId,
    staleTime: CACHE_CONFIG.STALE_TIME,
    queryFn: async () => {
      const { data: traineeRows } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("coach_id", coachId)
        .order("full_name");
      const trainees = traineeRows || [];

      const { data: tracks, error: trackErr } = await supabase
        .from("skill_tracks")
        .select("*")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      if (trackErr) console.warn("[Challenges] tracks:", trackErr);
      const allTracks = tracks || [];

      let trackMilestones = {};
      let trackChallenges = {};
      const trackIds = allTracks.map(t => t.id);
      if (trackIds.length > 0) {
        const { data: ms } = await supabase
          .from("goal_milestones")
          .select("*")
          .in("track_id", trackIds)
          .order("value", { ascending: true });
        const grouped = {};
        for (const m of (ms || [])) {
          if (!grouped[m.track_id]) grouped[m.track_id] = [];
          grouped[m.track_id].push(m);
        }
        trackMilestones = grouped;

        const { data: stages } = await supabase
          .from("skill_stages")
          .select("id, track_id")
          .in("track_id", trackIds);
        const stageIds = (stages || []).map(s => s.id);
        const stageToTrack = {};
        for (const s of (stages || [])) stageToTrack[s.id] = s.track_id;
        if (stageIds.length > 0) {
          const { data: ch } = await supabase
            .from("skill_challenges")
            .select("*")
            .in("stage_id", stageIds)
            .order("sort_order", { ascending: true });
          const byTrack = {};
          for (const c of (ch || [])) {
            const tid = stageToTrack[c.stage_id];
            if (!tid) continue;
            if (!byTrack[tid]) byTrack[tid] = [];
            byTrack[tid].push(c);
          }
          trackChallenges = byTrack;
        }
      }

      const today = todayISO();
      const { data: tc } = await supabase
        .from("notifications")
        .select("id, user_id, type, message, is_read")
        .eq("type", "daily_challenge")
        .gte("created_at", today + "T00:00:00");
      const todayChallenges = tc || [];
      console.log("[Challenges] loaded —", { tracks: allTracks.length, today: todayChallenges.length });

      return { trainees, allTracks, trackMilestones, trackChallenges, todayChallenges };
    },
  });
}
