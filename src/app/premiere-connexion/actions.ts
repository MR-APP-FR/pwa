'use server';

/**
 * @deprecated Prefer client `supabase.auth.updateUser` + `mark_password_changed`
 * in `NewPasswordForm` (évite refresh RSC / submit iOS). Kept for reference.
 */
export type ChangePasswordResult = { ok: true } | { ok: false; error: string };
