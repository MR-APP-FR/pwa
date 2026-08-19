/**
 * Chrome de page — une seule source de vérité pour le logo.
 *
 * - Login : aucun header.
 * - Accueil / profil / première connexion : Header sticky dans AppShell.
 * - Toutes les autres pages (formulaires, planning, boîte à idées, etc.) :
 *   Header défilant rendu par FormScrollLayout. AppShell ne doit PAS en
 *   superposer un, sinon le logo apparaît en double au premier paint.
 */

export const BARE_PATHS = new Set(['/login']);

const SHELL_HEADER_PATHS = new Set(['/', '/profil', '/premiere-connexion']);

export function isBarePath(pathname: string): boolean {
  return BARE_PATHS.has(pathname);
}

export function showsShellHeader(pathname: string): boolean {
  return SHELL_HEADER_PATHS.has(pathname);
}
