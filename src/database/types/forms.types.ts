/**
 * Types DB des formulaires terrain (alignés sur le schéma admin).
 * Cf. GRE-112 (opening_form), GRE-113 (closing_form), GRE-114 (daily_info).
 */

export type PhotoSource = 'camera_live' | 'phototheque';

/** Lundi ouverture — présence panneaux (true = présent). */
export type OpeningPanneaux = {
  prix: boolean;
  consigne_securite: boolean;
  info: boolean;
  reviens_5mn: boolean;
  en_panne: boolean;
  pause_dej: boolean;
};

export type OpeningAffaireItem = {
  present: boolean;
  reste: number | null;
};

/** Lundi ouverture — stock affaires. */
export type OpeningAffaires = {
  produits_entretien: OpeningAffaireItem;
  fournitures: OpeningAffaireItem;
  rouleaux_cb: OpeningAffaireItem;
};

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
  client_lat: number | null;
  client_lng: number | null;
  chrono_seconds: number | null;
  panneaux: OpeningPanneaux | null;
  affaires: OpeningAffaires | null;
}

export interface OpeningLateAlertRow {
  site_id: number;
  date: string;
  teneur_user_id: number | null;
  push_sent_at: string | null;
  reported_at: string | null;
  report_user_id: number | null;
  report_reason: string | null;
  created_at: string;
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
  checklist: Record<string, boolean>;
  avis_google_count: number;
  photo_parking_url: string | null;
  photo_parking_source: PhotoSource | null;
  photo_parking_captured_at: string | null;
  nettoyage_fait: boolean | null;
  photo_seau_url: string | null;
  photo_seau_source: PhotoSource | null;
  photo_seau_captured_at: string | null;
  nettoyage_raison: string | null;
  force_reason: string | null;
  force_early: boolean;
  force_distance_m: number | null;
  force_geo_failed: boolean;
  force_client_lat: number | null;
  force_client_lng: number | null;
  client_lat: number | null;
  client_lng: number | null;
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
