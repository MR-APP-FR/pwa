-- Seuil alerte stock feuilles de jour / enveloppes (FDJ) : 20 → 10.
-- Aligné PWA opening/actions.ts (feuillesCount < 10).

CREATE OR REPLACE FUNCTION public.report_opening_low_stock_to_bureau(
  p_site_id integer,
  p_date date,
  p_feuilles_count integer,
  p_tickets_ouverture integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  site_label text;
  teneur_name text;
  corps text;
  low_feuilles boolean;
  low_tickets boolean;
  pad integer := 7;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  low_feuilles := p_feuilles_count IS NOT NULL AND p_feuilles_count < 10;
  low_tickets := p_tickets_ouverture IS NOT NULL AND p_tickets_ouverture < 500;

  IF NOT low_feuilles AND NOT low_tickets THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.planning AS p
    WHERE p.site_id = p_site_id
      AND p.year = EXTRACT(YEAR FROM p_date)::integer
      AND p.month = EXTRACT(MONTH FROM p_date)::integer
      AND p.day = EXTRACT(DAY FROM p_date)::integer
      AND (p.user_id = emp_id OR p.double_id = emp_id)
  ) THEN
    RAISE EXCEPTION 'Pas de mission ce jour sur ce site';
  END IF;

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  IF low_feuilles
     AND NOT EXISTS (
       SELECT 1
       FROM public.staff_message AS sm
       WHERE sm.channel = 'bureau'
         AND sm.meta->>'kind' = 'opening_low_feuilles'
         AND (sm.meta->>'site_id')::integer = p_site_id
         AND sm.meta->>'date' = p_date::text
     )
  THEN
    corps := public.bureau_msg_line('📄', 'Feuilles', p_feuilles_count::text, pad)
      || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad);

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '⚠️ Feuilles : Niveau bas',
      corps,
      'appli',
      'bureau',
      NULL,
      '{}'::integer[],
      '{}'::integer[],
      false,
      jsonb_build_object(
        'kind', 'opening_low_feuilles',
        'site_id', p_site_id,
        'date', p_date::text,
        'feuilles_count', p_feuilles_count
      )
    );
  END IF;

  IF low_tickets
     AND NOT EXISTS (
       SELECT 1
       FROM public.staff_message AS sm
       WHERE sm.channel = 'bureau'
         AND sm.meta->>'kind' = 'opening_low_tickets'
         AND (sm.meta->>'site_id')::integer = p_site_id
         AND sm.meta->>'date' = p_date::text
     )
  THEN
    corps := public.bureau_msg_line('🎟️', 'Tickets', p_tickets_ouverture::text, pad)
      || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad);

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '⚠️ Tickets : Niveau bas',
      corps,
      'appli',
      'bureau',
      NULL,
      '{}'::integer[],
      '{}'::integer[],
      false,
      jsonb_build_object(
        'kind', 'opening_low_tickets',
        'site_id', p_site_id,
        'date', p_date::text,
        'tickets_ouverture', p_tickets_ouverture
      )
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.report_opening_low_stock_to_bureau(integer, date, integer, integer) IS
  'Alerte Bureau (modèle WhatsApp) : feuilles/FDJ < 10 ou tickets < 500.';
