'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useThemeColors } from '../../hooks/useThemeColors';
import { ProfileSwitcher } from '../dev/ProfileSwitcher';

export function Header() {
  const { colors } = useThemeColors();

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        backgroundColor: colors.HEADER_BG,
        borderBottom: `1px solid ${colors.BORDER}`,
        paddingTop: 'max(12px, env(safe-area-inset-top))',
      }}
    >
      <div className="relative flex items-center justify-center py-3">
        <Link href="/" className="flex items-center justify-center no-underline">
          <Image src="/logo.png" alt="Manège" width={190} height={57} />
        </Link>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <ProfileSwitcher />
        </div>
      </div>
      <DemoModeBanner />
    </header>
  );
}

function DemoModeBanner() {
  // PRIMARY_LIGHT est partagé via BRAND entre les deux thèmes (#2A2A2A) ;
  // on fixe donc la couleur du texte en blanc pour garantir le contraste
  // en dark mode (où TEXT_INVERSE vaudrait #000000 et rendrait la bannière
  // illisible). Cf. revue Cursor Bugbot sur GRE-87.
  return (
    <div
      className="px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: '#FFFFFF',
        backgroundColor: '#2A2A2A',
      }}
      aria-label="Mode démo, pas d'authentification réelle"
    >
      Mode démo · profil sélectionnable
    </div>
  );
}
