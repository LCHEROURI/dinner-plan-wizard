-- Normalize any legacy meal_plans.plan_length values outside 1..7
UPDATE public.meal_plans SET plan_length = 1 WHERE plan_length < 1;
UPDATE public.meal_plans SET plan_length = 7 WHERE plan_length > 7;