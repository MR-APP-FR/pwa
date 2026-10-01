export interface PlanningWeekAckRow {
  week_start: string;
  user_id: number;
  status: 'pending' | 'validated';
  assignment_fingerprint: string;
  notified_at: string | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
}
