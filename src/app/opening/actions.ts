'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';
import { dateIsoToJourSemaineKey } from '../../lib/parisTime';
import {
  CHRONO_WEEKDAY_KEY,
  isChronoInExpectedRange,
} from './chrono';

/**
 * Submit du formulaire d'ouverture → `public.opening_form`.
 * `user_id` dérivé de la session (`current_employee_id()`), jamais du client.
 */

export type SubmitOpeningResult =
  | { ok: true; id: number }
  | { ok: false; error: string; code?: 'chrono_retry' };

interface SubmitOpeningInput {
  siteId: number;
  /** Format ISO date YYYY-MM-DD — date de la mission */
  date: string;
  /** Texte libre validé côté UI (X ou X/Y) — cf. GRE-107 */
  feuillesDeJour: string;
  ticketsOuverture: number;
  fondCaisse100: boolean;
  observations: string | null;
  clientLat: number | null;
  clientLng: number | null;
  chronoSeconds: number | null;
  chronoConfirmOutOfRange: boolean;
  panneaux: Record<string, boolean> | null;
  affaires: Record<string, { present: boolean; reste: number | null }> | null;
}

function parseJsonObject(formData: FormData, key: string): unknown | null {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function optionalCoord(formData: FormData, key: string, min: number, max: number): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Compte feuilles : entier simple ou préfixe numérique d'un format X/Y. */
function parseFeuillesCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+)\s*\//.exec(trimmed);
  if (match) return Number(match[1]);
  return null;
}

function parseInput(formData: FormData): SubmitOpeningInput | { error: string } {
  const siteId = Number(formData.get('siteId'));
  const date = String(formData.get('date') ?? '');
  const feuillesDeJour = String(formData.get('feuillesDeJour') ?? '').trim();
  const ticketsOuvertureRaw = formData.get('ticketsOuverture');
  const ticketsOuverture = Number(ticketsOuvertureRaw);
  const fondCaisse100 = formData.get('fondCaisse100') === '1';
  const observationsRaw = String(formData.get('observations') ?? '').trim();
  const observations = observationsRaw.length === 0 ? null : observationsRaw;
  const clientLat = optionalCoord(formData, 'clientLat', -90, 90);
  const clientLng = optionalCoord(formData, 'clientLng', -180, 180);
  const clientPair =
    clientLat != null && clientLng != null
      ? { clientLat, clientLng }
      : { clientLat: null, clientLng: null };

  const isChronoDay = dateIsoToJourSemaineKey(date) === CHRONO_WEEKDAY_KEY;
  let chronoSeconds: number | null = null;
  if (isChronoDay) {
    const chronoRaw = formData.get('chronoSeconds');
    if (chronoRaw === null || chronoRaw === '') {
      return { error: 'Chrono manquant.' };
    }
    const parsedChrono = Number(chronoRaw);
    if (!Number.isInteger(parsedChrono) || parsedChrono < 0 || parsedChrono > 5999) {
      return { error: 'Chrono invalide.' };
    }
    chronoSeconds = parsedChrono;
  }

  let panneaux: SubmitOpeningInput['panneaux'] = null;
  let affaires: SubmitOpeningInput['affaires'] = null;
  if (isChronoDay) {
    const panneauxRaw = parseJsonObject(formData, 'panneaux');
    const affairesRaw = parseJsonObject(formData, 'affaires');
    if (!panneauxRaw || typeof panneauxRaw !== 'object' || Array.isArray(panneauxRaw)) {
      return { error: 'Panneaux manquants.' };
    }
    if (!affairesRaw || typeof affairesRaw !== 'object' || Array.isArray(affairesRaw)) {
      return { error: 'Affaires manquantes.' };
    }
    panneaux = panneauxRaw as SubmitOpeningInput['panneaux'];
    affaires = affairesRaw as SubmitOpeningInput['affaires'];
  }

  if (!Number.isFinite(siteId) || siteId <= 0) return { error: 'Site invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date invalide.' };
  if (feuillesDeJour.length === 0) return { error: 'Feuilles de jour manquantes.' };
  if (ticketsOuvertureRaw === null || !Number.isFinite(ticketsOuverture)) {
    return { error: "Nombre de tickets d'ouverture manquant" };
  }

  return {
    siteId,
    date,
    feuillesDeJour,
    ticketsOuverture,
    fondCaisse100,
    observations,
    ...clientPair,
    chronoSeconds,
    chronoConfirmOutOfRange: formData.get('chronoConfirmOutOfRange') === '1',
    panneaux,
    affaires,
  };
}

