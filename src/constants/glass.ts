/** Classes CSS du système glass — tokens visuels dans globals.css (:root) */
export const GLASS_CARD = {
  base: 'glass-card',
  solid: 'glass-card--solid',
  subtle: 'glass-card--subtle',
  disabled: 'glass-card--disabled',
  homeAmbientBg: 'home-ambient-bg',
} as const;

export type GlassCardVariant = 'default' | 'solid' | 'subtle';

interface GlassCardClassOptions {
  variant?: GlassCardVariant;
  disabled?: boolean;
}

/** Compose les classes glass-card avec variantes optionnelles */
export function glassCardClass({ variant = 'default', disabled }: GlassCardClassOptions = {}) {
  const classes: string[] = [GLASS_CARD.base];

  if (variant === 'solid') classes.push(GLASS_CARD.solid);
  if (variant === 'subtle') classes.push(GLASS_CARD.subtle);
  if (disabled) classes.push(GLASS_CARD.disabled);

  return classes.join(' ');
}
