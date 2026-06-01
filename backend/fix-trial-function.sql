-- Fix: Update calculate_trial_days_remaining function to return 0 instead of NULL when trial_end_date is NULL

CREATE OR REPLACE FUNCTION calculate_trial_days_remaining(
  p_end_date TIMESTAMPTZ
)
RETURNS INT AS $$
BEGIN
  IF p_end_date IS NULL THEN
    RETURN 0;  -- No trial end date means trial is no longer active (0 days remaining)
  END IF;
  
  RETURN GREATEST(0, DATE_PART('day', p_end_date - NOW())::INT);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Verify function was updated
SELECT p_end_date, calculate_trial_days_remaining(p_end_date) as days_remaining
FROM (SELECT NULL::TIMESTAMPTZ as p_end_date) t;
