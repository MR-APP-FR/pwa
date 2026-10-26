import type { MaintenanceInterventionStatus } from '../../database/types';

export const OPEN_INTERVENTION_STATUSES: MaintenanceInterventionStatus[] = [
  'signalee',
  'planifiee',
  'en_cours',
  'en_pause',
  'en_attente',
];

export const INTERVENTION_STATUS_LABELS: Record<MaintenanceInterventionStatus, string> = {
  signalee: 'À planifier',
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  en_pause: 'En pause',
  en_attente: 'En attente',
  cloturee: 'Terminée',
};

export function normalizeMaintenanceStatus(raw: string): MaintenanceInterventionStatus {
  if (raw === 'planifiee') return 'planifiee';
  if (raw === 'en_cours') return 'en_cours';
  if (raw === 'en_pause') return 'en_pause';
  if (raw === 'en_attente') return 'en_attente';
  if (raw === 'cloturee') return 'cloturee';
  // legacy a_planifier
  return 'signalee';
}

export function isOpenMaintenanceStatus(status: MaintenanceInterventionStatus): boolean {
  return status !== 'cloturee';
}

export function canStart(status: MaintenanceInterventionStatus): boolean {
  return status === 'signalee' || status === 'planifiee' || status === 'en_attente';
}

export function canPause(status: MaintenanceInterventionStatus): boolean {
  return status === 'en_cours';
}

export function canResume(status: MaintenanceInterventionStatus): boolean {
  return status === 'en_pause';
}

export function canComplete(status: MaintenanceInterventionStatus): boolean {
  return status === 'en_cours' || status === 'en_pause' || status === 'planifiee' || status === 'en_attente';
}

export function canHold(status: MaintenanceInterventionStatus): boolean {
  return status === 'en_cours' || status === 'en_pause' || status === 'planifiee';
}

export function canSchedule(status: MaintenanceInterventionStatus): boolean {
  return isOpenMaintenanceStatus(status) && status !== 'en_cours';
}

export const PART_STATUS_LABELS: Record<'a_commander' | 'commande' | 'recu', string> = {
  a_commander: 'À commander',
  commande: 'Commandée',
  recu: 'Reçue',
};

export const EVENT_KIND_LABELS: Record<string, string> = {
  created: 'Créé',
  scheduled: 'Planifié',
  started: 'Démarré',
  paused: 'Pause',
  resumed: 'Repris',
  rescheduled: 'Reporté',
  comment: 'Commentaire',
  media: 'Média',
  part: 'Pièce',
  hold: 'En attente',
  completed: 'Terminé',
  reopened: 'Réouvert',
};

export const MEDIA_BUCKET = 'intervention-media';
