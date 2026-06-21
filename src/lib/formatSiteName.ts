/** Affichage mobile : « BOIS DE VINCENNES » → « BDV » (ex. BDV CARRÉ, BDV ROND). */
export function formatSiteName(name: string): string {
  if (!name) return name;

  return name.replace(/^BOIS\s+(?:DE\s+)?VINCENNES\b/i, 'BDV');
}
