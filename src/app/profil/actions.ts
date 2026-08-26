'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

export type UpdatePreferredSitesResult = { ok: true } | { ok: false; error: string };

/**
 * Remplace la liste des sites préférés de l'employé (`user_info_sites`).
 * Audit 2026-08-18 §4.2 : le bouton « Sauvegarder » de la modale
 * « Modifier mes sites » n'écrivait rien — RLS employé posée dans la même
 * migration que cette action (`user_info_sites employee insert/delete own`).
 */
export async function updatePreferredSites(siteIds: number[]): Promise<UpdatePreferredSitesResult> {
  const cleanIds = [...new Set(siteIds)].filter((id) => Number.isFinite(id) && id > 0);

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }
  const { userId, supabase } = session;

  const { data: userInfo, error: userInfoError } = await supabase
    .from('user_info')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (userInfoError) {
    return { ok: false, error: `Lecture profil échouée : ${userInfoError.message}` };
  }
  if (!userInfo) {
    return { ok: false, error: 'Profil incomplet : aucune fiche employé associée.' };
  }

  const { error: deleteError } = await supabase
    .from('user_info_sites')
    .delete()
    .eq('user_info_id', userInfo.id);

  if (deleteError) {
    return { ok: false, error: `Mise à jour des sites échouée : ${deleteError.message}` };
  }

  if (cleanIds.length > 0) {
    const { error: insertError } = await supabase
      .from('user_info_sites')
      .insert(cleanIds.map((siteId) => ({ user_info_id: userInfo.id, site_id: siteId })));

    if (insertError) {
      return { ok: false, error: `Mise à jour des sites échouée : ${insertError.message}` };
    }
  }

  return { ok: true };
}

const STAFF_DOCUMENTS_BUCKET = 'staff-documents';
const MAX_STAFF_MEDIA_BYTES = 4 * 1024 * 1024;
const AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CNI_MIME = new Set([...AVATAR_MIME, 'application/pdf']);

export type StaffMediaKind = 'avatar' | 'cni';

export type UploadStaffMediaResult =
  | { ok: true; path: string; signedUrl: string | null }
  | { ok: false; error: string };

function fileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  const cleaned = fromName.replace(/[^a-z0-9]/g, '');
  if (cleaned) return cleaned;
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Upload CNI ou photo de profil. `user_id` vient de la session, jamais du client.
 * Path `{userId}/{kind}-{ts}.{ext}` dans le bucket privé `staff-documents`.
 */
export async function uploadStaffMedia(formData: FormData): Promise<UploadStaffMediaResult> {
  const kindRaw = formData.get('kind');
  const file = formData.get('file');
  if (kindRaw !== 'avatar' && kindRaw !== 'cni') {
    return { ok: false, error: 'Type de document invalide.' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Fichier manquant.' };
  }
  if (file.size > MAX_STAFF_MEDIA_BYTES) {
    return { ok: false, error: 'Fichier trop lourd (max 4 Mo).' };
  }
  const allowed = kindRaw === 'avatar' ? AVATAR_MIME : CNI_MIME;
  if (file.type && !allowed.has(file.type)) {
    return {
      ok: false,
      error: kindRaw === 'avatar' ? 'Photo : JPEG, PNG ou WebP.' : 'CNI : photo ou PDF.',
    };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }
  const { userId, supabase } = session;

  const ext = fileExtension(file);
  const path = `${userId}/${kindRaw}-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from(STAFF_DOCUMENTS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    upsert: true,
  });
  if (upload.error) {
    return { ok: false, error: `Upload échoué : ${upload.error.message}` };
  }

  const column = kindRaw === 'avatar' ? 'avatar_url' : 'cni_url';
  const { error } = await supabase.from('user_info').update({ [column]: path }).eq('user_id', userId);
  if (error) {
    return { ok: false, error: `Enregistrement échoué : ${error.message}` };
  }

  const { data: signed } = await supabase.storage
    .from(STAFF_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  return { ok: true, path, signedUrl: signed?.signedUrl ?? null };
}

export async function getStaffMediaSignedUrl(path: string): Promise<string | null> {
  const trimmed = path.trim();
  if (!trimmed) return null;

  const session = await requireEmployeeSession();
  if (!session.ok) return null;
  if (!trimmed.startsWith(`${session.userId}/`)) return null;

  const { data, error } = await session.supabase.storage
    .from(STAFF_DOCUMENTS_BUCKET)
    .createSignedUrl(trimmed, 60 * 60);
  if (error) {
    console.error('getStaffMediaSignedUrl:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}
