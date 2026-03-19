export type UserRole = string | null;

export interface User {
  id: number;
  login: string;
  email: string;
  registered: string;
  fullname: string;
  role: UserRole;
  actif: boolean;
}

export interface UserInfo {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  adresse: string | null;
  telephone: string | null;
  telephone2: string | null;
  email: string | null;
  date_de_naissance: string | null;
  ressenti: string | null;
  permis: boolean;
  voiture: boolean;
  les_transports: string | null;
  part_avec_les_campings: boolean;
  combien_de_temps_en_general: string | null;
  reste_tout_lhiver_sur: string | null;
  religion: string | null;
  chretienne: boolean;
  famille: string | null;
  rsa: string | null;
  declaree: boolean;
  sait_lire: boolean;
  sait_compter: boolean | null;
  sait_ecrire: boolean | null;
  parents_au_courant: boolean;
  metier_des_parents: string | null;
  parents_religieux: string | null;
  peut_aller_sur_les_sites: string | null;
  presente_par: string | null;
  deja_travaille: boolean;
  date_embauche: string | null;
  zone_dattribution: string | null;
  couleur: string | null;
  notification_anniversaire: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserInfoSite {
  id: number;
  user_info_id: number;
  site_id: number;
  created_at: string;
}

export interface UserInfoSiteWithDetails extends UserInfoSite {
  site_name: string;
  statut: string;
  ville: string;
  nb_teneur: number;
}

export interface UserWithInfo extends User {
  user_info: UserInfo;
}

export interface UserInfoWithSites extends UserInfo {
  sites: UserInfoSiteWithDetails[];
}
