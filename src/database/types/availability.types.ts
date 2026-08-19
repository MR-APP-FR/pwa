/** `public.availability` — audit 2026-08-19 (Lot 5) : table jusqu'ici non typée côté PWA. */
export interface AvailabilityRow {
  id: number;
  user_id: number;
  date: string;
  available: boolean;
  note: string | null;
  submitted_at: string;
  dispo_derniere_minute: boolean | null;
  dispo_derniere_minute_at: string | null;
}
