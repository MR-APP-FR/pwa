/**
 * Types DB des formulaires terrain (alignés sur le schéma admin).
 * Cf. GRE-112 (opening_form), GRE-113 (closing_form), GRE-114 (daily_info).
 */

export type PhotoSource = 'camera_live' | 'phototheque';

export interface OpeningFormRow {
  id: number;
  site_id: number;
  user_id: number;
  date: string;
  feuilles_de_jour: string;
  tickets_ouverture: number;
  fond_caisse_100: boolean;
  observations: string | null;
  submitted_at: string;
}

export interface ClosingFormRow {
  id: number;
  site_id: number;
  user_id: number;
  partner_user_id: number | null;
  date: string;
  recette_totale: string;
  carte_bleue: string | null;
  nb_enfants: number | null;
  tickets_ouverture: number | null;
  tickets_fermeture: number | null;
  paye_jour: string | null;
  paye_manquante_recuperee: string | null;
  paye_double: string | null;
  point_caisse_13_14: string | null;
  point_caisse_20_2035: string | null;
  observations: string | null;
  photo_url: string;
  photo_source: PhotoSource;
  photo_captured_at: string | null;
  submitted_at: string;
}

export interface DailyInfoRow {
  id: number;
  site_id: number;
  user_id: number;
  date: string;
  nettoyage_veille: boolean | null;
  photo_nettoyage_url: string | null;
  photo_source: PhotoSource | null;
  photo_captured_at: string | null;
  pannes: string | null;
  pannes_sujet_ids: number[];
  pannes_autre: string | null;
  carte_parking: boolean | null;
  musique_disney: boolean | null;
  submitted_at: string;
}