export async function submitOpeningForm(formData: FormData): Promise<SubmitOpeningResult> {
  const parsed = parseInput(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const chronoOutOfRange =
    parsed.chronoSeconds != null && !isChronoInExpectedRange(parsed.chronoSeconds);
  if (chronoOutOfRange && !parsed.chronoConfirmOutOfRange) {
    return {
      ok: false,
      error: 'chrono_retry',
      code: 'chrono_retry',
    };
  }

  // Upsert idempotent : une seule ligne par (site, jour) — modèle arbitré le
  // 2026-08-18 (audit §Lot 1). Le dernier soumetteur (teneur ou double) devient
  // user_id ; ça évite l'échec 23505 du second teneur d'un binôme.
  // GPS : on n'écrit client_lat/lng que s'ils sont présents, pour ne pas
  // écraser une position déjà captée si le GPS est refusé au second envoi.
  const { data, error } = await session.supabase
    .from('opening_form')
    .upsert(
      {
        site_id: parsed.siteId,
        user_id: session.userId,
        date: parsed.date,
        feuilles_de_jour: parsed.feuillesDeJour,
        tickets_ouverture: parsed.ticketsOuverture,
        fond_caisse_100: parsed.fondCaisse100,
        observations: parsed.observations,
        ...(parsed.clientLat != null && parsed.clientLng != null
          ? { client_lat: parsed.clientLat, client_lng: parsed.clientLng }
          : {}),
        ...(parsed.chronoSeconds != null ? { chrono_seconds: parsed.chronoSeconds } : {}),
        ...(parsed.panneaux != null ? { panneaux: parsed.panneaux } : {}),
        ...(parsed.affaires != null ? { affaires: parsed.affaires } : {}),
      },
      { onConflict: 'site_id,date' },
    )
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Enregistrement opening_form a échoué : ${error.message}` };
  }

  if (chronoOutOfRange && parsed.chronoSeconds != null) {
    const { error: rpcError } = await session.supabase.rpc('report_chrono_out_of_range', {
      p_site_id: parsed.siteId,
      p_date: parsed.date,
      p_chrono_seconds: parsed.chronoSeconds,
    });
    if (rpcError) {
      return {
        ok: false,
        error: `Ouverture enregistrée, mais l'alerte chrono a échoué : ${rpcError.message}`,
      };
    }
  }

  if (parsed.panneaux != null && parsed.affaires != null) {
    const hasPanneauIssue = Object.values(parsed.panneaux).some((v) => v === false);
    const hasAffaireIssue = Object.values(parsed.affaires).some((v) => v.present === false);
    if (hasPanneauIssue || hasAffaireIssue) {
      const { error: rpcError } = await session.supabase.rpc(
        'report_monday_opening_issues_to_bureau',
        {
          p_site_id: parsed.siteId,
          p_date: parsed.date,
          p_payload: {
            panneaux: parsed.panneaux,
            affaires: parsed.affaires,
          },
        },
      );
      if (rpcError) {
        return {
          ok: false,
          error: `Ouverture enregistrée, mais l'alerte manques lundi a échoué : ${rpcError.message}`,
        };
      }
    }
  }

  const feuillesCount = parseFeuillesCount(parsed.feuillesDeJour);
  const lowFeuilles = feuillesCount != null && feuillesCount < 10;
  const lowTickets = parsed.ticketsOuverture < 500;
  if (lowFeuilles || lowTickets) {
    const { error: rpcError } = await session.supabase.rpc('report_opening_low_stock_to_bureau', {
      p_site_id: parsed.siteId,
      p_date: parsed.date,
      p_feuilles_count: feuillesCount,
      p_tickets_ouverture: parsed.ticketsOuverture,
    });
    if (rpcError) {
      return {
        ok: false,
        error: `Ouverture enregistrée, mais l'alerte stock bas a échoué : ${rpcError.message}`,
      };
    }
  }

  return { ok: true, id: data.id };
}

export type ResolvePannesResult = { ok: true } | { ok: false; error: string };

export async function resolvePannesFromOpening(
  siteId: number,
  dateIso: string,
  interventionIds: number[],
): Promise<ResolvePannesResult> {
  if (!Number.isFinite(siteId) || siteId <= 0) return { ok: false, error: 'Site invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, error: 'Date invalide.' };

  const session = await requireEmployeeSession();
  if (!session.ok) return { ok: false, error: session.error };

  if (interventionIds.length === 0) return { ok: true };

  const uniqueIds = [...new Set(interventionIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) return { ok: true };

  const { error } = await session.supabase.rpc('resolve_pannes_from_opening', {
    p_site_id: siteId,
    p_date: dateIso,
    p_intervention_ids: uniqueIds,
  });
  if (error) {
    return { ok: false, error: `Clôture des pannes échouée : ${error.message}` };
  }
  return { ok: true };
}
