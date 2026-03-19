'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useThemeColors } from '../../hooks/useThemeColors';

export function Header() {
  const { colors } = useThemeColors();

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-center py-3"
      style={{
        backgroundColor: colors.HEADER_BG,
        borderBottom: `1px solid ${colors.BORDER}`,
        paddingTop: 'max(12px, env(safe-area-inset-top))',
      }}
    >
      <Link href="/" className="flex items-center justify-center no-underline">
        <Image src="/logo.png" alt="Manège" width={190} height={57} />
      </Link>
    </header>
  );
}
