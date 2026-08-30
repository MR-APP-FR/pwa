# Carte des sites

## Métier

Vue carte de tous les manèges (points de vente) pour se repérer — complément au planning.

## Écran

- Route : `/sites-map`
- Page : [page.tsx](page.tsx)
- Composant : [../../components/sites/SitesMapView.tsx](../../components/sites/SitesMapView.tsx)

## Technique

| Élément | Détail |
|---|---|
| API | Google Maps JS — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Données | `site` (lat/long), `groupe` |
| RLS | SELECT authentifié |

Liens « Y aller » : `maps.google.com/?q=`.

## Transverse

- CRM : [SitesMap](../../../admin-desktop-app/components/crm/sites/ui/SitesMap.tsx) même clé API.

## Ne pas casser

- Sites sans GPS : exclure ou état vide explicite (pas d’erreur Maps silencieuse).
- Charger le script Maps une seule fois (pattern `SitesMapView`).
