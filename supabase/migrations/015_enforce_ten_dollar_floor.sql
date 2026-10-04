-- 015_enforce_ten_dollar_floor.sql
-- Enforce platform minimum $10 (1000 cents) active value floor on all existing projects

UPDATE projects
SET 
  current_active_value_minor = GREATEST(1000, current_active_value_minor),
  total_paid_minor = GREATEST(1000, total_paid_minor)
WHERE current_active_value_minor < 1000;
