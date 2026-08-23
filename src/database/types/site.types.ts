export type SiteStatut = 'actif' | 'ferme' | 'temporaire' | 'automatique';

export interface Site {
  id: number;
  name: string;
  slug: string;
  adresse: string | null;
  cp_ville: string | null;
  metro: string | null;
  latitude: number | null;
  longitude: number | null;
  code_postal: string | null;
  ville: string | null;
  indication: string | null;
  statut: SiteStatut | null;
  nb_teneur: number | null;
  group_id: number;
  daily_info_questions?: string[];
  closing_checklist_items?: string[];
}
