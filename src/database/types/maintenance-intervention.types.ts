export type MaintenanceInterventionStatus = 'signalee' | 'planifiee' | 'cloturee';

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
  reported_at: string;
  updated_at: string;
}
