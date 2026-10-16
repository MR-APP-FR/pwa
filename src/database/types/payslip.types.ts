/** Fiche de paie PDF — path Storage bucket `payslips`, jamais d'URL publique. */
export interface Payslip {
  id: number;
  user_id: number;
  /** Premier jour du mois (ISO date, ex. `2026-10-01`). */
  period: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}
