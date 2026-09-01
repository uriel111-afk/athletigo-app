/**
 * trackHelpers — derive which service tracks a trainee actually trains in.
 *
 * The three tracks are 'personal' | 'group' | 'online'. A trainee may be in
 * more than one at the same time; this module NEVER de-duplicates the trainee
 * record itself, it only derives the track list for a given id.
 *
 * Why not users.onboarding_track: the live table has it NULL for 17 of 19
 * rows, so it carries no signal. It is deliberately not read anywhere here.
 *
 * Fetch discipline: one round trip per table for the whole roster via
 * .in('trainee_id', ids). Never one query per trainee, and never a PostgREST
 * embed — this DB has no foreign keys, so embeds simply fail.
 */

export const TRACKS = ['personal', 'group', 'online'];

export const TRACK_LABELS = {
  personal: 'אישי',
  group:    'קבוצתי',
  online:   'אונליין',
};

// Supabase caps .in() lists; 200 ids per request keeps the URL well under
// the limit while still being a handful of trips for a very large roster.
const ID_CHUNK = 200;

const lc = (v) => (v == null ? '' : String(v)).trim().toLowerCase();

/**
 * Map any service_type / package_type / session_type value we have ever
 * written — English or Hebrew — onto a canonical track key.
 */
export function normalizeTrackValue(value) {
  const v = lc(value);
  if (!v) return null;
  if (v === 'personal' || v.includes('אישי')) return 'personal';
  if (v === 'online' || v.includes('אונליין')) return 'online';
  if (v === 'group' || v === 'קבוצה' || v.includes('קבוצתי') || v.includes('פעילות קבוצתית')) return 'group';
  return null;
}

/**
 * A package counts as ACTIVE only while it is running. 'completed' /
 * 'הושלם' / 'הסתיים' are history — they prove the trainee once trained in
 * that track, not that they train there now.
 */
export function isActivePackageStatus(status) {
  const v = lc(status);
  return v === 'active' || v === 'פעיל';
}

export function isGroupSessionType(sessionType) {
  return normalizeTrackValue(sessionType) === 'group';
}

/**
 * Pull every trainee id out of a session's participants jsonb array.
 * sessions.participants is a jsonb array ON the session row — there is no
 * session_participants table.
 */
export function participantIds(session) {
  const list = Array.isArray(session?.participants) ? session.participants : [];
  return list.map((p) => p?.trainee_id).filter(Boolean);
}

/**
 * getTrainedTracks — the single source of truth for "which tracks is this
 * trainee in".
 *
 * @param {string} traineeId
 * @param {Array}  packages      client_services rows (the whole roster's)
 * @param {Array}  groupSessions sessions rows whose session_type is a group
 *                               value, each carrying its participants jsonb
 * @param {Array}  subs          reserved — see the 'online' branch below
 * @returns {Array<'personal'|'group'|'online'>}
 */
export function getTrainedTracks(traineeId, packages, groupSessions, subs) {
  if (!traineeId) return [];
  const found = new Set();

  // ── personal / group / online from client_services ────────────────────
  // client_services.service_type is populated in English on the live DB
  // ('personal' | 'group' | 'online'), so one active row names the track
  // directly. A row whose service_type we cannot classify still counts as
  // 'personal' — that is the historical default for an unlabelled package,
  // and it means an odd value never makes a paying trainee disappear.
  for (const p of packages || []) {
    if (p?.trainee_id !== traineeId) continue;
    if (!isActivePackageStatus(p.status)) continue;
    const track = normalizeTrackValue(p.service_type) || normalizeTrackValue(p.package_type);
    found.add(track || 'personal');
  }

  // ── group from the sessions the trainee actually appears in ───────────
  // Deliberately driven off sessions.participants and NOT off
  // training_group_members: that table reads as empty through the client,
  // so it can only ever add rows here, never gate them.
  for (const s of groupSessions || []) {
    if (!isGroupSessionType(s?.session_type)) continue;
    if (participantIds(s).includes(traineeId)) { found.add('group'); break; }
  }

  // ── online ────────────────────────────────────────────────────────────
  // ONLINE SUBSCRIPTION / DIGITAL-PURCHASE BRANCH — INTENTIONALLY INERT.
  // There is no subscriptions table and no digital_product table in this
  // schema. `subs` is accepted so the signature is already correct on the
  // day one is added; until then it contributes nothing, and every online
  // classification comes from the active client_services row above.
  for (const sub of subs || []) {
    if (sub?.trainee_id !== traineeId) continue;
    if (isActivePackageStatus(sub.status)) found.add('online');
  }

  // Stable ordering so chips never reshuffle between renders.
  return TRACKS.filter((t) => found.has(t));
}

