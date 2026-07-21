'use server';

import { requireEmployeeSession } from '../auth/employee';
import type { PhotoSource } from '../../database/types';

const NETTOYAGE_PHOTO_BUCKET = 'telecollecte-photos';

/**
 * Actions info-jour :
 * - `createSujet` : crée un sujet (manège) manquant pour un site
 * - `submitDailyInfo` : insert `daily_info` (+ photo nettoyage optionnelle)
 *
 * `user_id` dérivé de la session via `current_employee_id()`.
 */

export type CreateSujetResult =
  | { ok: true; id: number; name: string; site_id: number }
  | { ok: false; error: string };

export async function createSujet(
  siteId: number,
  rawName: string,
): Promise<CreateSujetResult> {
  if (!Number.isFinite(siteId) || siteId <= 0) {
    return { ok: false, error: 'Site invalide.' };
  }
  const name = rawName.trim();
  if (name.length === 0) {
    return { ok: false, error: 'Le nom du sujet est requis.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }
  const supabase = session.supabase;

  const existing = await supabase
    .from('sujets')
    .select('id, name, site_id, state')
    .eq('site_id', siteId)
    .ilike('name', name)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: `Lookup sujet a échoué : ${existing.error.message}` };
  }

  if (existing.data) {
    // UPDATE sujets = admin only (RLS §4) — on réutilise la ligne même inactive.
    return {
      ok: true,
      id: existing.data.id,
      name: existing.data.name,
      site_id: existing.data.site_id,
    };
  }

  const inserted = await supabase
    .from('sujets')
    .insert({ site_id: siteId, name, state: true })
    .select('id, name, site_id')
    .single();

  if (inserted.error) {
    return { ok: false, error: `Création sujet a échoué : ${inserted.error.message}` };
  }
  return { ok: true, ...inserted.data };
}

export type SubmitDailyInfoResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

interface SubmitDailyInfoInput {
  siteId: number;
  /** Format ISO date YYYY-MM-DD — date de la mission */
  date: string;
  nettoyageVeille: boolean | null;
  panneSujetIds: number[];
  pannesAutre: string | null;
  pannes: string | null;
  carteParking: boolean | null;
  musiqueDisney: boolean | null;
  /** Photo optionnelle du nettoyage veille (cf. étape 2 du cadrage prod). */
  nettoyagePhoto?: File | null;
  nettoyagePhotoSource?: PhotoSource | null;
  nettoyagePhotoCapturedAtMs?: number | null;
}

export async function submitDailyInfo(
  input: SubmitDailyInfoInput,
): Promise<SubmitDailyInfoResult> {
  if (!Number.isFinite(input.siteId) || input.siteId <= 0) {
    return { ok: false, error: 'Site invalide.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: 'Date invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }
  const { userId, supabase } = session;

  let photoNettoyageUrl: string | null = null;
  let photoSource: PhotoSource | null = null;
  let photoCapturedAt: string | null = null;

  const photo = input.nettoyagePhoto;
  if (photo instanceof File && photo.size > 0) {
    const ext = photo.name.includes('.') ? photo.name.split('.').pop() : 'jpg';
    const objectPath = `nettoyage/${input.date}/site-${input.siteId}/user-${userId}/${Date.now()}.${ext}`;

    const upload = await supabase.storage.from(NETTOYAGE_PHOTO_BUCKET).upload(objectPath, photo, {
      cacheControl: '3600',
      contentType: photo.type || 'image/jpeg',
      upsert: false,
    });
    if (upload.error) {
      return { ok: false, error: `Upload photo nettoyage échoué : ${upload.error.message}` };
    }

    photoNettoyageUrl = supabase.storage
      .from(NETTOYAGE_PHOTO_BUCKET)
      .getPublicUrl(upload.data.path).data.publicUrl;
    photoSource = input.nettoyagePhotoSource ?? 'phototheque';
    photoCapturedAt =
      input.nettoyagePhotoCapturedAtMs != null
        ? new Date(input.nettoyagePhotoCapturedAtMs).toISOString()
        : null;
  }

  const { data, error } = await supabase
    .from('daily_info')
    .insert({
      site_id: input.siteId,
      user_id: userId,
      date: input.date,
      nettoyage_veille: input.nettoyageVeille,
      pannes_sujet_ids: input.panneSujetIds,
      pannes_autre: input.pannesAutre,
      pannes: input.pannes,
      carte_parking: input.carteParking,
      musique_disney: input.musiqueDisney,
      photo_nettoyage_url: photoNettoyageUrl,
      photo_source: photoSource,
      photo_captured_at: photoCapturedAt,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Insert daily_info a échoué : ${error.message}` };
  }
  return { ok: true, id: data.id };
}
