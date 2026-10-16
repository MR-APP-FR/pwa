-- On/Off (`onoff`) et Déclarée (`declaree`) = même statut.
-- Société renseignée ⇒ On + Déclarée. Off ⇒ declaree false.

CREATE OR REPLACE FUNCTION public.sync_user_info_declaration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    NEW.onoff := true;
    NEW.declaree := true;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.declaree IS DISTINCT FROM OLD.declaree
    AND NEW.onoff IS NOT DISTINCT FROM OLD.onoff THEN
    -- Seul « Déclarée » a changé → aligne On/Off
    NEW.onoff := COALESCE(NEW.declaree, false);
    NEW.declaree := NEW.onoff;
  ELSE
    -- On/Off (ou les deux) → aligne Déclarée
    NEW.onoff := COALESCE(NEW.onoff, false);
    NEW.declaree := NEW.onoff;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_info_declaration ON public.user_info;

CREATE TRIGGER trg_sync_user_info_declaration
  BEFORE INSERT OR UPDATE OF onoff, declaree, company_id
  ON public.user_info
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_info_declaration();

COMMENT ON FUNCTION public.sync_user_info_declaration() IS
  'Maintient user_info.onoff ≡ user_info.declaree ; company_id non null ⇒ On.';
