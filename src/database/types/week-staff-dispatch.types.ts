export interface WeekStaffDispatchRow {
  week_start: string;
  availability_reminded_at: string | null;
  planning_sent_at: string | null;
  planning_assigned_message_id: number | null;
  planning_not_selected_message_id: number | null;
  sent_by: string | null;
  created_at: string;
  updated_at: string;
}
