export type OpenInterventionStatus = 'signalee' | 'planifiee';

export type PanneCheckinAnswer = 'still' | 'resolved';

/** Ticket intervention ouvert retourné par list_open_site_interventions. */
export interface OpenSiteIntervention {
  id: number;
  description: string;
  pannes_autre: string | null;
  sujet_ids: number[];
  sujet_names: string[];
  status: OpenInterventionStatus;
  reported_at: string;
  urgent: boolean;
  scheduled_at: string | null;
}
