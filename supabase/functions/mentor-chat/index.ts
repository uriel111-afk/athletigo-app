// Edge Function: mentor-chat
//
// Server-side proxy for the in-app AI mentor.
//   - Verifies caller JWT (no anonymous use)
//   - Pulls fresh context from the authenticated user's data using the
//     service role (so RLS doesn't cripple the mentor's view)
//   - Calls Claude with ANTHROPIC_API_KEY held in env (never reaches
//     the browser)
//   - Supports Tool Use: Claude can ask to add expense/income/lead,
//     log a checkin, complete a task, etc. The function executes the
//     tool against Supabase and runs a follow-up Claude call so the
//     final reply summarizes what happened in natural Hebrew.
//   - Returns the assistant text + executed actions (for the UI's
//     "✅ בוצע" chips) + token usage
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
// Cap on how many tool_use → follow-up cycles we run before forcing a
// text-only reply. In practice 1 round is enough; we allow 2 in case
// the model wants to chain (e.g. add lead, then draft a message).
const MAX_TOOL_ROUNDS = 2;

const SYSTEM_PROMPT_BASE = `אתה המנטור האישי של אוריאל שלמה, מאמן כושר ומייסד AthletiGo.
אתה מכיר את כל הנתונים שלו ועוזר לו להגיע ל-10 מיליון ש"ח בשנה.
אתה מדבר בעברית, ישיר, תכליתי, מעודד ודוחף לפעולה.
אתה מתמודד עם ADHD — תשובות קצרות, ממוקדות, עם פעולה אחת ברורה.
אל תשאל שאלות — תן תשובה ופעולה.

יש לך כלים (tools) שמאפשרים לך לבצע פעולות עבור אוריאל בבסיס הנתונים: להוסיף הוצאות,
הכנסות, לידים, לסמן משימות כהושלמו, לעדכן צ'ק-אין, לתעד תוכן, לתעד שיחות, להוסיף לרשימת
קניות. כשהמשתמש מבקש פעולה ("תוסיף הוצאה...", "סיימתי את...", "התאמנתי היום") — הפעל
את הכלי המתאים ישירות. אל תשאל אישור על דברים פשוטים. אחרי הביצוע, אשר בקצרה ותן את
המהלך הבא.`;

