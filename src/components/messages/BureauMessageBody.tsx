'use client';

import type { ReactNode } from 'react';

type ParsedLine =
  | { kind: 'field'; emoji: string; label: string; value: string }
  | { kind: 'headline'; emoji: string; text: string; size?: 'sm' | 'md' | 'body' }
  | { kind: 'text'; text: string }
  | { kind: 'bullet'; text: string };

// Inclure \uFE0F dans le groupe : ⚠ seul = texte ; ⚠️ = emoji (VS16).
const EMOJI_PREFIX =
  /^((\p{Extended_Pictographic}|\p{Emoji_Presentation})\uFE0F?)/u;

const FIELD_RE =
  /^((\p{Extended_Pictographic}|\p{Emoji_Presentation})\uFE0F?)\s+(.+?)\s*:\s*(.*)$/u;

const HEADLINE_RE =
  /^((\p{Extended_Pictographic}|\p{Emoji_Presentation})\uFE0F?)\s+(.*)$/u;

const BULLET_RE = /^(?:\u25AA\uFE0F?|\u25FE\uFE0F?|[•\-])\s+(.*)$/u;

const HEADLINE_SIZE: Record<'sm' | 'md' | 'body', string> = {
  sm: 'text-[12px]',
  md: 'text-[13px]',
  body: 'text-[15px]',
};

const GRID_COLS =
  'grid grid-cols-[1.25rem_max-content_0.75rem_minmax(0,1fr)] gap-x-1.5 gap-y-0.5';

function isAttenduField(label: string): boolean {
  return label.trim().toLowerCase() === 'attendu';
}

function parseEmojiLine(raw: string): ParsedLine | null {
  const line = raw.replace(/\u00a0/g, ' ').trim();
  if (!line) return { kind: 'text', text: '' };

  const bullet = line.match(BULLET_RE);
  if (bullet) return { kind: 'bullet', text: bullet[1] ?? '' };

  const field = line.match(FIELD_RE);
  if (field) {
    const emoji = field[1] ?? '';
    const label = (field[2] ?? '').replace(/\s+/g, ' ').trim();
    const value = (field[3] ?? '').replace(/^\s+/, '');
    if (isAttenduField(label)) return null;
    return { kind: 'field', emoji, label, value };
  }

  const headline = line.match(HEADLINE_RE);
  if (headline) {
    return { kind: 'headline', emoji: headline[1] ?? '', text: (headline[2] ?? '').trim() };
  }

  return { kind: 'text', text: line };
}

function parseBureauMessageBody(corps: string): ParsedLine[] {
  const lines = corps.replace(/\r\n/g, '\n').split('\n');
  const out: ParsedLine[] = [];

  for (const raw of lines) {
    const parsed = parseEmojiLine(raw.trimEnd());
    if (parsed) out.push(parsed);
  }

  while (out.length > 0) {
    const last = out[out.length - 1];
    if (!last || last.kind !== 'text' || last.text !== '') break;
    out.pop();
  }
  return out;
}

function renderLines(
  lines: ParsedLine[],
  textColor: string,
  senderColor?: string
): ReactNode[] {
  const nodes: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.kind === 'text') {
      if (!line.text) {
        nodes.push(<div key={`sp-${i}`} className="col-span-4 h-1.5" />);
      } else {
        nodes.push(
          <p key={`t-${i}`} className="col-span-4 font-semibold" style={{ color: textColor }}>
            {line.text}
          </p>
        );
      }
      continue;
    }
    if (line.kind === 'headline') {
      const sizeClass = HEADLINE_SIZE[line.size ?? 'body'];
      const color = line.size === 'sm' && senderColor ? senderColor : textColor;
      nodes.push(
        <span key={`he-${i}`} aria-hidden className={`text-center leading-none ${sizeClass}`}>
          {line.emoji}
        </span>,
        <span
          key={`ht-${i}`}
          className={`col-span-3 min-w-0 break-words font-semibold ${sizeClass}`}
          style={{ color }}
        >
          {line.text}
        </span>
      );
      continue;
    }
    if (line.kind === 'bullet') {
      nodes.push(
        <span key={`be-${i}`} aria-hidden className="text-center leading-none">
          ▪️
        </span>,
        <span key={`bv-${i}`} className="col-span-3 min-w-0 break-words" style={{ color: textColor }}>
          {line.text}
        </span>
      );
      continue;
    }
    nodes.push(
      <span key={`fe-${i}`} aria-hidden className="text-center leading-none">
        {line.emoji}
      </span>,
      <span key={`fl-${i}`} className="whitespace-nowrap" style={{ color: textColor }}>
        {line.label}
      </span>,
      <span key={`fc-${i}`} className="text-center" style={{ color: textColor }}>
        :
      </span>,
      <span key={`fv-${i}`} className="min-w-0 break-words" style={{ color: textColor }}>
        {line.value || '\u00a0'}
      </span>
    );
  }
  return nodes;
}

/** Corps auto Bureau : grille emoji | label | : | valeur (alignement PWA = CRM). */
export function BureauMessageBody({
  corps,
  titre,
  senderEmoji,
  senderLabel,
  senderColor,
  textColor,
}: {
  corps: string;
  titre?: string | null;
  senderEmoji?: string;
  senderLabel?: string;
  senderColor?: string;
  textColor: string;
}) {
  const bodyLines = parseBureauMessageBody(corps);
  const prefix: ParsedLine[] = [];

  if (senderEmoji && senderLabel) {
    prefix.push({ kind: 'headline', emoji: senderEmoji, text: senderLabel, size: 'sm' });
  }

  if (titre && titre !== corps) {
    const parsedTitre = parseEmojiLine(titre);
    if (parsedTitre) {
      if (parsedTitre.kind === 'field') {
        prefix.push({
          kind: 'headline',
          emoji: parsedTitre.emoji,
          text: `${parsedTitre.label} : ${parsedTitre.value}`.trim(),
          size: 'md',
        });
      } else if (parsedTitre.kind === 'headline') {
        prefix.push({ ...parsedTitre, size: 'md' });
      } else if (parsedTitre.kind === 'text' && parsedTitre.text) {
        const m = titre.trim().match(EMOJI_PREFIX);
        if (m) {
          prefix.push({
            kind: 'headline',
            emoji: m[1] ?? '',
            text: titre.trim().slice(m[0].length).trim(),
            size: 'md',
          });
        } else {
          prefix.push({ kind: 'headline', emoji: '', text: parsedTitre.text, size: 'md' });
        }
      }
    }
  }

  const lines = [...prefix, ...bodyLines];
  const useGrid =
    Boolean(senderEmoji && senderLabel) ||
    lines.some((l) => l.kind === 'field' || l.kind === 'headline' || l.kind === 'bullet');

  if (!useGrid) {
    return (
      <p className="whitespace-pre-wrap text-[15px] leading-snug" style={{ color: textColor }}>
        {corps}
      </p>
    );
  }

  return (
    <div className={`${GRID_COLS} text-[15px] leading-snug`} style={{ color: textColor }}>
      {renderLines(lines, textColor, senderColor)}
    </div>
  );
}
