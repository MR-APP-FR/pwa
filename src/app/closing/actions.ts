'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';
import type { PhotoSource } from '../../database/types';
import { evaluateClosingForce } from '../../lib/geo';
import { closingDeadlineParisFromDateIso } from '../../lib/parisTime';
import { getDevOverrideNow } from '../../lib/dev/dateOverrideServer';

/**
 * Submit fermeture : upload photo télécollecte puis upsert `closing_form`.
 * `user_id` dérivé de la session, jamais du client.
 * Distance / horaire recalculés côté serveur : une fermeture loin de
 * l'ouverture ou avant 20h05 n'est acceptée qu'avec une raison, et alerte
 * le canal bureau.
 */

export type SubmitClosingResult =
  | { ok: true; id: number; photoPath: string }
  | { ok: false; error: string };

const PHOTO_BUCKET = 'telecollecte-photos';

function nullableNumber(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function optionalCoord(formData: FormData, key: string, min: number, max: number): number | null {
  const n = nullableNumber(formData, key);
  if (n === null) return null;
  if (n < min || n > max) return null;
  return n;
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

function parseChecklist(formData: FormData): Record<string, boolean> {
  const raw = formData.get('checklist');
  if (typeof raw !== 'string' || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // ignore JSON invalide → checklist vide
  }
  return {};
}

export async function submitClosingForm(formData: FormData): Promise<SubmitClosingResult> {
  const siteId = Number(formData.get('siteId'));
  const date = String(formData.get('date') ?? '');
  const recetteTotale = Number(formData.get('recetteTotale'));
  const photoSourceRaw = formData.get('photoSource');
  const photoCapturedAtMsRaw = formData.get('photoCapturedAtMs');
  const photo = formData.get('photo');

  if (!Number.isFinite(siteId) || siteId <= 0) return { ok: false, error: 'Site invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Date invalide.' };
  if (!Number.isFinite(recetteTotale)) return { ok: false, error: 'Recette totale manquante.' };
  if (recetteTotale < 0) {
    return { ok: false, error: 'Recette totale invalide.' };
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: 'Photo de télécollecte manquante.' };
  }
  if (!isPhotoSource(photoSourceRaw)) {
    return { ok: false, error: 'Source de la photo invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }
  const { userId, supabase } = session;

  const { data: openingRow } = await supabase
    .from('opening_form')
    .select('client_lat, client_lng')
    .eq('site_id', siteId)
    .eq('date', date)
    .maybeSingle();

  const deadline = closingDeadlineParisFromDateIso(date);
  const effectiveNow = (await getDevOverrideNow()) ?? new Date();
  const beforeDeadline = deadline !== null && effectiveNow < deadline;

  const clientLat = optionalCoord(formData, 'clientLat', -90, 90);
  const clientLng = optionalCoord(formData, 'clientLng', -180, 180);
  const forceCheck = evaluateClosingForce({
    anchorLatitude: openingRow?.client_lat,
    anchorLongitude: openingRow?.client_lng,
    clientLatitude: clientLat,
    clientLongitude: clientLng,
    beforeDeadline,
  });

  const forceReason = nullableText(formData, 'forceReason');
  if (forceCheck.needsForce) {
    if (!forceReason) {
      return {
        ok: false,
        error: 'Indique une raison pour forcer la fermeture.',
      };
    }
    if (forceReason.length > 500) {
      return { ok: false, error: 'Raison trop longue (500 caractères max).' };
    }
  }

  const photoCapturedAtIso =
    typeof photoCapturedAtMsRaw === 'string' && photoCapturedAtMsRaw.length > 0
      ? new Date(Number(photoCapturedAtMsRaw)).toISOString()
      : null;

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

  // Bucket privé (audit 2026-08-18 §3.4) : on stocke le path, jamais une URL
  // publique — le CRM résout une URL signée à l'affichage.
  const photoPath = upload.data.path;

  const [y, m, d] = date.split('-').map(Number);
  const { data: planningRow } = await supabase
    .from('planning')
    .select('user_id, double_id')
    .eq('site_id', siteId)
    .eq('year', y)
    .eq('month', m)
    .eq('day', d)
    .maybeSingle();
  const partnerUserId =
    planningRow?.user_id === userId
      ? (planningRow?.double_id ?? null)
      : planningRow?.double_id === userId
        ? (planningRow?.user_id ?? null)
        : null;

  const { data, error } = await supabase
    .from('closing_form')
    .upsert(
      {
        site_id: siteId,
        user_id: userId,
        partner_user_id: partnerUserId,
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
        photo_url: photoPath,
        photo_source: photoSourceRaw,
        photo_captured_at: photoCapturedAtIso,
        checklist: parseChecklist(formData),
        avis_google_count: nullableNumber(formData, 'avisGoogleCount') ?? 0,
        force_reason: forceCheck.needsForce ? forceReason : null,
        force_early: Boolean(forceCheck.needsForce && forceCheck.early),
        force_distance_m: forceCheck.needsForce ? forceCheck.distanceM : null,
        force_geo_failed: Boolean(forceCheck.needsForce && forceCheck.geoFailed),
        force_client_lat: forceCheck.needsForce && !forceCheck.geoFailed ? clientLat : null,
        force_client_lng: forceCheck.needsForce && !forceCheck.geoFailed ? clientLng : null,
        ...(clientLat != null && clientLng != null
          ? { client_lat: clientLat, client_lng: clientLng }
          : {}),
      },
      { onConflict: 'site_id,date' },
    )
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Enregistrement closing_form a échoué : ${error.message}` };
  }

  if (forceCheck.needsForce && forceReason) {
    const { error: rpcError } = await supabase.rpc('report_forced_closing_to_bureau', {
      p_site_id: siteId,
      p_date: date,
      p_reason: forceReason,
      p_distance_m: forceCheck.distanceM,
      p_early: forceCheck.early,
      p_geo_failed: forceCheck.geoFailed,
      p_client_lat: forceCheck.geoFailed ? null : (clientLat ?? null),
      p_client_lng: forceCheck.geoFailed ? null : (clientLng ?? null),
    });
    if (rpcError) {
      return {
        ok: false,
        error: `Fermeture enregistrée, mais l'alerte bureau a échoué : ${rpcError.message}`,
      };
    }
  }

  return { ok: true, id: data.id, photoPath };
}
