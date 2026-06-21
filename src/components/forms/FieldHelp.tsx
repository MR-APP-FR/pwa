'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface FieldHelpProps {
  text: string;
}

export function FieldHelp({ text }: FieldHelpProps) {
  const { colors } = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Aide"
        aria-expanded={open}
        className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 transition-transform active:scale-95"
        style={{ color: colors.TEXT_MUTED }}
      >
        <Info size={14} strokeWidth={2.25} />
      </button>
      {open && (
        <p
          className="mt-1.5 rounded-lg px-2.5 py-2 text-xs leading-relaxed"
          style={{
            color: colors.TEXT_SECONDARY,
            backgroundColor: colors.PRIMARY_MUTED,
          }}
        >
          {text}
        </p>
      )}
    </span>
  );
}
