import type { Site } from '../types';
import type { Groupe } from '../types';

export const MOCK_GROUPES: Groupe[] = [
  { id: 1, name: 'Paris Intra Muros' },
  { id: 2, name: 'Paris Nord' },
  { id: 3, name: 'Paris Sud' },
  { id: 4, name: 'Province' },
];

export const MOCK_SITES: Site[] = [
  { id: 13, name: 'VELIZY 2', slug: 'velizy-2', adresse: 'Centre Commercial Velizy 2 78140 Vélizy-Villacoublay', cp_ville: '78140 Vélizy-Villacoublay', metro: '', latitude: 48.781184, longitude: 2.220598, code_postal: '78140', ville: 'Vélizy-Villacoublay', indication: 'Centre Commercial Vélizy 2', statut: 'actif', nb_teneur: 2, group_id: 3 },
  { id: 14, name: 'ULIS 2', slug: 'ulis', adresse: "2 Rue d'Aubrac 91940 Les Ulis", cp_ville: '91940 Les Ulis', metro: '', latitude: 48.677394, longitude: 2.173088, code_postal: '91940', ville: 'Les Ulis', indication: '', statut: 'actif', nb_teneur: 1, group_id: 3 },
  { id: 17, name: 'NICE ETOILE', slug: 'nice-etoile', adresse: '30 Avenue Jean Médecin 06000 Nice', cp_ville: '06000 Nice', metro: '', latitude: 43.701426, longitude: 7.267601, code_postal: '06000', ville: 'Nice', indication: '', statut: 'actif', nb_teneur: 1, group_id: 4 },
  { id: 19, name: 'SACRE COEUR', slug: 'sacre-coeur', adresse: '6 Place Saint-Pierre 75018 Paris', cp_ville: '75018 Paris', metro: 'Métro Anvers', latitude: 48.884483, longitude: 2.343876, code_postal: '75018', ville: 'Paris', indication: 'Square Louise Michel', statut: 'actif', nb_teneur: 2, group_id: 1 },
  { id: 24, name: 'SCEAUX', slug: 'parc-de-sceaux', adresse: '70 Rue Houdan 92330 Sceaux', cp_ville: '92330 Sceaux', metro: 'RER B Sceaux', latitude: 48.777357, longitude: 2.295464, code_postal: '92330', ville: 'Sceaux', indication: 'Jardin de la ménagerie', statut: 'actif', nb_teneur: 1, group_id: 1 },
  { id: 26, name: 'VACHE NOIRE', slug: 'la-vache-noire', adresse: 'Place de la Vache Noire 94110 Arcueil', cp_ville: '94110 Arcueil', metro: 'Métro Barbara', latitude: 48.810713, longitude: 2.327057, code_postal: '94110', ville: 'Arcueil', indication: 'Place de la Vache Noire 2e étage', statut: 'actif', nb_teneur: 1, group_id: 1 },
  { id: 28, name: 'EVRY 2', slug: 'evry', adresse: "2 Boulevard de l'Europe 91000 Évry-Courcouronnes", cp_ville: '91000 Évry-Courcouronnes', metro: '', latitude: 48.630773, longitude: 2.427141, code_postal: '91000', ville: 'Évry-Courcouronnes', indication: '', statut: 'actif', nb_teneur: 1, group_id: 3 },
  { id: 33, name: 'BON MARCHE', slug: 'bon-marche', adresse: 'Rue de Babylone 75007 Paris', cp_ville: '75007 Paris', metro: 'Métro Sevres Babylone', latitude: 48.851637, longitude: 2.320614, code_postal: '75007', ville: 'Paris', indication: 'Square Boucicaut', statut: 'actif', nb_teneur: 1, group_id: 1 },
  { id: 34, name: 'BOIS VINCENNES ROND', slug: 'bois-de-vincennes-rond', adresse: 'Avenue du Bel Air 75012 Paris', cp_ville: '75012 Paris', metro: 'Métro Saint-Mandé', latitude: 48.846513, longitude: 2.397496, code_postal: '75012', ville: 'Paris', indication: '', statut: 'actif', nb_teneur: 1, group_id: 1 },
  { id: 35, name: 'BOIS DE VINCENNES CARRÉ', slug: 'bois-de-vincennes-carre', adresse: 'Avenue du Bel Air 75012 Paris', cp_ville: '75012 Paris', metro: 'Métro Saint-Mandé', latitude: 48.846513, longitude: 2.397496, code_postal: '75012', ville: 'Paris', indication: '', statut: 'actif', nb_teneur: 1, group_id: 1 },
  { id: 36, name: 'BELLE EPINE', slug: 'belle-epine', adresse: 'Contour Cial Regional Belle Epine 94320 Thiais', cp_ville: '94320 Thiais', metro: '', latitude: 48.756329, longitude: 2.371236, code_postal: '94320', ville: 'Thiais', indication: '', statut: 'actif', nb_teneur: 2, group_id: 3 },
  { id: 194, name: 'CLAYE-SOUILLY', slug: 'centre-commercial-claye-souilly', adresse: 'Allée Rn3 Bois Fleuri 77410 Claye-Souilly', cp_ville: '77410 Claye-Souilly', metro: '', latitude: 48.940171, longitude: 2.644982, code_postal: '77410', ville: 'Claye-Souilly', indication: '', statut: 'actif', nb_teneur: 1, group_id: 2 },
];