const TOOLS = [
  {
    name: 'add_expense',
    description: 'הוסף הוצאה חדשה. המשתמש אומר למשל: תוסיף הוצאה 150 דלק',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'סכום ההוצאה' },
        category: { type: 'string', description: 'קטגוריה: housing/bills/transport/insurance/food/subscriptions/taxes/electronics/cleaning/business/other' },
        description: { type: 'string', description: 'תיאור קצר' },
      },
      required: ['amount', 'category'],
    },
  },
  {
    name: 'add_income',
    description: 'הוסף הכנסה חדשה. המשתמש אומר: נכנסו 1199 מDream Machine',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'סכום' },
        source: { type: 'string', description: 'מקור: product_sale/training/course/workshop/online_coaching/other' },
        product: { type: 'string', description: 'שם המוצר או השירות' },
        client_name: { type: 'string', description: 'שם הלקוח (אופציונלי)' },
      },
      required: ['amount', 'source'],
    },
  },
  {
    name: 'add_lead',
    description: 'הוסף ליד חדש. המשתמש אומר: ליד חדש דני 0501234567 מעוניין בטבעות',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'שם' },
        phone: { type: 'string', description: 'טלפון' },
        interested_in: { type: 'string', description: 'מעוניין ב' },
        source: { type: 'string', description: 'מקור: instagram/facebook/whatsapp/website/referral/other' },
      },
      required: ['name'],
    },
  },
  {
    name: 'complete_task',
    description: 'סמן משימה כהושלמה. המשתמש אומר: סיימתי את המשימה של הסרטון',
    input_schema: {
      type: 'object',
      properties: {
        task_title_search: { type: 'string', description: 'חלק משם המשימה לחיפוש' },
      },
      required: ['task_title_search'],
    },
  },
  {
    name: 'daily_checkin',
    description: "עדכן צ'ק-אין יומי. המשתמש אומר: התאמנתי היום, אכלתי טוב, למדתי על AI",
    input_schema: {
      type: 'object',
      properties: {
        mood: { type: 'integer', description: 'מצב רוח 1-5' },
        trained: { type: 'boolean', description: 'התאמן?' },
        training_type: { type: 'string', description: 'סוג אימון' },
        nutrition_score: { type: 'integer', description: 'תזונה 1-5' },
        learned: { type: 'boolean', description: 'למד?' },
        learned_topic: { type: 'string', description: 'מה למד' },
        meditated: { type: 'boolean', description: 'מדיטציה?' },
        journal_entry: { type: 'string', description: 'מחשבה' },
      },
    },
  },
  {
    name: 'add_content',
    description: 'תעד תוכן שפורסם. המשתמש אומר: פרסמתי רילס באינסטגרם',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'שם/תיאור התוכן' },
        content_type: { type: 'string', description: 'reel/story/post/carousel/live' },
        platform: { type: 'string', description: 'instagram/facebook/youtube/tiktok' },
        status: { type: 'string', description: 'idea/scripted/filmed/edited/scheduled/published' },
      },
      required: ['title', 'content_type'],
    },
  },
  {
    name: 'contact_person',
    description: 'תעד שדיברת עם מישהו. המשתמש אומר: דיברתי עם אבא',
    input_schema: {
      type: 'object',
      properties: {
        contact_name: { type: 'string', description: 'שם איש הקשר' },
        notes: { type: 'string', description: 'על מה דיברתם' },
      },
      required: ['contact_name'],
    },
  },
  {
    name: 'add_shopping_item',
    description: 'הוסף פריט לרשימת קניות. המשתמש אומר: תוסיף חלב וביצים לקניות',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'שם הפריט' },
        quantity: { type: 'string', description: 'כמות' },
      },
      required: ['item'],
    },
  },
  {
    name: 'generate_content_idea',
    description: 'ייצר רעיון לתוכן. המשתמש אומר: תן לי רעיון לסרטון. הכלי לא כותב ל-DB — רק מאותת שצריך לחזור עם רעיון בטקסט.',
    input_schema: {
      type: 'object',
      properties: {
        product_focus: { type: 'string', description: 'מוצר/שירות ספציפי (אופציונלי)' },
      },
    },
  },
  {
    name: 'draft_lead_response',
    description: 'כתוב הודעה לליד. המשתמש אומר: תכתוב הודעה לדני שהתעניין בטבעות. הכלי לא כותב ל-DB — רק מאותת שצריך לחזור עם טיוטה בטקסט.',
    input_schema: {
      type: 'object',
      properties: {
        lead_name: { type: 'string', description: 'שם הליד' },
        context: { type: 'string', description: 'הקשר נוסף' },
      },
      required: ['lead_name'],
    },
  },
  {
    name: 'save_image_to_category',
    description: 'שמור את התמונה שצורפה להודעה (קבלה / מסמך / חוזה / חשבונית) בתיקייה המתאימה. הפעל רק כשהמשתמש שלח תמונה והקשר מצביע על קבלה/מסמך. אם זה receipt עם amount — תיווצר אוטומטית שורת הוצאה. אם זה contract/invoice/document — תיווצר שורה ב-documents.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: "ה-URL של התמונה (אותו URL שצורף להודעת המשתמש)" },
        category: { type: 'string', description: 'קטגוריה — להוצאה: housing/bills/transport/insurance/food/subscriptions/taxes/electronics/cleaning/business/other. למסמך: insurance/contract/medical/financial/legal/other' },
        document_type: { type: 'string', description: 'סוג: receipt / contract / invoice / document' },
        amount: { type: 'number', description: 'סכום (חובה אם document_type=receipt)' },
        description: { type: 'string', description: 'תיאור קצר (למשל "תדלוק", "ביטוח רכב 2026")' },
      },
      required: ['image_url', 'category', 'document_type'],
    },
  },
];

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

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
    .toISOString().slice(0, 10);
  const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
    .toISOString().slice(0, 10);

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

