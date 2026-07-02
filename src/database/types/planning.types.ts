export interface Planning {
  id: number;
  year: number;
  month: number;
  day: number;
  site_id: number;
  user_id: number;
  double_id: number | null;
  user_confirmed: boolean;
  double_confirmed: boolean | null;
}

export interface PlanningColleague {
  id: number;
  fullname: string;
  first_name: string;
  last_name?: string;
  telephone: string | null;
  couleur: string | null;
}

export interface PlanningSiteDetails {
  adresse: string | null;
  metro: string | null;
  indication: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PlanningWithColleague extends Planning {
  site_name: string;
  site_details: PlanningSiteDetails | null;
  role: 'principal' | 'double';
  colleague: PlanningColleague | null;
}
