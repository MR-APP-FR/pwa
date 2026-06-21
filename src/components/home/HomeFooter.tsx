'use client';

import Image from 'next/image';

export function HomeFooter() {
  return (
    <footer className="mt-auto flex items-center justify-center px-6 pb-6 pt-4">
      <Image
        src="/ravoire-logo.svg"
        alt="Ravoire"
        width={120}
        height={48}
        className="h-12 w-auto opacity-90"
      />
    </footer>
  );
}