// Each tool handler returns:
//   { success: boolean, summary: string, tool_result: string }
// `summary` is the short Hebrew chip the UI shows ("✅ בוצע: הוצאה 150₪ דלק").
// `tool_result` is the JSON-ish string fed back into Claude as the
// tool_result content so it can craft a natural-language reply.
type AttachedImage = { url: string; path: string; bucket: string } | null;

async function runTool(
  name: string,
  input: any,
  admin: any,
  userId: string,
  attachedImage: AttachedImage = null,
) {
  try {
    switch (name) {
      case 'add_expense': {
        const { error } = await admin.from('expenses').insert({
          user_id: userId,
          amount: input.amount,
          category: input.category,
          description: input.description || null,
          date: todayISO(),
        });
        if (error) throw error;
        const desc = input.description ? ` ${input.description}` : '';
        return {
          success: true,
          summary: `הוצאה ${Math.round(input.amount)}₪${desc}`,
          tool_result: `הוצאה נשמרה: סכום ${input.amount}₪, קטגוריה ${input.category}${desc}, תאריך היום.`,
        };
      }
      case 'add_income': {
        const { error } = await admin.from('income').insert({
          user_id: userId,
          amount: input.amount,
          source: input.source,
          product: input.product || null,
          client_name: input.client_name || null,
          date: todayISO(),
        });
        if (error) throw error;
        // Sync current_monthly_revenue on the active business plan.
        try {
          const { data: monthRows } = await admin.from('income').select('amount')
            .eq('user_id', userId).gte('date', firstOfMonthISO());
          const total = sumAmount(monthRows || []);
          await admin.from('business_plan')
            .update({ current_monthly_revenue: total, updated_at: new Date().toISOString() })
            .eq('user_id', userId).eq('status', 'active');
        } catch (_) { /* best-effort */ }
        const label = input.product || input.source;
        return {
          success: true,
          summary: `הכנסה ${Math.round(input.amount)}₪ — ${label}`,
          tool_result: `הכנסה נשמרה: סכום ${input.amount}₪, ${label}${input.client_name ? ` (לקוח: ${input.client_name})` : ''}.`,
        };
      }
      case 'add_lead': {
        const { error } = await admin.from('leads').insert({
          coach_id: userId,
          full_name: input.name,
          phone: input.phone || null,
          interested_in: input.interested_in || null,
          source: input.source || 'other',
          status: 'new',
        });
        if (error) throw error;
        return {
          success: true,
          summary: `ליד נוסף — ${input.name}`,
          tool_result: `ליד חדש נוצר: ${input.name}${input.phone ? `, טלפון ${input.phone}` : ''}${input.interested_in ? `, מעוניין ב-${input.interested_in}` : ''}.`,
        };
      }
      case 'complete_task': {
        const { data: matches } = await admin.from('life_os_tasks')
          .select('id, title, xp_reward')
          .eq('user_id', userId).eq('status', 'pending')
          .ilike('title', `%${input.task_title_search}%`)
          .limit(1);
        const t = matches?.[0];
        if (!t) {
          return {
            success: false,
            summary: '',
            tool_result: `לא נמצאה משימה פתוחה התואמת ל-"${input.task_title_search}".`,
          };
        }
        const { error } = await admin.from('life_os_tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', t.id);
        if (error) throw error;
        return {
          success: true,
          summary: `משימה הושלמה — ${t.title}`,
          tool_result: `משימה "${t.title}" סומנה כהושלמה${t.xp_reward ? ` (+${t.xp_reward} XP)` : ''}.`,
        };
      }
      case 'daily_checkin': {
        const payload: Record<string, unknown> = { user_id: userId, date: todayISO() };
        for (const k of [
          'mood', 'trained', 'training_type', 'nutrition_score',
          'learned', 'learned_topic', 'meditated', 'journal_entry',
        ]) {
          if (input[k] !== undefined && input[k] !== null) payload[k] = input[k];
        }
        const { error } = await admin.from('personal_checkin')
          .upsert(payload, { onConflict: 'user_id,date' });
        if (error) throw error;
        const bits: string[] = [];
        if (input.trained) bits.push('אימון');
        if (input.learned) bits.push('למידה');
        if (input.meditated) bits.push('מדיטציה');
        return {
          success: true,
          summary: `צ'ק-אין עודכן${bits.length ? ` (${bits.join(', ')})` : ''}`,
          tool_result: `צ'ק-אין יומי עודכן.`,
        };
      }
      case 'add_content': {
        const { error } = await admin.from('content_calendar').insert({
          user_id: userId,
          title: input.title,
          content_type: input.content_type,
          platform: input.platform || 'instagram',
          status: input.status || 'published',
          scheduled_date: todayISO(),
          date: todayISO(),
        });
        if (error) throw error;
        return {
          success: true,
          summary: `תוכן נרשם — ${input.title}`,
          tool_result: `תוכן "${input.title}" (${input.content_type}) נרשם.`,
        };
      }
      case 'contact_person': {
        const { data: matches } = await admin.from('personal_contacts')
          .select('id, name')
          .eq('user_id', userId)
          .ilike('name', `%${input.contact_name}%`)
          .limit(1);
        const c = matches?.[0];
        if (!c) {
          return {
            success: false,
            summary: '',
            tool_result: `איש קשר "${input.contact_name}" לא נמצא ברשימה. הצע למשתמש להוסיף אותו דרך מסך הקשרים.`,
          };
        }
        const { error: insErr } = await admin.from('personal_interactions').insert({
          user_id: userId, contact_id: c.id, date: todayISO(),
          type: 'call', notes: input.notes || null,
        });
        if (insErr) throw insErr;
        await admin.from('personal_contacts')
          .update({ last_contact_date: todayISO() })
          .eq('id', c.id);
        return {
          success: true,
          summary: `שיחה תועדה — ${c.name}`,
          tool_result: `אינטראקציה עם ${c.name} תועדה לתאריך היום.`,
        };
      }
      case 'add_shopping_item': {
        const { error } = await admin.from('personal_shopping_list').insert({
          user_id: userId,
          item: input.item,
          quantity: input.quantity || null,
        });
        if (error) throw error;
        return {
          success: true,
          summary: `נוסף לקניות — ${input.item}${input.quantity ? ` (${input.quantity})` : ''}`,
          tool_result: `הפריט "${input.item}"${input.quantity ? ` (${input.quantity})` : ''} נוסף לרשימת הקניות.`,
        };
      }
      case 'generate_content_idea': {
        // Pure-text tool — Claude itself produces the idea in its
        // follow-up reply. We just confirm the request was received.
        return {
          success: true,
          summary: '',
          tool_result: `המשתמש מבקש רעיון לתוכן${input.product_focus ? ` סביב ${input.product_focus}` : ''}. עכשיו תן רעיון אחד קצר וחד עם hook + 3 נקודות + CTA.`,
        };
      }
      case 'draft_lead_response': {
        return {
          success: true,
          summary: '',
          tool_result: `המשתמש רוצה טיוטת הודעה לליד "${input.lead_name}"${input.context ? ` בהקשר: ${input.context}` : ''}. עכשיו תן טיוטה קצרה (3-4 שורות) באווטשאפ-טון, חמה ולא דחוקה.`,
        };
      }
      case 'save_image_to_category': {
        if (!attachedImage) {
          return {
            success: false,
            summary: '',
            tool_result: 'אין תמונה מצורפת להודעה הנוכחית — לא ניתן לבצע save_image_to_category.',
          };
        }
        const docType = String(input.document_type || '').toLowerCase();
        const validTypes = ['receipt', 'contract', 'invoice', 'document'];
        if (!validTypes.includes(docType)) {
          return {
            success: false,
            summary: '',
            tool_result: `document_type לא תקין: "${docType}". מותר: ${validTypes.join('/')}.`,
          };
        }
        if (docType === 'receipt' && !(Number(input.amount) > 0)) {
          return {
            success: false,
            summary: '',
            tool_result: 'קבלה חייבת לכלול amount חיובי. בקש מהמשתמש את הסכום או נסה לקרוא אותו מהתמונה.',
          };
        }

        const subDir = docType === 'receipt' ? 'receipts' : 'documents';
        const fileName = attachedImage.path.split('/').pop() || `${Date.now()}.jpg`;
        const safeCat = String(input.category || 'other').replace(/[^a-zA-Z0-9_\-א-ת]/g, '_');
        const newPath = `${userId}/${subDir}/${safeCat}/${fileName}`;

        // Move the file out of /chat into the categorized folder.
        // Storage.move() returns { error } when the source is missing
        // or the destination already exists — both are recoverable
        // (we degrade to copy+delete or skip).
        let movedTo = newPath;
        const { error: moveErr } = await admin.storage
          .from(attachedImage.bucket)
          .move(attachedImage.path, newPath);
        if (moveErr) {
          console.warn('[save_image_to_category] move failed:', moveErr.message);
          // If the file was already moved (e.g., second tool call on same
          // message), we keep the chat path as the canonical URL.
          movedTo = attachedImage.path;
        }

        const { data: pubData } = admin.storage.from(attachedImage.bucket).getPublicUrl(movedTo);
        const finalUrl = pubData?.publicUrl || attachedImage.url;

        if (docType === 'receipt') {
          const { error: insErr } = await admin.from('expenses').insert({
            user_id: userId,
            amount: Number(input.amount),
            category: input.category,
            description: input.description || null,
            receipt_url: finalUrl,
            date: todayISO(),
          });
          if (insErr) throw insErr;
          return {
            success: true,
            summary: `קבלה נשמרה — ${Math.round(Number(input.amount))}₪ ${input.description || input.category}`,
            tool_result: `קבלה נשמרה ב-expenses: ${input.amount}₪ ${input.description || input.category}, receipt_url מקושר לתיקייה ${subDir}/${input.category}.`,
          };
        }

        // contract / invoice / document → documents table
        const { error: docErr } = await admin.from('documents').insert({
          user_id: userId,
          name: input.description || `${docType} ${input.category}`,
          type: docType,
          file_url: finalUrl,
          category: input.category,
        });
        if (docErr) throw docErr;
        return {
          success: true,
          summary: `מסמך נשמר — ${input.description || input.category} (${docType})`,
          tool_result: `מסמך נשמר ב-documents: ${input.description || input.category}, תיקייה ${subDir}/${input.category}.`,
        };
      }
      default:
        return {
          success: false,
          summary: '',
          tool_result: `כלי לא מוכר: ${name}`,
        };
    }
  } catch (err: any) {
    console.error('[mentor-chat] tool error:', name, err);
    return {
      success: false,
      summary: '',
      tool_result: `שגיאה בביצוע ${name}: ${err?.message || String(err)}`,
    };
  }
}

