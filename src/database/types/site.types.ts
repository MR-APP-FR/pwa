export type SiteStatut = 'actif' | 'ferme' | 'temporaire' | 'automatique';
export type SiteNbTeneur = 1 | 2;

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
  statut: SiteStatut;
  nb_teneur: SiteNbTeneur;
  group_id: number | null;
}
