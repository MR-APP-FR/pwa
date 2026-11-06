export type TechPlanningStaffRole = 'teneur' | 'double';

/** Ligne RPC `get_tech_planning_directory` (lecture tech). */
export interface TechPlanningDirectoryRow {
  day: string;
  site_id: number;
  site_name: string;
  group_id: number | null;
  group_name: string;
  closed: boolean;
  staff_role: TechPlanningStaffRole | null;
  user_id: number | null;
  display_name: string | null;
  telephone: string | null;
  couleur: string | null;
}
