'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAdminViewStatus } from '../../lib/auth/adminViewActions';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { isBarePath } from '../layout/pageChrome';

/** Bandeau : rappel vue admin CRM + lien profil (switcher). z-index haut pour rester cliquable. */
export function AdminViewBanner() {
  const pathname = usePathname();
  const { data: currentUser } = useCurrentUser();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    void getAdminViewStatus().then((s) => {
      setAdminEmail(s.active ? s.adminEmail : null);
    });
  }, [pathname]);

  if (isBarePath(pathname) || !adminEmail) return null;

  const asLabel = currentUser?.user?.fullname || currentUser?.user?.login || null;

  return (
    <div
      className="relative z-50 flex items-center justify-center gap-1 px-4 py-2.5 text-center text-[11px] font-medium"
      style={{ backgroundColor: '#0d6e6e', color: '#fff' }}
    >
      <span>
        Vue admin
        {asLabel ? ` · ${asLabel}` : ' · choisis un employé'}
        {' · '}
      </span>
      <Link
        href="/profil"
        className="underline underline-offset-2 active:opacity-80"
        style={{ padding: '4px 6px' }}
      >
        changer
      </Link>
    </div>
  );
}
