// ═══════════════════════════════════════════════════════════════════
// Content Commander — Supabase API + TanStack Query layer
// ═══════════════════════════════════════════════════════════════════
// Thin async helpers + react-query hooks over the four content tables:
//   content_ideas   — quick-capture inbox
//   content_drops   — a publishable bundle of clips (a "drop")
//   content_clips   — a single short-form video (script + teleprompter)
//   content_events  — calendar/timeline events (generic CRUD)
//
// All writes go through safeInsert/safeUpdate, which port the same
// 42703 "unknown column" retry that base44Client.js uses: a single
// stale field name can't block a save — the offending column is
// dropped and the write retried. RLS on the tables scopes rows to the
// authenticated coach, so reads simply select('*').
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Design tokens (shared across every content screen) ─────────────

// Funnel tags — color coded per the Content Commander spec.
export const FUNNELS = [
  { key: 'dm',    label: 'דמים',  color: '#2a78d6' },
  { key: 'coach', label: 'ליווי', color: '#1baf7a' },
  { key: 'group', label: 'קבוצה', color: '#eda100' },
  { key: 'prod',  label: 'מוצר',  color: '#e34948' },
  { key: 'brand', label: 'מותג',  color: '#4a3aa7' },
];
export const FUNNEL_BY_KEY = Object.fromEntries(FUNNELS.map(f => [f.key, f]));

// Drop lifecycle.
export const DROP_STATUSES = [
  { key: 'draft',     label: 'טיוטה', color: '#94a3b8' },
  { key: 'ready',     label: 'מוכן',  color: '#eda100' },
  { key: 'published', label: 'פורסם', color: '#22c55e' },
];
export const DROP_STATUS_BY_KEY = Object.fromEntries(DROP_STATUSES.map(s => [s.key, s]));

// Clip type chips.
export const CLIP_TYPES = [
  { key: 'value',       label: 'ערך' },
  { key: 'proof',       label: 'הוכחה' },
  { key: 'product',     label: 'מוצר' },
  { key: 'bts',         label: 'BTS' },
  { key: 'inspire',     label: 'השראה' },
];
export const CLIP_TYPE_BY_KEY = Object.fromEntries(CLIP_TYPES.map(t => [t.key, t]));

// Clip lifecycle — colors per spec.
export const CLIP_STATUSES = [
  { key: 'idea',         label: 'רעיון',  color: '#94a3b8' },
  { key: 'script_ready', label: 'תסריט',  color: '#eab308' },
  { key: 'filmed',       label: 'צולם',   color: '#3b82f6' },
  { key: 'edited',       label: 'נערך',   color: '#8b5cf6' },
  { key: 'published',    label: 'פורסם',  color: '#22c55e' },
];
export const CLIP_STATUS_BY_KEY = Object.fromEntries(CLIP_STATUSES.map(s => [s.key, s]));

// ─── Relative-time formatter (Hebrew) ───────────────────────────────

export function timeAgo(dateLike) {
  if (!dateLike) return '';
  const then = new Date(dateLike).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return 'עכשיו';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `לפני ${days} ימים`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `לפני ${weeks} שב׳`;
  return new Date(dateLike).toLocaleDateString('he-IL');
}

// ─── 42703 unknown-column retry (ported from base44Client) ──────────

function extractMissingColumn(error) {
  const msg = error?.message || '';
  if (error?.code !== '42703' && !/does not exist|in the schema cache/i.test(msg)) return null;
  const m = msg.match(/column\s+"?([\w.]+)"?\s+of\s+relation/i)
         || msg.match(/column\s+"?([\w.]+)"?\s+does not exist/i)
         || msg.match(/['"`]([\w.]+)['"`]\s+column/i);
  if (!m?.[1]) return null;
  return m[1].split('.').pop();
}

function dropColumn(payload, col) {
  if (!payload || !(col in payload)) return null;
  const { [col]: _drop, ...rest } = payload;
  console.warn(`[content-api] dropping unknown column "${col}" and retrying`);
  return rest;
}

async function safeInsert(table, payload) {
  let body = { ...payload };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from(table).insert(body).select().single();
    if (!error) return data;
    const missing = extractMissingColumn(error);
    const next = missing ? dropColumn(body, missing) : null;
    if (!next) throw error;
    body = next;
  }
  throw new Error(`[content-api] ${table}.insert exhausted column-retry budget`);
}

async function safeUpdate(table, id, payload) {
  let body = { ...payload };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from(table).update(body).eq('id', id).select().single();
    if (!error) return data;
    const missing = extractMissingColumn(error);
    const next = missing ? dropColumn(body, missing) : null;
    if (!next) throw error;
    body = next;
  }
  throw new Error(`[content-api] ${table}.update exhausted column-retry budget`);
}

