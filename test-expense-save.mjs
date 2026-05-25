import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ||
                     process.env.SUPABASE_URL ||
                     'https://rrxcycidsojncpqlagsf.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ||
                          process.env.SUPABASE_ANON_KEY;

const TEST_EMAIL = process.env.TEST_EMAIL || 'athletigo@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD;

if (!SUPABASE_ANON_KEY || !TEST_PASSWORD) {
  console.error('Missing env: VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY) and TEST_PASSWORD');
  console.error('Usage:');
  console.error('  set VITE_SUPABASE_ANON_KEY=<anon key from src/lib/supabaseClient.js>');
  console.error('  set TEST_PASSWORD=<password for athletigo@gmail.com>');
  console.error('  node test-expense-save.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('=== Expense save E2E test ===');

  const { data: auth, error: authErr } = await supabase.auth
    .signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (authErr) throw new Error(`Auth failed: ${authErr.message}`);
  const userId = auth.user.id;
  console.log(`✅ Signed in as ${TEST_EMAIL} (${userId})`);

  const testBlob = new Blob(
    [new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(100).fill(0)])],
    { type: 'image/jpeg' }
  );
  const path = `lifeos/test-${Date.now()}.jpg`;
  console.log(`Uploading test photo to lifeos-files/${path}...`);

  let { data: upload, error: uploadErr } = await supabase.storage
    .from('lifeos-files')
    .upload(path, testBlob, { contentType: 'image/jpeg', upsert: true });

  let bucketUsed = 'lifeos-files';

  if (uploadErr) {
    console.warn(`lifeos-files upload failed: ${uploadErr.message}`);
    console.log('Trying fallback bucket: media...');
    const fb = await supabase.storage
      .from('media')
      .upload(path, testBlob, { contentType: 'image/jpeg', upsert: true });
    if (fb.error) {
      throw new Error(
        `BOTH BUCKETS FAILED. lifeos-files: ${uploadErr.message}. ` +
        `media: ${fb.error.message}. Storage bucket may be missing or RLS blocked.`
      );
    }
    bucketUsed = 'media';
    upload = fb.data;
  }
  console.log(`✅ Photo uploaded to ${bucketUsed}: ${upload.path}`);

  const { data: { publicUrl } } = supabase.storage
    .from(bucketUsed)
    .getPublicUrl(path);
  console.log(`✅ Public URL: ${publicUrl}`);

  const expensePayload = {
    user_id: userId,
    amount: 99.99,
    category: 'TEST',
    payment_method: 'cash',
    date: new Date().toISOString().slice(0, 10),
    notes: 'E2E test expense — safe to delete',
    receipt_url: publicUrl,
  };
  console.log('Inserting expense...');
  const { data: inserted, error: insertErr } = await supabase
    .from('expenses')
    .insert(expensePayload)
    .select()
    .single();

  if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);
  console.log(`✅ Expense inserted: id=${inserted.id}`);

  const { data: read, error: readErr } = await supabase
    .from('expenses')
    .select('id, amount, category, receipt_url, created_at')
    .eq('id', inserted.id)
    .single();

  if (readErr) throw new Error(`Read-back failed: ${readErr.message}`);

  console.log('--- Read-back row ---');
  console.log(JSON.stringify(read, null, 2));

  if (read.receipt_url == null) {
    throw new Error('FAIL: receipt_url is null after save');
  }
  if (read.receipt_url !== publicUrl) {
    throw new Error(
      `FAIL: receipt_url mismatch. Expected: ${publicUrl}, Got: ${read.receipt_url}`
    );
  }
  console.log(`✅ receipt_url correctly persisted`);

  try {
    const fetchRes = await fetch(read.receipt_url);
    if (!fetchRes.ok) {
      console.warn(
        `⚠ Photo URL returns ${fetchRes.status} — photo saved but not publicly accessible. ` +
        `Storage bucket may not have public read policy.`
      );
    } else {
      console.log(`✅ Photo accessible via public URL (${fetchRes.status})`);
    }
  } catch (e) {
    console.warn(`⚠ Could not fetch photo URL: ${e.message}`);
  }

  console.log('Cleaning up test data...');
  await supabase.from('expenses').delete().eq('id', inserted.id);
  await supabase.storage.from(bucketUsed).remove([path]);
  console.log('✅ Cleanup complete');

  console.log('\n=== ALL CHECKS PASSED ===');
  console.log(`Storage bucket used: ${bucketUsed}`);
  console.log('Expense save flow is verified working end-to-end.');
}

run().catch(err => {
  console.error('\n=== TEST FAILED ===');
  console.error(err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
