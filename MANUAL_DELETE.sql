-- Manual Delete Trainee Script
-- Replace the UUID below with the trainee you want to delete
-- Run in Supabase SQL Editor

DO $$
DECLARE
  target_id uuid := '48cb1b24-c421-4ae6-b8d5-ad860d87f55b'; -- athletigo@gmail.com
BEGIN
  -- Delete related records in child tables first
  DELETE FROM service_transactions WHERE service_id IN (SELECT id FROM client_services WHERE trainee_id = target_id);
  DELETE FROM service_payments WHERE service_id IN (SELECT id FROM client_services WHERE trainee_id = target_id);
  DELETE FROM client_services WHERE trainee_id = target_id;
  DELETE FROM measurements WHERE trainee_id = target_id;
  DELETE FROM results_log WHERE trainee_id = target_id;
  DELETE FROM baselines WHERE trainee_id = target_id;
  DELETE FROM goals WHERE trainee_id = target_id;
  DELETE FROM notifications WHERE user_id = target_id;
  DELETE FROM messages WHERE sender_id = target_id OR receiver_id = target_id;
  DELETE FROM reflections WHERE user_id = target_id;
  DELETE FROM workout_logs WHERE user_id = target_id;
  DELETE FROM workout_history WHERE user_id = target_id;
  DELETE FROM attendance_log WHERE user_id = target_id;

  -- Delete sessions where this trainee is the only participant
  DELETE FROM sessions WHERE id IN (
    SELECT id FROM sessions
    WHERE participants::text LIKE '%' || target_id::text || '%'
  );

  -- Delete training plan assignments
  DELETE FROM training_plan_assignments WHERE trainee_id = target_id;

  -- Delete training plans assigned to or created by this trainee
  -- First delete exercises in those plan sections
  DELETE FROM exercises WHERE section_id IN (
    SELECT ts.id FROM training_sections ts
    JOIN training_plans tp ON ts.plan_id = tp.id
    WHERE tp.assigned_to = target_id OR tp.created_by = target_id
  );
  DELETE FROM training_sections WHERE plan_id IN (
    SELECT id FROM training_plans WHERE assigned_to = target_id OR created_by = target_id
  );
  DELETE FROM training_plans WHERE assigned_to = target_id OR created_by = target_id;

  -- Delete the user profile
  DELETE FROM users WHERE id = target_id;

  -- Delete the auth user (requires service_role access)
  DELETE FROM auth.users WHERE id = target_id;

  RAISE NOTICE 'Trainee % deleted successfully', target_id;
END $$;