/**
 * buildTrackIndex — getTrainedTracks across a whole roster in one pass.
 * Returns Map<traineeId, tracks[]>. One entry per trainee, never duplicated.
 */
export function buildTrackIndex(traineeIds, { packages, groupSessions, subs } = {}) {
  const index = new Map();
  for (const id of traineeIds || []) {
    if (!id || index.has(id)) continue;
    index.set(id, getTrainedTracks(id, packages, groupSessions, subs));
  }
  return index;
}

/** Filter a roster down to the trainees who train in `track`. */
export function filterByTrack(trainees, trackIndex, track) {
  if (!track) return trainees || [];
  return (trainees || []).filter((t) => (trackIndex.get(t?.id) || []).includes(track));
}

async function inChunks(client, table, column, ids, select, extra) {
  const out = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    let q = client.from(table).select(select).in(column, slice);
    if (typeof extra === 'function') q = extra(q);
    const { data, error } = await q;
    if (error) {
      console.warn('[trackHelpers] ' + table + ' fetch failed:', error.message);
      continue;
    }
    out.push(...(data || []));
  }
  return out;
}

/**
 * fetchTrackSources — batch-load everything getTrainedTracks needs.
 *
 * One round trip per table for the entire roster (chunked only to respect
 * the URL length cap), scoped to the passed-in coachId. The caller always
 * supplies that id from AuthContext; nothing in this module knows or
 * assumes any coach identity.
 */
export async function fetchTrackSources(client, coachId, traineeIds) {
  const ids = [...new Set((traineeIds || []).filter(Boolean))];
  const empty = { packages: [], groupSessions: [], subs: [], groupMembers: [], allSessions: [] };
  if (!client || !coachId || ids.length === 0) return empty;

  const [packages, sessions] = await Promise.all([
    inChunks(
      client, 'client_services', 'trainee_id', ids,
      // package_name + the three size columns feed getRemainingSessions()
      // on the /pro work screens. NOTE: there is no
      // client_services.remaining_sessions column — that alias is read off
      // the object only, never selected, or the query 400s.
      'id, trainee_id, trainee_name, service_type, package_type, status, payment_status, price, paid_amount, end_date, package_name, total_sessions, used_sessions, sessions_remaining',
      (q) => q.eq('coach_id', coachId),
    ),
    (async () => {
      const { data, error } = await client
        .from('sessions')
        .select('id, session_type, participants, date, time, status, group_id, group_name, trainee_id, trainee_name')
        .eq('coach_id', coachId);
      if (error) {
        console.warn('[trackHelpers] sessions fetch failed:', error.message);
        return [];
      }
      return data || [];
    })(),
  ]);

  const groupSessions = (sessions || []).filter((s) => isGroupSessionType(s?.session_type));

  // training_group_members is an ADDITIONAL source only. Step 1 proved it
  // reads as empty through the client, so a failure or an empty result here
  // must never remove a trainee from the group track.
  let groupMembers = [];
  try {
    groupMembers = await inChunks(
      client, 'training_group_members', 'trainee_id', ids, 'trainee_id, group_id',
    );
  } catch (e) {
    console.warn('[trackHelpers] training_group_members unavailable:', e?.message);
  }

  // Fold any membership rows into the group evidence by presenting them in
  // the same shape getTrainedTracks already understands.
  const synthesized = (groupMembers || []).map((m) => ({
    id: 'gm:' + m.group_id + ':' + m.trainee_id,
    session_type: 'קבוצתי',
    participants: [{ trainee_id: m.trainee_id }],
  }));

  return {
    packages,
    groupSessions: [...groupSessions, ...synthesized],
    // No subscriptions / digital-purchase table exists in this schema yet.
    subs: [],
    groupMembers,
    allSessions: sessions,
  };
}
