-- Validation planning semaine : ack employé × semaine + RPC validate.

CREATE TABLE public.planning_week_ack (
  week_start date NOT NULL,
  user_id integer NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'validated')),
  assignment_fingerprint text NOT NULL DEFAULT '',
  notified_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, user_id)
);

CREATE INDEX planning_week_ack_user_pending_idx
  ON public.planning_week_ack (user_id)
  WHERE status = 'pending';

CREATE TRIGGER planning_week_ack_set_updated_at
  BEFORE UPDATE ON public.planning_week_ack
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.planning_week_ack ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_week_ack admin all" ON public.planning_week_ack
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "planning_week_ack employee select own" ON public.planning_week_ack
  FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_employee_id()));

COMMENT ON TABLE public.planning_week_ack IS
  'Validation des attributions planning : pending jusqu’à validate_planning_week ; fingerprint pour re-notif après modif.';

-- Validation semaine entière (own) + sync flags user_confirmed / double_confirmed.
CREATE OR REPLACE FUNCTION public.validate_planning_week(p_week_start date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me integer := (SELECT public.current_employee_id());
  updated_rows integer;
BEGIN
  IF me IS NULL OR me <= 0 THEN
    RAISE EXCEPTION 'not authenticated as employee';
  END IF;

  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start required';
  END IF;

  UPDATE public.planning_week_ack
  SET
    status = 'validated',
    validated_at = now()
  WHERE week_start = p_week_start
    AND user_id = me
    AND status = 'pending';

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  IF updated_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_to_validate');
  END IF;

  UPDATE public.planning
  SET user_confirmed = true
  WHERE user_id = me
    AND make_date(year, month, day) BETWEEN p_week_start AND (p_week_start + 6);

  UPDATE public.planning
  SET double_confirmed = true
  WHERE double_id = me
    AND make_date(year, month, day) BETWEEN p_week_start AND (p_week_start + 6);

  RETURN jsonb_build_object('ok', true, 'week_start', p_week_start);
END;
$$;

COMMENT ON FUNCTION public.validate_planning_week(date) IS
  'Employé : valide toutes ses attributions de la semaine (ack + flags confirmation).';

REVOKE ALL ON FUNCTION public.validate_planning_week(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_planning_week(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_planning_week(date) TO authenticated;
