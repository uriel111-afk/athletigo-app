// Edge Function: mentor-chat
//
// Server-side proxy for the in-app AI mentor.
//   - Verifies caller JWT (no anonymous use)
//   - Pulls fresh context from the authenticated user's data using the
//     service role (so RLS doesn't cripple the mentor's view)
//   - Calls Claude with ANTHROPIC_API_KEY held in env (never reaches
//     the browser)
//   - Returns just the assistant text + token usage
//
// Required Supabase secrets:
//   SUPABASE_URL                — auto-injected
//   SUPABASE_ANON_KEY           — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY   — auto-injected
//   ANTHROPIC_API_KEY           — set via: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;
const HISTORY_CAP = 20;

const SYSTEM_PROMPT_BASE = `אתה המנטור האישי של אוריאל שלמה, מאמן כושר ומייסד AthletiGo.
אתה מכיר את כל הנתונים שלו ועוזר לו להגיע ל-10 מיליון ש"ח בשנה.
אתה מדבר בעברית, ישיר, תכליתי, מעודד ודוחף לפעולה.
אתה מתמודד עם ADHD — תשובות קצרות, ממוקדות, עם פעולה אחת ברורה.
אל תשאל שאלות — תן תשובה ופעולה.`;

const todayISO = () => new Date().toISOString().slice(0, 10);
const firstOfMonthISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const sumAmount = (rows: any[]) =>
  Math.round((rows || []).reduce((s, r) => s + Number(r?.amount || 0), 0));

async function buildContext(admin: any, userId: string) {
  const today = todayISO();
  const monthStart = firstOfMonthISO();

  // Last month range for income comparison.
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
    .toISOString().slice(0, 10);
  const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
    .toISOString().slice(0, 10);

  // All queries are best-effort — a missing table or RLS hiccup
  // shouldn't kill the mentor's reply.
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [
    incomeMonth, expensesMonth, incomeLastMonth,
    leads, tasks, content, plan, courses,
    checkin, habits, contacts, trainees,
  ] = await Promise.all([
    safe(async () => (await admin.from('income').select('amount, product, source')
      .eq('user_id', userId).gte('date', monthStart)).data || [], []),
    safe(async () => (await admin.from('expenses').select('amount, category')
      .eq('user_id', userId).gte('date', monthStart)).data || [], []),
    safe(async () => (await admin.from('income').select('amount')
      .eq('user_id', userId).gte('date', lastMonthStart).lte('date', lastMonthEnd)).data || [], []),
    safe(async () => (await admin.from('leads')
      .select('id, full_name, status, interested_in, created_at, last_contact_date')
      .eq('coach_id', userId).in('status', ['new', 'contacted', 'interested'])
      .order('created_at', { ascending: false }).limit(20)).data || [], []),
    safe(async () => (await admin.from('life_os_tasks')
      .select('id, title, priority, status, category')
      .eq('user_id', userId).eq('status', 'pending')
      .order('priority', { ascending: true }).limit(20)).data || [], []),
    safe(async () => (await admin.from('content_calendar')
      .select('id, title, status, scheduled_date, date')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10)).data || [], []),
    safe(async () => (await admin.from('business_plan').select('*')
      .eq('user_id', userId).eq('status', 'active')
      .order('version', { ascending: false }).limit(1).maybeSingle()).data, null),
    safe(async () => (await admin.from('courses')
      .select('name, name_he, status').eq('user_id', userId)).data || [], []),
    safe(async () => (await admin.from('personal_checkin').select('*')
      .eq('user_id', userId).eq('date', today).maybeSingle()).data, null),
    safe(async () => (await admin.from('personal_habits')
      .select('name, streak_current, streak_best').eq('user_id', userId)
      .eq('is_active', true)).data || [], []),
    safe(async () => (await admin.from('personal_contacts')
      .select('name, category, last_contact_date').eq('user_id', userId)).data || [], []),
    safe(async () => (await admin.from('users')
      .select('full_name, email').eq('coach_id', userId).eq('role', 'trainee')).data || [], []),
  ]);

  return {
    today,
    income_this_month_total: sumAmount(incomeMonth),
    income_last_month_total: sumAmount(incomeLastMonth),
    income_this_month_breakdown: incomeMonth,
    expenses_this_month_total: sumAmount(expensesMonth),
    expenses_this_month_breakdown: expensesMonth,
    open_leads: leads,
    pending_tasks: tasks,
    recent_content: content,
    business_plan: plan,
    courses,
    today_checkin: checkin,
    habits,
    contacts,
    trainees,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'לא מורשה' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY missing on server' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller's JWT.
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'לא מורשה' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body.
    const body = await req.json().catch(() => ({}));
    const question: string = (body.question || '').trim();
    const rawHistory = Array.isArray(body.history) ? body.history : [];

    if (!question) {
      return new Response(JSON.stringify({ error: 'חסרה שאלה' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize history → only allow {role, content} pairs and drop
    // anything that's not user/assistant. Keep last HISTORY_CAP-1
    // turns to leave room for the new user message.
    const cleanHistory = rawHistory
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-(HISTORY_CAP - 1))
      .map((m: any) => ({ role: m.role, content: m.content }));

    // Pull fresh context with service role.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const context = await buildContext(admin, user.id);

    const systemPrompt = `${SYSTEM_PROMPT_BASE}

הנה הנתונים העדכניים (תמצית מ-Supabase):
${JSON.stringify(context, null, 2)}`;

    // Call Claude.
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [
          ...cleanHistory,
          { role: 'user', content: question },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[mentor-chat] Claude error:', claudeRes.status, errText);
      return new Response(JSON.stringify({
        error: 'שגיאה בקריאה ל-Claude',
        status: claudeRes.status,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeRes.json();
    const reply = (claudeData.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    return new Response(JSON.stringify({
      reply,
      usage: claudeData.usage || null,
      model: claudeData.model || MODEL,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[mentor-chat] crash:', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
