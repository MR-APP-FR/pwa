'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import { PageHeader } from '../../../components/layout/PageHeader';
import { PageSectionTitle } from '../../../components/layout/PageSectionTitle';
import { FormScrollLayout } from '../../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../../components/layout/FormPinnedPageHeader';
import { TRAINING_THEMES, type TrainingThemeId } from '../../../constants/trainingThemes';
import trainingContent from '../../../constants/trainingContent.json';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useTranslation } from '../../../hooks/useTranslation';
import { RADIUS } from '../../../constants/design';

interface ContentSubItem {
  type?: 'point' | 'warning' | 'text';
  number?: number;
  text: string;
  subItems?: string[];
}

interface ContentSection {
  heading?: string;
  items: ContentSubItem[];
}

interface ThemeContent {
  title: string;
  sections: ContentSection[];
}

const TRAINING_CONTENT = trainingContent as Record<string, ThemeContent>;

export default function TrainingThemeDetailPage() {
  const params = useParams<{ themeId: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const themeId = params.themeId as TrainingThemeId;
  const theme = TRAINING_THEMES.find((th) => th.id === themeId);
  const content = TRAINING_CONTENT[themeId];

  if (!theme || !content) {
    notFound();
  }

  return (
    <FormScrollLayout>
      <div className="flex flex-1 flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="gray"
            title={t('screens.training.title')}
            showBack
            onBack={() => router.push('/training')}
          />
        </FormPinnedPageHeader>
        <PageSectionTitle title={t(theme.labelKey)} />

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3">
        <div
          className="mb-4 flex items-center justify-center gap-3 p-4 text-center"
          style={{
            backgroundColor: colors.BG_TERTIARY,
            borderRadius: RADIUS.md,
            border: `1px dashed ${colors.BORDER}`,
          }}
        >
          <span
            aria-hidden
            className="text-[2rem] leading-none"
            style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif' }}
          >
            {theme.emoji}
          </span>
          <p className="text-[13px] leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.training.videoComingSoon')}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {content.sections.map((section, sectionIndex) => (
            <div
              key={sectionIndex}
              className="p-4"
              style={{
                backgroundColor: colors.SETTINGS_SECTION_BG,
                borderRadius: RADIUS.md,
                boxShadow: colors.CARD_SHADOW,
                border: `1px solid ${colors.BORDER}`,
              }}
            >
              {section.heading && (
                <p
                  className="mb-3 text-[13px] font-bold uppercase tracking-wide"
                  style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
                >
                  {section.heading}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {section.items.map((item, itemIndex) => {
                  if (item.type === 'warning') {
                    return (
                      <div
                        key={itemIndex}
                        className="flex gap-2 p-3"
                        style={{
                          backgroundColor: colors.ACCENT_YELLOW_MUTED,
                          borderRadius: RADIUS.sm,
                        }}
                      >
                        <span aria-hidden className="shrink-0 text-[15px] leading-tight">
                          ⚠️
                        </span>
                        <p
                          className="text-[14px] leading-relaxed"
                          style={{ color: colors.TEXT_PRIMARY }}
                        >
                          {item.text}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div key={itemIndex} className="flex gap-2">
                      {item.number && (
                        <span
                          className="shrink-0 text-[14px] font-bold"
                          style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
                        >
                          {item.number}.
                        </span>
                      )}
                      <div className="flex flex-1 flex-col gap-1.5">
                        <p
                          className="text-[14px] leading-relaxed"
                          style={{ color: colors.TEXT_PRIMARY }}
                        >
                          {item.text}
                        </p>
                        {item.subItems && item.subItems.length > 0 && (
                          <ul className="flex flex-col gap-1 pl-4">
                            {item.subItems.map((sub, subIndex) => (
                              <li
                                key={subIndex}
                                className="list-disc text-[13px] leading-relaxed"
                                style={{ color: colors.TEXT_SECONDARY }}
                              >
                                {sub}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </FormScrollLayout>
  );
}
