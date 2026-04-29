-- Run in Supabase SQL Editor and paste the result back so the
-- payment-fields migration only adds what's actually missing.
-- Returns the live column list for the six fields the completion-
-- guard flow expects.

SELECT column_name, data_type, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'sessions'
  AND  column_name IN (
    'payment_status',
    'paid_at',
    'price',
    'payment_required',
    'requires_payment',
    'payment_override_reason'
  )
ORDER  BY column_name;
