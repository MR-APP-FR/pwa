/** Types DB pour `staff_message` / `staff_message_ack` (GRE vague 1, chantier B5). */

export type StaffMessageSource = 'bureau' | 'appli';

export interface StaffMessageRow {
  id: number;
  titre: string;
  corps: string;
  source: StaffMessageSource;
  require_ack: boolean;
  publie_at: string;
  expire_at: string | null;
  created_at: string;
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

/** Brief météo du jour injecté dans Messages (pas une ligne `staff_message`). */
export const WEATHER_BRIEF_MESSAGE_ID = -1;
