-- Align photo_source with PWA/admin types (`camera_live` | `phototheque`).
-- Keep legacy `photo_live` for existing rows.

alter table public.closing_form
  drop constraint if exists closing_form_photo_source_check;

alter table public.closing_form
  add constraint closing_form_photo_source_check
  check (photo_source = any (array['camera_live'::text, 'photo_live'::text, 'phototheque'::text]));

alter table public.daily_info
  drop constraint if exists daily_info_photo_source_check;

alter table public.daily_info
  add constraint daily_info_photo_source_check
  check (photo_source = any (array['camera_live'::text, 'photo_live'::text, 'phototheque'::text]));