async function remove(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ─── Raw data helpers ───────────────────────────────────────────────

export async function listIdeas() {
  const { data, error } = await supabase
    .from('content_ideas')
    .select('*')
    .is('promoted_to_clip_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listDrops() {
  const { data, error } = await supabase
    .from('content_drops')
    .select('*')
    .order('publish_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getDrop(id) {
  const { data, error } = await supabase.from('content_drops').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listClips(dropId) {
  let q = supabase.from('content_clips').select('*');
  if (dropId) q = q.eq('drop_id', dropId);
  q = q.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getClip(id) {
  const { data, error } = await supabase.from('content_clips').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// content_events — generic calendar/timeline events. No screen drives
// these yet, but the CRUD surface is provided per the API spec so a
// future scheduling view can hook in without touching this layer.
export async function listEvents() {
  const { data, error } = await supabase
    .from('content_events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export const addEvent    = (payload)     => safeInsert('content_events', payload);
export const updateEvent = (id, payload) => safeUpdate('content_events', id, payload);
export const deleteEvent = (id)          => remove('content_events', id);

// ─── Query keys ─────────────────────────────────────────────────────

export const contentKeys = {
  ideas: ['content-ideas'],
  drops: ['content-drops'],
  clips: ['content-clips'],
  clip: (id) => ['content-clip', id],
};

// ─── Read hooks ─────────────────────────────────────────────────────

export function useIdeas() {
  return useQuery({ queryKey: contentKeys.ideas, queryFn: listIdeas });
}

export function useDrops() {
  return useQuery({ queryKey: contentKeys.drops, queryFn: listDrops });
}

export function useDrop(id) {
  return useQuery({ queryKey: ['content-drop', id], queryFn: () => getDrop(id), enabled: !!id });
}

export function useClips(dropId) {
  return useQuery({
    queryKey: dropId ? [...contentKeys.clips, dropId] : contentKeys.clips,
    queryFn: () => listClips(dropId),
  });
}

export function useClip(id) {
  return useQuery({ queryKey: contentKeys.clip(id), queryFn: () => getClip(id), enabled: !!id });
}

// ─── Mutation hooks ─────────────────────────────────────────────────
// Each invalidates the relevant query keys so every open screen stays
// in sync without manual refetching.

export function useContentMutations(coachId) {
  const qc = useQueryClient();
  const scope = coachId ? { coach_id: coachId } : {};

  const invalidate = (...keys) => keys.forEach(k => qc.invalidateQueries({ queryKey: k }));

  return {
    // ── Ideas ──
    addIdea: useMutation({
      mutationFn: (text) => safeInsert('content_ideas', { ...scope, text }),
      onSuccess: () => invalidate(contentKeys.ideas),
    }),
    deleteIdea: useMutation({
      mutationFn: (id) => remove('content_ideas', id),
      onSuccess: () => invalidate(contentKeys.ideas),
    }),
    promoteIdea: useMutation({
      // Promote an idea into a clip. Creates the clip from the idea
      // text, then stamps promoted_to_clip_id on the idea so it leaves
      // the inbox.
      mutationFn: async ({ idea, dropId }) => {
        const clip = await safeInsert('content_clips', {
          ...scope,
          drop_id: dropId || null,
          title: idea.text?.slice(0, 80) || 'קליפ חדש',
          script: idea.text || '',
          status: 'idea',
          sort_order: Date.now() % 1e9,
        });
        await safeUpdate('content_ideas', idea.id, { promoted_to_clip_id: clip.id });
        return clip;
      },
      onSuccess: () => invalidate(contentKeys.ideas, contentKeys.clips, contentKeys.drops),
    }),

    // ── Drops ──
    addDrop: useMutation({
      mutationFn: (payload) => safeInsert('content_drops', {
        ...scope, status: 'draft', ...payload,
      }),
      onSuccess: () => invalidate(contentKeys.drops),
    }),
    updateDrop: useMutation({
      mutationFn: ({ id, ...patch }) => safeUpdate('content_drops', id, patch),
      onSuccess: (_d, vars) => invalidate(contentKeys.drops, ['content-drop', vars.id]),
    }),
    deleteDrop: useMutation({
      mutationFn: (id) => remove('content_drops', id),
      onSuccess: () => invalidate(contentKeys.drops, contentKeys.clips),
    }),

    // ── Clips ──
    addClip: useMutation({
      mutationFn: (payload) => safeInsert('content_clips', {
        ...scope, status: 'idea', sort_order: Date.now() % 1e9, ...payload,
      }),
      onSuccess: () => invalidate(contentKeys.clips, contentKeys.drops),
    }),
    updateClip: useMutation({
      mutationFn: ({ id, ...patch }) => safeUpdate('content_clips', id, patch),
      onSuccess: (_d, vars) => invalidate(contentKeys.clips, contentKeys.clip(vars.id)),
    }),
    deleteClip: useMutation({
      mutationFn: (id) => remove('content_clips', id),
      onSuccess: () => invalidate(contentKeys.clips, contentKeys.drops),
    }),
    reorderClips: useMutation({
      // Persist a new ordering — one update per clip whose sort_order
      // changed.
      mutationFn: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) =>
          safeUpdate('content_clips', id, { sort_order: i })));
      },
      onSuccess: () => invalidate(contentKeys.clips),
    }),
  };
}
