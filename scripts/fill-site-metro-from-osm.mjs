#!/usr/bin/env node
/**
 * Remplit `site.metro` depuis OpenStreetMap (Overpass) — métro / RER / train proches.
 *
 * One-shot / local : dry-run par défaut ; écritures uniquement avec `--apply`.
 * Ne jamais écraser un `metro` déjà renseigné (chaîne non vide).
 *
 * Prérequis :
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL (optionnel, défaut projet Ravoire)
 *
 * Usage :
 *   node scripts/fill-site-metro-from-osm.mjs
 *   node scripts/fill-site-metro-from-osm.mjs --ids=38,20
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/fill-site-metro-from-osm.mjs --apply
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/fill-site-metro-from-osm.mjs --apply --ids=38,20
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ooirydwzxltdtvlyhqar.supabase.co'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dryRun = !apply
const limitArg = args.find((a) => a.startsWith('--limit='))
const idsArg = args.find((a) => a.startsWith('--ids='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null
const onlyIds = idsArg
  ? idsArg
      .split('=')[1]
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  : null

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const SEARCH_RADIUS_M = 2500
const SLEEP_MS = 1500
const USER_AGENT = 'ravoire-fill-site-metro/1.1 (one-shot; contact: ops)'

if (!serviceKey) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY manquant.\n' +
      '  export depuis .env PWA ou dashboard Supabase',
  )
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Métro / RER / train uniquement (pas de bus). */
function buildOverpassQuery(lat, lng, radiusM) {
  return `
[out:json][timeout:30];
(
  node(around:${radiusM},${lat},${lng})[railway=station];
  node(around:${radiusM},${lat},${lng})[railway=halt];
  node(around:${radiusM},${lat},${lng})[station=subway];
  node(around:${radiusM},${lat},${lng})[public_transport=station][railway];
  way(around:${radiusM},${lat},${lng})[railway=station];
  way(around:${radiusM},${lat},${lng})[public_transport=station][railway];
  relation(around:${radiusM},${lat},${lng})[railway=station];
);
out center tags;
`.trim()
}

function elementCoords(el) {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') {
    return { lat: el.lat, lng: el.lon }
  }
  if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') {
    return { lat: el.center.lat, lng: el.center.lon }
  }
  return null
}

function isRailPreferable(tags) {
  if (!tags) return false
  const network = String(tags.network || '').toLowerCase()
  const subway = tags.station === 'subway' || tags.subway === 'yes'
  const rer = /\brer\b/i.test(network) || /\brer\b/i.test(String(tags.name || ''))
  const metro = /\bmetro\b/i.test(network) || subway
  return metro || rer || tags.railway === 'station' || tags.railway === 'halt'
}

function formatMetroLabel(tags, lineHint) {
  if (!tags || typeof tags !== 'object') return null
  const name = String(tags.name || tags['name:fr'] || tags.ref || '').trim()
  if (!name) return null
  // Filtre parkings / PR souvent mal taggés près des centres commerciaux
  if (/^parc\s+pr\b/i.test(name) || /\bparking\b/i.test(name)) return null

  const network = String(tags.network || '').trim()
  const line = String(
    lineHint || tags.line || tags.route_ref || tags.ref || '',
  ).trim()

  let suffix = ''
  if (/\brer\b/i.test(network) || /\brer\b/i.test(name) || tags['type:RATP'] === 'rer') {
    const letter =
      (line.match(/^[A-E]$/i) ? line.toUpperCase() : null) ||
      (network.match(/RER\s*([A-Z])/i) || [])[1] ||
      (line.match(/RER\s*([A-Z])/i) || [])[1] ||
      ''
    suffix = letter ? `RER ${letter}` : line ? `RER ${line}` : 'RER'
  } else if (tags.station === 'subway' || tags.subway === 'yes' || /\bmetro\b/i.test(network)) {
    const num = (line.match(/\d+/) || [])[0] || line
    suffix = num ? `Métro ${num}` : 'Métro'
  } else if (line) {
    suffix = line
  }

  const label =
    suffix && !name.toLowerCase().includes(suffix.toLowerCase())
      ? `${name} (${suffix})`
      : name
  return label.length > 80 ? label.slice(0, 80) : label
}

async function fetchNearbyLineRefs(lat, lng, preferSubway) {
  const query = `
[out:json][timeout:20];
(
  relation(around:400,${lat},${lng})[type=route][route=subway];
  relation(around:400,${lat},${lng})[type=route][route=train];
  relation(around:400,${lat},${lng})[type=route][route=light_rail];
);
out tags;
`.trim()

  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (!res.ok) continue
      const json = await res.json()
      const elements = Array.isArray(json.elements) ? json.elements : []
      const subway = []
      const rer = []
      for (const el of elements) {
        const tags = el.tags || {}
        const ref = String(tags.ref || tags.route_ref || '').trim()
        if (!ref) continue
        const network = String(tags.network || '').toLowerCase()
        const route = String(tags.route || '').toLowerCase()
        if (route === 'subway' || /\bmetro\b/.test(network)) subway.push(ref)
        else if (/\brer\b/.test(network) || route === 'train') rer.push(ref)
      }
      if (preferSubway && subway.length) return subway[0]
      if (rer.length) return rer[0]
      if (subway.length) return subway[0]
      return null
    } catch {
      // try next endpoint
    }
  }
  return null
}

