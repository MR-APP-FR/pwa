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
  /**
   * `undefined` = ne pas toucher ce champ (cas de la fermeture, qui ne
   * recueille pas ces informations et ne doit pas écraser ce que l'ouverture
   * a déjà écrit sur la même ligne site/jour). `null` = valeur explicitement
   * effacée.
   */
  nettoyageVeille?: boolean | null;
  panneSujetIds: number[];
  pannesAutre: string | null;
  pannes: string | null;
  carteParking?: boolean | null;
  musiqueDisney?: boolean | null;
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

    // Bucket privé (audit 2026-08-18 §3.4) : on stocke le path, jamais une
    // URL publique — le CRM résout une URL signée à l'affichage.
    photoNettoyageUrl = upload.data.path;
    photoSource = input.nettoyagePhotoSource ?? 'phototheque';
    photoCapturedAt =
      input.nettoyagePhotoCapturedAtMs != null
        ? new Date(input.nettoyagePhotoCapturedAtMs).toISOString()
        : null;
  }

  // Upsert idempotent : une seule ligne par (site, jour) — modèle arbitré le
  // 2026-08-18 (audit §Lot 1). Ouverture et fermeture peuvent toutes deux
  // écrire cette ligne le même jour ; les champs omis du payload (nettoyage,
  // photo) ne sont PAS réinitialisés par PostgREST côté conflit — seuls les
  // champs explicitement fournis sont mis à jour. Ne jamais passer `null` en
  // dur pour un champ qu'on ne recueille pas ici (cf. appel depuis /closing).
  const row: Record<string, unknown> = {
    site_id: input.siteId,
    user_id: userId,
    date: input.date,
    pannes_sujet_ids: input.panneSujetIds,
    pannes_autre: input.pannesAutre,
    pannes: input.pannes,
  };
  if (input.nettoyageVeille !== undefined) row.nettoyage_veille = input.nettoyageVeille;
  if (input.carteParking !== undefined) row.carte_parking = input.carteParking;
  if (input.musiqueDisney !== undefined) row.musique_disney = input.musiqueDisney;
  if (photoNettoyageUrl !== null) {
    row.photo_nettoyage_url = photoNettoyageUrl;
    row.photo_source = photoSource;
    row.photo_captured_at = photoCapturedAt;
  }

  const { data, error } = await supabase
    .from('daily_info')
    .upsert(row, { onConflict: 'site_id,date' })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Enregistrement daily_info a échoué : ${error.message}` };
  }

  if (input.carteParking === false) {
    const { error: rpcError } = await supabase.rpc('report_parking_card_missing', {
      p_site_id: input.siteId,
      p_date: input.date,
    });
    if (rpcError) {
      return {
        ok: false,
        error: `Info-jour enregistrée, mais l'alerte carte parking a échoué : ${rpcError.message}`,
      };
    }
  }

  return { ok: true, id: data.id };
}
