export interface OpeningFormData {
  missionId: number;
  feuilleDuJour: number | null;
  ticketsOuverture: number | null;
  fondDeCaisse100: boolean;
  observations: string;
}

export interface ClosingFormData {
  missionId: number;
  recetteTotale: number | null;
  carteBleue: number | null;
  nombreEnfants: number | null;
  ticketsOuverture: number | null;
  ticketsFermeture: number | null;
  payeDuJour: number | null;
  payeManquanteRecuperee: number | null;
  payeDuDouble: number | null;
  pointCaisse13h: number | null;
  pointCaisse20h: number | null;
  observations: string;
  telecollectePhotoUri: string | null;
}