/** Score plus bas = meilleur (métro/RER d’abord, puis distance). */
function rankCandidate(tags, dist) {
  const network = String(tags?.network || '').toLowerCase()
  const name = String(tags?.name || '').toLowerCase()
  let tier = 3
  if (tags?.station === 'subway' || tags?.subway === 'yes' || /\bmetro\b/.test(network))
    tier = 0
  else if (/\brer\b/.test(network) || /\brer\b/.test(name) || tags?.['type:RATP'] === 'rer')
    tier = 0
  else if (tags?.railway === 'station') tier = 1
  else if (tags?.railway === 'halt') tier = 2
  return tier * 100000 + dist
}

async function fetchNearestStop(lat, lng) {
  const query = buildOverpassQuery(lat, lng, SEARCH_RADIUS_M)
  let lastErr = null
  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Overpass HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`)
      }
      const json = await res.json()
      const elements = Array.isArray(json.elements) ? json.elements : []

      let best = null
      for (const el of elements) {
        const coords = elementCoords(el)
        if (!coords) continue
        if (!isRailPreferable(el.tags)) continue
        const provisional = formatMetroLabel(el.tags)
        if (!provisional) continue
        const dist = haversineMeters(lat, lng, coords.lat, coords.lng)
        if (dist > SEARCH_RADIUS_M) continue
        const rank = rankCandidate(el.tags, dist)
        if (!best || rank < best.rank) {
          best = { tags: el.tags, dist, rank, coords }
        }
      }
      if (!best) return null

      const preferSubway =
        best.tags?.station === 'subway' ||
        best.tags?.subway === 'yes' ||
        /\bmetro\b/i.test(String(best.tags?.network || ''))
      let lineHint = String(best.tags?.line || best.tags?.route_ref || '').trim() || null
      const needsLine =
        !lineHint ||
        (preferSubway && !/\d/.test(lineHint)) ||
        (/\brer\b/i.test(String(best.tags?.network || '')) && !/[A-E]/i.test(lineHint))
      if (needsLine) {
        const fromRoute = await fetchNearbyLineRefs(best.coords.lat, best.coords.lng, preferSubway)
        if (fromRoute) lineHint = fromRoute
      }

      const label = formatMetroLabel(best.tags, lineHint)
      if (!label) return null
      return { label, dist: best.dist, tags: best.tags }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('Overpass indisponible')
}

async function listSitesMissingMetro() {
  let q = admin
    .from('site')
    .select('id, name, metro, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('id')

  if (onlyIds?.length) {
    q = q.in('id', onlyIds)
  }

  const { data, error } = await q
  if (error) throw new Error(`Lecture public.site : ${error.message}`)

  return (data ?? []).filter((s) => {
    if (onlyIds?.length) return true
    const metro = typeof s.metro === 'string' ? s.metro.trim() : s.metro
    return metro == null || metro === ''
  })
}

async function updateSiteMetro(siteId, metro) {
  const { data: row, error: readErr } = await admin
    .from('site')
    .select('metro')
    .eq('id', siteId)
    .maybeSingle()
  if (readErr) throw new Error(`Relecture site ${siteId} : ${readErr.message}`)

  const current = typeof row?.metro === 'string' ? row.metro.trim() : row?.metro
  if (current != null && current !== '' && !onlyIds?.length) {
    console.warn(`  ! site ${siteId} déjà rempli (« ${current} ») — skip`)
    return false
  }

  const { error } = await admin.from('site').update({ metro }).eq('id', siteId)
  if (error) throw new Error(`Update site ${siteId} : ${error.message}`)
  return true
}

function pad(str, n) {
  const s = String(str ?? '')
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

async function main() {
  let sites = await listSitesMissingMetro()
  if (limit != null && Number.isFinite(limit) && limit > 0) {
    sites = sites.slice(0, limit)
  }

  console.log(
    `Sites (métro/RER ≤ ${SEARCH_RADIUS_M} m) : ${sites.length}` +
      `${dryRun ? ' (dry-run — passe --apply pour écrire)' : ' (--apply)'}`,
  )
  console.log(`${pad('id', 6)} ${pad('name', 28)} ${pad('dist_m', 8)} metro`)
  console.log('-'.repeat(80))

  let updated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]
    const lat = Number(site.latitude)
    const lng = Number(site.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.log(`${pad(site.id, 6)} ${pad(site.name, 28)} ${pad('-', 8)} (coords invalides)`)
      skipped += 1
      continue
    }

    try {
      const nearest = await fetchNearestStop(lat, lng)
      if (!nearest) {
        console.log(
          `${pad(site.id, 6)} ${pad(site.name, 28)} ${pad('-', 8)} (aucun métro/RER ≤ ${SEARCH_RADIUS_M} m)`,
        )
        skipped += 1
      } else {
        const dist = Math.round(nearest.dist)
        console.log(`${pad(site.id, 6)} ${pad(site.name, 28)} ${pad(dist, 8)} ${nearest.label}`)
        if (apply) {
          const wrote = await updateSiteMetro(site.id, nearest.label)
          if (wrote) updated += 1
          else skipped += 1
        }
      }
    } catch (err) {
      failed += 1
      console.error(`${pad(site.id, 6)} ${pad(site.name, 28)} ${pad('ERR', 8)} ${err.message}`)
    }

    if (i < sites.length - 1) await sleep(SLEEP_MS)
  }

  console.log('-'.repeat(80))
  console.log(
    dryRun
      ? `Dry-run terminé — ${sites.length} site(s), ${skipped} sans arrêt, ${failed} erreur(s).`
      : `Apply terminé — ${updated} mis à jour, ${skipped} skip, ${failed} erreur(s).`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
