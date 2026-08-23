-- Un envoi zone ne vise qu'une seule zone (un site a déjà un seul group_id).
-- Recadre les messages dont site_ids mélangeaient plusieurs groupes.

UPDATE public.staff_message AS m
SET site_ids = COALESCE((
  SELECT ARRAY_AGG(s.id ORDER BY s.id)
  FROM unnest(m.site_ids) AS sid(id)
  JOIN public.site AS s ON s.id = sid.id
  WHERE s.group_id = (
    SELECT s2.group_id
    FROM unnest(m.site_ids) AS sid2(id)
    JOIN public.site AS s2 ON s2.id = sid2.id
    GROUP BY s2.group_id
    ORDER BY COUNT(*) DESC, s2.group_id
    LIMIT 1
  )
), '{}'::integer[])
WHERE (
  SELECT COUNT(DISTINCT s.group_id)
  FROM unnest(m.site_ids) AS sid(id)
  JOIN public.site AS s ON s.id = sid.id
) > 1;

CREATE OR REPLACE FUNCTION public.staff_message_site_ids_one_zone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.site_ids IS NULL OR cardinality(NEW.site_ids) = 0 THEN
    RETURN NEW;
  END IF;
  IF (
    SELECT COUNT(DISTINCT s.group_id)
    FROM public.site AS s
    WHERE s.id = ANY (NEW.site_ids)
  ) > 1 THEN
    RAISE EXCEPTION 'staff_message.site_ids must all belong to the same zone';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_message_site_ids_one_zone ON public.staff_message;
CREATE TRIGGER staff_message_site_ids_one_zone
  BEFORE INSERT OR UPDATE OF site_ids ON public.staff_message
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_message_site_ids_one_zone();

REVOKE ALL ON FUNCTION public.staff_message_site_ids_one_zone() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_message_site_ids_one_zone() FROM anon, authenticated;