function extractText(blocks: any[]) {
  return (blocks || [])
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
}

async function callClaude(opts: {
  apiKey: string;
  systemPrompt: string;
  messages: any[];
}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: opts.systemPrompt,
      tools: TOOLS,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude ${res.status}: ${errText}`);
  }
  return await res.json();
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

    // Optional attached image: { url, path, bucket? }. The path is what
    // the server uses when calling Storage.move() — we never trust a
    // model-supplied path.
    const rawImage = body.image && typeof body.image === 'object' ? body.image : null;
    const attachedImage: AttachedImage = rawImage && rawImage.url && rawImage.path
      ? {
          url: String(rawImage.url),
          path: String(rawImage.path),
          bucket: String(rawImage.bucket || 'lifeos-files'),
        }
      : null;

    if (!question && !attachedImage) {
      return new Response(JSON.stringify({ error: 'חסרה שאלה' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanHistory = rawHistory
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-(HISTORY_CAP - 1))
      .map((m: any) => ({ role: m.role, content: m.content }));

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const context = await buildContext(admin, user.id);

    const imageNote = attachedImage
      ? `\n\nהמשתמש צירף תמונה להודעה הזו (image_url=${attachedImage.url}). אם זו קבלה / חוזה / חשבונית / מסמך — קרא ל-save_image_to_category עם ה-image_url הזה והקטגוריה המתאימה. אם זה receipt, חלץ amount מהתמונה. אם זה רק תוכן ויזואלי לדיון — ענה בטקסט בלי כלים.`
      : '';

    const systemPrompt = `${SYSTEM_PROMPT_BASE}${imageNote}

הנה הנתונים העדכניים (תמצית מ-Supabase):
${JSON.stringify(context, null, 2)}`;

    // First user turn — vision block + text when an image was attached.
    const firstUserContent: any = attachedImage
      ? [
          { type: 'image', source: { type: 'url', url: attachedImage.url } },
          { type: 'text', text: question || 'הנה תמונה — שמור אותה בקטגוריה המתאימה.' },
        ]
      : question;

    // Conversation we extend round-by-round.
    const messages: any[] = [
      ...cleanHistory,
      { role: 'user', content: firstUserContent },
    ];

    const executedActions: { name: string; summary: string; success: boolean }[] = [];
    let lastReply = '';
    let lastUsage: any = null;
    let lastModel: string | undefined;

    for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
      let res;
      try {
        res = await callClaude({ apiKey: anthropicKey, systemPrompt, messages });
      } catch (err: any) {
        console.error('[mentor-chat] Claude call failed:', err?.message);
        return new Response(JSON.stringify({
          error: 'שגיאה בקריאה ל-Claude', detail: err?.message,
        }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      lastUsage = res.usage || lastUsage;
      lastModel = res.model || lastModel;
      const stopReason = res.stop_reason;
      const assistantBlocks = Array.isArray(res.content) ? res.content : [];
      lastReply = extractText(assistantBlocks);

      // No tool call → done.
      if (stopReason !== 'tool_use') break;

      const toolUses = assistantBlocks.filter((b: any) => b?.type === 'tool_use');
      if (toolUses.length === 0) break;

      // Run each tool and build tool_result blocks.
      const toolResultBlocks: any[] = [];
      for (const t of toolUses) {
        const out = await runTool(t.name, t.input || {}, admin, user.id, attachedImage);
        if (out.summary) {
          executedActions.push({
            name: t.name,
            summary: out.summary,
            success: out.success,
          });
        }
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: t.id,
          content: out.tool_result,
          is_error: !out.success,
        });
      }

      // Echo the assistant turn (with the tool_use blocks intact) and
      // append a user turn carrying the tool_results, then loop.
      messages.push({ role: 'assistant', content: assistantBlocks });
      messages.push({ role: 'user', content: toolResultBlocks });

      // Hit the round cap → next iteration will run one more Claude
      // call so it can produce a final text reply summarizing actions.
      if (round === MAX_TOOL_ROUNDS) break;
    }

    return new Response(JSON.stringify({
      reply: lastReply || (executedActions.length > 0 ? 'בוצע ✓' : ''),
      actions: executedActions,
      usage: lastUsage,
      model: lastModel || MODEL,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[mentor-chat] crash:', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
