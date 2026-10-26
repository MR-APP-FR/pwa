export type MaintenanceInterventionStatus =
  | 'signalee'
  | 'planifiee'
  | 'en_cours'
  | 'en_pause'
  | 'en_attente'
  | 'cloturee';

export type InterventionHoldReason = 'pieces' | 'retour' | 'autre';

export type InterventionEventKind =
  | 'created'
  | 'scheduled'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'rescheduled'
  | 'comment'
  | 'media'
  | 'part'
  | 'hold'
  | 'completed'
  | 'reopened';

export type InterventionPartStatus = 'a_commander' | 'commande' | 'recu';

export type InterventionVisitOutcome = 'termine' | 'a_replanifier' | 'attente_pieces';

/** Ticket visible par le tech maintenance (liste PWA). */
export interface MaintenanceIntervention {
  id: number;
  site_id: number;
  site_name: string;
  description: string;
  pannes_autre: string | null;
  sujet_ids: number[];
  sujet_names: string[];
  status: MaintenanceInterventionStatus;
  urgent: boolean;
  assignee_user_id: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
  resolution_notes: string | null;
  hold_reason: InterventionHoldReason | null;
  active_visit_id: number | null;
  reported_at: string;
  updated_at: string;
}

export interface InterventionEvent {
  id: number;
  intervention_id: number;
  visit_id: number | null;
  actor_user_id: number | null;
  kind: InterventionEventKind;
  body: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface InterventionPart {
  id: number;
  intervention_id: number;
  label: string;
  status: InterventionPartStatus;
  ordered_at: string | null;
  received_at: string | null;
  ref: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface InterventionMedia {
  id: number;
  intervention_id: number;
  visit_id: number | null;
  event_id: number | null;
  kind: 'photo' | 'video';
  storage_path: string;
  mime: string | null;
  created_by: number | null;
  created_at: string;
  signed_url?: string | null;
}

export interface InterventionVisit {
  id: number;
  intervention_id: number;
  tech_user_id: number;
  scheduled_date: string | null;
  started_at: string;
  ended_at: string | null;
  outcome: InterventionVisitOutcome | null;
  pause_seconds: number;
  note: string | null;
}

export interface MaintenanceInterventionDetail {
  ticket: MaintenanceIntervention;
  events: InterventionEvent[];
  parts: InterventionPart[];
  media: InterventionMedia[];
  activeVisit: InterventionVisit | null;
}
