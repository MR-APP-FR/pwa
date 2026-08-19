-- Audit 2026-08-18 §3.4 (Lot 3) : bucket telecollecte-photos en privé.
-- Les colonnes photo_url / photo_nettoyage_url stockaient une URL publique
-- complète ; on les fait pointer sur le PATH storage (résolu en URL signée
-- côté CRM), et on retire l'accès public.

-- 1) Migrer les lignes existantes : URL publique -> path
update public.closing_form
set photo_url = regexp_replace(photo_url, '^https://[^/]+/storage/v1/object/public/telecollecte-photos/', '')
where photo_url like 'https://%/storage/v1/object/public/telecollecte-photos/%';

update public.daily_info
set photo_nettoyage_url = regexp_replace(photo_nettoyage_url, '^https://[^/]+/storage/v1/object/public/telecollecte-photos/', '')
where photo_nettoyage_url like 'https://%/storage/v1/object/public/telecollecte-photos/%';

-- 2) Bucket privé + limites MIME/taille
update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'telecollecte-photos';
