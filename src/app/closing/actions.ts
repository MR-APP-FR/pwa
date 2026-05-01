'use server';

import { createClient } from '../../lib/supabase/server';
import type { PhotoSource } from '../../database/types';

/**
 * GRE-55 — server action de submit du formulaire de fermeture.
 * Upload de la photo télécollecte dans le bucket `telecollecte-photos`
 * puis insert dans `public.closing_form` (cf. GRE-113).
 *
 * Mode démo : `userId` passé par le client (profile switcher GRE-87).
 * À aligner avec `current_employee_id()` une fois GRE-54 livrée.
 */

export type SubmitClosingResult =
  | { ok: true; id: number; photoUrl: string }
  | { ok: false; error: string };

const PHOTO_BUCKET = 'telecollecte-photos';

function nullableNumber(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function nullableText(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isPhotoSource(value: unknown): value is PhotoSource {
  return value === 'camera_live' || value === 'phototheque';
}

export async function submitClosingForm(formData: FormData): Promise<SubmitClosingResult> {
  const siteId = Number(formData.get('siteId'));
  const userId = Number(formData.get('userId'));
  const date = String(formData.get('date') ?? '');
  const recetteTotale = Number(formData.get('recetteTotale'));
  const photoSourceRaw = formData.get('photoSource');
  const photoCapturedAtMsRaw = formData.get('photoCapturedAtMs');
  const photo = formData.get('photo');

  if (!Number.isFinite(siteId) || siteId <= 0) return { ok: false, error: 'Site invalide.' };
  if (!Number.isFinite(userId) || userId <= 0) return { ok: false, error: 'Utilisateur invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Date invalide.' };
  if (!Number.isFinite(recetteTotale)) return { ok: false, error: 'Recette totale manquante.' };
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: 'Photo de télécollecte manquante.' };
  }
  if (!isPhotoSource(photoSourceRaw)) {
    return { ok: false, error: 'Source de la photo invalide.' };
  }

  const photoCapturedAtIso =
    typeof photoCapturedAtMsRaw === 'string' && photoCapturedAtMsRaw.length > 0
      ? new Date(Number(photoCapturedAtMsRaw)).toISOString()
      : null;

  const supabase = await createClient();

  const ext = photo.name.includes('.') ? photo.name.split('.').pop() : 'jpg';
  const objectPath = `${date}/site-${siteId}/user-${userId}/${Date.now()}.${ext}`;

  const upload = await supabase.storage.from(PHOTO_BUCKET).upload(objectPath, photo, {
    cacheControl: '3600',
    contentType: photo.type || 'image/jpeg',
    upsert: false,
  });
  if (upload.error) {
    return { ok: false, error: `Upload photo échoué : ${upload.error.message}` };
  }

  const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(upload.data.path).data.publicUrl;

  const { data, error } = await supabase
    .from('closing_form')
    .insert({
      site_id: siteId,
      user_id: userId,
      date,
      recette_totale: recetteTotale,
      carte_bleue: nullableNumber(formData, 'carteBleue'),
      nb_enfants: nullableNumber(formData, 'nbEnfants'),
      tickets_ouverture: nullableNumber(formData, 'ticketsOuverture'),
      tickets_fermeture: nullableNumber(formData, 'ticketsFermeture'),
      paye_jour: nullableNumber(formData, 'payeJour'),
      paye_manquante_recuperee: nullableNumber(formData, 'payeManquanteRecuperee'),
      paye_double: nullableNumber(formData, 'payeDouble'),
      point_caisse_13_14: nullableNumber(formData, 'pointCaisse13h'),
      point_caisse_20_2035: nullableNumber(formData, 'pointCaisse20h'),
      observations: nullableText(formData, 'observations'),
      photo_url: publicUrl,
      photo_source: photoSourceRaw,
      photo_captured_at: photoCapturedAtIso,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Insert closing_form a échoué : ${error.message}` };
  }

  return { ok: true, id: data.id, photoUrl: publicUrl };
}
