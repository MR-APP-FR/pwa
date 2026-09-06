/** Types DB pour `staff_message` / `staff_message_ack` (GRE vague 1, chantier B5). */

export type StaffMessageSource = 'bureau' | 'appli';
export type StaffMessageChannel = 'staff' | 'bureau' | 'ca' | 'inter';

/** 👧🏻 saisi par le bureau · 🤖 automatique (météo, recap CA, pannes). */
export const MESSAGE_SOURCE_ICON: Record<StaffMessageSource, string> = {
  bureau: '👧🏻',
  appli: '🤖',
};

export interface StaffMessageRow {
  id: number;
  titre: string;
  corps: string;
  source: StaffMessageSource;
  /** staff = employés ; bureau / ca / inter = canaux internes CRM, jamais exposés à la PWA. */
  channel: StaffMessageChannel;
  require_ack: boolean;
  publie_at: string;
  expire_at: string | null;
  created_at: string;
  site_ids: number[];
  user_ids: number[];
}

export interface StaffMessageAckRow {
  id: number;
  message_id: number;
  user_id: number;
  read_at: string | null;
  acked_at: string | null;
}

export interface StaffMessageWithAck extends StaffMessageRow {
  read_at: string | null;
  acked_at: string | null;
}

/** Titres des messages automatiques / bureau (badges accueil). */
export const AVAILABILITY_REMINDER_TITLE = 'Disponibilités';
export const PLANNING_ASSIGNED_MESSAGE_TITLE = 'Planning semaine prochaine';
