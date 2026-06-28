// ═══════════════════════════════════════════════════════════════════
// Course player — course_progress API + TanStack Query hooks
// ═══════════════════════════════════════════════════════════════════
// course_progress: user_id, course_drop_id, chapter_clip_id, watched,
// answers (jsonb), ready_for_next, video_submitted_url, feedback,
// completed_at. One row per (user, chapter).
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const courseKeys = {
  myProgress: (userId, dropId) => ['course-progress', userId, dropId],
  dropProgress: (dropId) => ['course-drop-progress', dropId],
  purchasable: ['purchasable-course'],
};

// ─── Raw helpers ────────────────────────────────────────────────────

// The breakthrough (purchasable) course drop, if one exists.
export async function getPurchasableCourse() {
  const { data, error } = await supabase
    .from('content_drops')
    .select('*')
    .eq('is_purchasable', true)
    .order('priority_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listMyProgress(userId, dropId) {
  if (!userId || !dropId) return [];
  const { data, error } = await supabase
    .from('course_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('course_drop_id', dropId);
  if (error) throw error;
  return data || [];
}

export async function listDropProgress(dropId) {
  if (!dropId) return [];
  const { data, error } = await supabase
    .from('course_progress')
    .select('*')
    .eq('course_drop_id', dropId);
  if (error) throw error;
  return data || [];
}

// Find-or-create the (user, chapter) row, applying patch.
async function saveProgress(userId, dropId, clipId, patch) {
  const { data: existing } = await supabase
    .from('course_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('chapter_clip_id', clipId)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from('course_progress').update(patch).eq('id', existing.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('course_progress')
    .insert({ user_id: userId, course_drop_id: dropId, chapter_clip_id: clipId, ...patch })
    .select().single();
  if (error) throw error;
  return data;
}

export async function saveFeedback(progressId, feedback) {
  const { data, error } = await supabase
    .from('course_progress').update({ feedback }).eq('id', progressId).select().single();
  if (error) throw error;
  return data;
}

// ─── Read hooks ─────────────────────────────────────────────────────

export function usePurchasableCourse() {
  return useQuery({ queryKey: courseKeys.purchasable, queryFn: getPurchasableCourse });
}

// Trainee's own progress for a drop → map keyed by chapter_clip_id.
export function useMyCourseProgress(userId, dropId) {
  const q = useQuery({
    queryKey: courseKeys.myProgress(userId, dropId),
    queryFn: () => listMyProgress(userId, dropId),
    enabled: !!userId && !!dropId,
  });
  const byClip = {};
  for (const r of (q.data || [])) byClip[r.chapter_clip_id] = r;
  return { ...q, byClip };
}

// Coach view — all students' progress for a drop.
export function useDropProgress(dropId) {
  return useQuery({
    queryKey: courseKeys.dropProgress(dropId),
    queryFn: () => listDropProgress(dropId),
    enabled: !!dropId,
  });
}

// ─── Mutation hooks ─────────────────────────────────────────────────

export function useCourseMutations(userId, dropId) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: courseKeys.myProgress(userId, dropId) });
    qc.invalidateQueries({ queryKey: courseKeys.dropProgress(dropId) });
  };
  return {
    markWatched: useMutation({
      mutationFn: (clipId) => saveProgress(userId, dropId, clipId, { watched: true }),
      onSuccess: invalidate,
    }),
    saveAnswers: useMutation({
      mutationFn: ({ clipId, answers }) => saveProgress(userId, dropId, clipId, { answers }),
      onSuccess: invalidate,
    }),
    setReady: useMutation({
      mutationFn: ({ clipId, ready }) => saveProgress(userId, dropId, clipId, { ready_for_next: ready }),
      onSuccess: invalidate,
    }),
    saveVideo: useMutation({
      mutationFn: ({ clipId, url }) => saveProgress(userId, dropId, clipId, { video_submitted_url: url }),
      onSuccess: invalidate,
    }),
    markComplete: useMutation({
      mutationFn: (clipId) => saveProgress(userId, dropId, clipId, { completed_at: new Date().toISOString() }),
      onSuccess: invalidate,
    }),
  };
}

export function useFeedbackMutation(dropId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId, feedback }) => saveFeedback(progressId, feedback),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.dropProgress(dropId) }),
  });
}
