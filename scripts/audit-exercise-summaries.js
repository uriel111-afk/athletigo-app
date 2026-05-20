// Audit: how many workout_executions rows lack exercise_summaries
// but DO have exercise_set_logs that could backfill them.
//
// Read-only. Prints a summary; writes nothing.
//
// Run:
//   set SUPABASE_SERVICE_ROLE_KEY=eyJ...  (PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY="...")
//   node scripts/audit-exercise-summaries.js
//
// Or put SUPABASE_SERVICE_ROLE_KEY=... in .env.local (gitignored).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Minimal .env.local loader — single quotes / double quotes / no quotes.
function loadDotEnvLocal() {
  const p = resolve(repoRoot, '.env.local');
  if (!existsSync(p)) return;
  const txt = readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rrxcycidsojncpqlagsf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
  console.error('Set it in your shell or in .env.local at the repo root, then re-run.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

function isMissingSummary(row) {
  const s = row.exercise_summaries;
  if (s == null) return true;
  if (typeof s !== 'object') return true;
  if (Array.isArray(s)) return true;
  return Object.keys(s).length === 0;
}

async function fetchAllExecutions() {
  // Paginate to avoid PostgREST default cap.
  const PAGE = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from('workout_executions')
      .select('id, plan_id, trainee_id, executed_at, exercise_summaries')
      .order('executed_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function countSetLogs(executionId) {
  const { count, error } = await supabase
    .from('exercise_set_logs')
    .select('id', { head: true, count: 'exact' })
    .eq('execution_id', executionId);
  if (error) throw error;
  return count ?? 0;
}

(async () => {
  console.log('Fetching workout_executions…');
  const execs = await fetchAllExecutions();
  console.log(`  → ${execs.length} executions total\n`);

  const missing = execs.filter(isMissingSummary);
  const withSummary = execs.length - missing.length;
  console.log(`Executions WITH exercise_summaries populated:  ${withSummary}`);
  console.log(`Executions MISSING exercise_summaries (null/empty): ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('Nothing to backfill. Done.');
    return;
  }

  console.log(`Probing exercise_set_logs counts for the ${missing.length} candidate rows…`);
  let withLogs = 0;
  let withoutLogs = 0;
  const sample = [];
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i];
    const n = await countSetLogs(row.id);
    if (n > 0) {
      withLogs++;
      if (sample.length < 5) sample.push({ id: row.id, executed_at: row.executed_at, set_log_count: n });
    } else {
      withoutLogs++;
    }
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${missing.length}`);
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Total executions:                    ${execs.length}`);
  console.log(`Already have exercise_summaries:     ${withSummary}`);
  console.log(`Missing exercise_summaries:          ${missing.length}`);
  console.log(`  ↳ HAVE exercise_set_logs (backfillable):  ${withLogs}`);
  console.log(`  ↳ NO exercise_set_logs (unrecoverable):    ${withoutLogs}`);
  console.log('\nSample backfillable rows (up to 5):');
  for (const s of sample) {
    console.log(`  ${s.id}  ${s.executed_at}  ${s.set_log_count} set logs`);
  }
})().catch((e) => {
  console.error('Audit failed:', e?.message || e);
  process.exit(1);
});
