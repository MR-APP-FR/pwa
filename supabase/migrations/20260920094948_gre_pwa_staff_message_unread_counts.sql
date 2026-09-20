-- Compteurs pastilles PWA (messages staff / planning assigné) sans charger les corps.
-- SECURITY INVOKER : RLS staff_message (ciblage employé) s'applique.

CREATE INDEX IF NOT EXISTS staff_message_ack_user_id_idx
  ON public.staff_message_ack (user_id);

CREATE OR REPLACE FUNCTION public.get_pwa_staff_message_badge_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  unread_staff integer := 0;
  unread_planning integer := 0;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL OR emp_id <= 0 THEN
    RETURN jsonb_build_object(
      'unread_staff', 0,
      'unread_planning_assigned', 0
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO unread_staff
  FROM public.staff_message AS sm
  LEFT JOIN public.staff_message_ack AS a
    ON a.message_id = sm.id
   AND a.user_id = emp_id
  WHERE sm.channel = 'staff'
    AND (
      CASE
        WHEN sm.require_ack THEN a.acked_at IS NULL
        ELSE a.read_at IS NULL
      END
    );

  SELECT COUNT(*)::integer
  INTO unread_planning
  FROM public.staff_message AS sm
  LEFT JOIN public.staff_message_ack AS a
    ON a.message_id = sm.id
   AND a.user_id = emp_id
  WHERE sm.channel = 'staff'
    AND sm.titre = 'Planning semaine prochaine'
    AND (
      CASE
        WHEN sm.require_ack THEN a.acked_at IS NULL
        ELSE a.read_at IS NULL
      END
    );

  RETURN jsonb_build_object(
    'unread_staff', COALESCE(unread_staff, 0),
    'unread_planning_assigned', COALESCE(unread_planning, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_pwa_staff_message_badge_counts() IS
  'Pastilles PWA : messages staff non lus / non confirmés, et « Planning semaine prochaine » non lu.';

REVOKE ALL ON FUNCTION public.get_pwa_staff_message_badge_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pwa_staff_message_badge_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pwa_staff_message_badge_counts() TO authenticated;
