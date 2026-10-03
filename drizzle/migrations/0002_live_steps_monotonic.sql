-- Preserve overlapping device totals. The mirror remains display-only.
CREATE OR REPLACE FUNCTION public.svj_keep_live_steps_monotonic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id = OLD.user_id AND NEW.date_key = OLD.date_key THEN
    NEW.steps := greatest(OLD.steps, NEW.steps);
    NEW.distance_meters := greatest(OLD.distance_meters, NEW.distance_meters);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.svj_keep_live_steps_monotonic() FROM PUBLIC;
DROP TRIGGER IF EXISTS svj_live_steps_monotonic ON public.svj_live_daily_steps;
CREATE TRIGGER svj_live_steps_monotonic BEFORE INSERT OR UPDATE ON public.svj_live_daily_steps
FOR EACH ROW EXECUTE FUNCTION public.svj_keep_live_steps_monotonic();
