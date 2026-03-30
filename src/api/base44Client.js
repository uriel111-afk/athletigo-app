import { supabase } from '@/lib/supabaseClient';

// ---------------------------------------------------------------------------
// Entity factory — wraps a Supabase table with the same API that base44 used:
//   Entity.create(data)
//   Entity.update(id, data)
//   Entity.delete(id)
//   Entity.list(orderBy?, limit?)
//   Entity.filter(filters, orderBy?, limit?)
//   Entity.get(id)
// ---------------------------------------------------------------------------
function createEntity(tableName) {
  return {
    async create(data) {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    },

    async list(orderBy, limit) {
      let query = supabase.from(tableName).select('*');
      if (orderBy) {
        const asc = !orderBy.startsWith('-');
        const col = orderBy.replace(/^-/, '');
        query = query.order(col, { ascending: asc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async filter(filters, orderBy, limit) {
      let query = supabase.from(tableName).select('*');

      for (const [key, value] of Object.entries(filters)) {
        if (value !== null && typeof value === 'object' && '$elemMatch' in value) {
          // JSONB array contains — e.g. participants: { $elemMatch: { trainee_id: '...' } }
          query = query.contains(key, [value.$elemMatch]);
        } else {
          query = query.eq(key, value);
        }
      }

      if (orderBy) {
        const asc = !orderBy.startsWith('-');
        const col = orderBy.replace(/^-/, '');
        query = query.order(col, { ascending: asc });
      }
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  };
}

// ---------------------------------------------------------------------------
// Auth — mirrors the base44.auth surface used across the app
// ---------------------------------------------------------------------------
const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw error || new Error('Not authenticated');

    // Try to fetch the full profile from the users table (match by auth UID)
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) return profile;

    // Fallback: match by email (in case the users table PK differs from auth UID)
    const { data: profileByEmail } = await supabase
      .from('users')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();

    return profileByEmail || { id: user.id, email: user.email };
  },

  async updateMe(data) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw error || new Error('Not authenticated');

    // Sync email / password changes to Supabase Auth
    const authFields = {};
    if (data.email) authFields.email = data.email;
    if (data.password) authFields.password = data.password;
    if (Object.keys(authFields).length) {
      const { error: authErr } = await supabase.auth.updateUser(authFields);
      if (authErr) throw authErr;
    }

    // Update the profile row
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .update(data)
      .eq('id', user.id)
      .select()
      .single();
    if (profileErr) throw profileErr;
    return profile;
  },

  logout(redirectUrl) {
    supabase.auth.signOut().then(() => {
      if (redirectUrl) window.location.href = redirectUrl;
    });
  },

  redirectToLogin(redirectUrl) {
    const dest = redirectUrl
      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
      : '/login';
    window.location.href = dest;
  },
};

// ---------------------------------------------------------------------------
// Integrations — UploadFile uses Supabase Storage; others are stubs
// ---------------------------------------------------------------------------
async function UploadFile({ file }) {
  const ext = file.name.split('.').pop();
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
  return { file_url: publicUrl };
}

async function InvokeLLM({ prompt, response_json_schema } = {}) {
  throw new Error('InvokeLLM: not yet implemented on Supabase — wire up an Edge Function or external LLM API.');
}

async function SendEmail({ to, subject, body } = {}) {
  throw new Error('SendEmail: not yet implemented on Supabase — wire up an Edge Function or email provider.');
}

async function SendSMS({ to, message } = {}) {
  throw new Error('SendSMS: not yet implemented on Supabase — wire up an Edge Function or SMS provider.');
}

async function GenerateImage({ prompt } = {}) {
  throw new Error('GenerateImage: not yet implemented on Supabase — wire up an Edge Function or image API.');
}

async function ExtractDataFromUploadedFile({ file_url } = {}) {
  throw new Error('ExtractDataFromUploadedFile: not yet implemented on Supabase — wire up an Edge Function.');
}

const integrations = {
  Core: {
    UploadFile,
    InvokeLLM,
    SendEmail,
    SendSMS,
    GenerateImage,
    ExtractDataFromUploadedFile,
  },
};

// ---------------------------------------------------------------------------
// Entity map — all tables used in the app
// ---------------------------------------------------------------------------
const entities = {
  User:                   createEntity('users'),
  Lead:                   createEntity('leads'),
  Session:                createEntity('sessions'),
  TrainingPlan:           createEntity('training_plans'),
  TrainingSection:        createEntity('training_sections'),
  TrainingPlanAssignment: createEntity('training_plan_assignments'),
  Exercise:               createEntity('exercises'),
  WorkoutLog:             createEntity('workout_logs'),
  WorkoutHistory:         createEntity('workout_history'),
  Measurement:            createEntity('measurements'),
  Goal:                   createEntity('goals'),
  ResultsLog:             createEntity('results_log'),
  AttendanceLog:          createEntity('attendance_log'),
  ClientService:          createEntity('client_services'),
  Message:                createEntity('messages'),
  Notification:           createEntity('notifications'),
  Reflection:             createEntity('reflections'),
  ProgramSeries:          createEntity('program_series'),
  Query:                  createEntity('custom_parameters'),
};

export const base44 = { entities, auth, integrations };
