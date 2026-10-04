-- Rattrapage 30 j : messages auto → modèle WhatsApp (titre ⚠️ + lignes Label : valeur).

CREATE OR REPLACE FUNCTION public._bf_field(p_corps text, p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    btrim(
      (regexp_match(
        COALESCE(p_corps, ''),
        '(?:^|' || chr(10) || ')(?:[^\n]*?)?'
          || p_label
          || '\s*:\s*([^\n]+)',
        'i'
      ))[1]
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public._bf_line(
  p_emoji text,
  p_label text,
  p_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(COALESCE(p_value, '')), '') IS NULL THEN NULL
    ELSE p_emoji || ' ' || p_label || ' : ' || btrim(p_value)
  END;
$$;

CREATE OR REPLACE FUNCTION public._bf_join(VARIADIC p_parts text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_agg(part, chr(10) ORDER BY ord)
  FROM unnest(p_parts) WITH ORDINALITY AS t(part, ord)
  WHERE part IS NOT NULL AND btrim(part) <> '';
$$;

DO $$
DECLARE
  r record;
  site_v text;
  teneur_v text;
  date_v text;
  raison_v text;
  tickets_v text;
  feuilles_v text;
  heure_v text;
  sujet_v text;
  desc_v text;
  ticket_v text;
  signal_v text;
  status_v text;
  urgent_v text;
  resolved_v text;
  constate_v text;
  chrono_v text;
  attendu_v text;
  new_titre text;
  new_corps text;
  paris_date text;
  paris_hm text;
  meta_date text;
  encourage text;
  names text;
  pct text;
  planned text;
  declared text;
  updated integer := 0;
BEGIN
  FOR r IN
    SELECT id, titre, corps, channel, meta, publie_at, source
    FROM public.staff_message
    WHERE source = 'appli'
      AND publie_at >= (timezone('Europe/Paris', now()))::date - 30
      AND titre NOT LIKE '⚠️%'
  LOOP
    paris_date := to_char(timezone('Europe/Paris', r.publie_at), 'DD/MM/YYYY');
    paris_hm := public.format_paris_hm(r.publie_at);
    meta_date := COALESCE(r.meta->>'date', '');
    IF meta_date ~ '^\d{4}-\d{2}-\d{2}$' THEN
      meta_date := to_char(meta_date::date, 'DD/MM/YYYY');
    ELSIF meta_date = '' THEN
      meta_date := paris_date;
    END IF;

    site_v := public._bf_field(r.corps, 'Site');
    teneur_v := public._bf_field(r.corps, 'Teneur');
    date_v := COALESCE(public._bf_field(r.corps, 'Date'), meta_date);
    raison_v := public._bf_field(r.corps, 'Raison');
    tickets_v := public._bf_field(r.corps, 'Tickets');
    feuilles_v := public._bf_field(r.corps, 'Feuilles');
    heure_v := COALESCE(
      public._bf_field(r.corps, 'Heure d''ouverture'),
      public._bf_field(r.corps, 'Heure de fermeture')
    );
    new_titre := NULL;
    new_corps := NULL;

    -- Bureau terrain
    IF r.meta->>'kind' = 'forced_closing'
       OR r.titre IN ('Fermeture forcée', '🚨 Fermeture forcée')
    THEN
      new_titre := '⚠️ Fermeture';
      new_corps := public._bf_join(
        '🔒 Fermeture forcée',
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-')),
        public._bf_line('📅', 'Date', date_v),
        public._bf_line('💬', 'Raison', COALESCE(raison_v, '-')),
        public._bf_line('🕒', 'Heure de fermeture', paris_hm)
      );

    ELSIF r.meta->>'kind' = 'opening_low_tickets'
       OR r.titre IN ('Stock tickets bas', '🎟️ Stock tickets bas')
    THEN
      new_titre := '⚠️ Tickets : Niveau bas';
      new_corps := public._bf_join(
        public._bf_line('🎟️', 'Tickets', COALESCE(tickets_v, '-')),
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-')),
        public._bf_line('📅', 'Date', date_v)
      );

    ELSIF r.meta->>'kind' = 'opening_low_feuilles'
       OR r.titre IN (
         'Stock feuilles bas',
         '📄 Stock feuilles bas',
         '📄 Stock feuilles / FDJ bas'
       )
    THEN
      new_titre := '⚠️ Feuilles : Niveau bas';
      new_corps := public._bf_join(
        public._bf_line('📄', 'Feuilles', COALESCE(feuilles_v, '-')),
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-')),
        public._bf_line('📅', 'Date', date_v)
      );

    ELSIF r.meta->>'kind' = 'parking_card_missing'
       OR r.titre IN ('Carte parking absente', '🅿️ Carte parking absente')
    THEN
      new_titre := '⚠️ Carte Parking';
      new_corps := public._bf_join(
        '🅿️ Carte parking absente',
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-')),
        public._bf_line('📅', 'Date', date_v)
      );

    ELSIF r.titre IN ('Ouverture en retard', '⏰ Ouverture en retard')
    THEN
      new_titre := '⚠️ Ouverture';
      new_corps := public._bf_join(
        '⏰ Ouverture en retard',
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-')),
        public._bf_line('📅', 'Date', date_v),
        public._bf_line('💬', 'Raison', COALESCE(raison_v, '-')),
        public._bf_line('🕒', 'Heure d''ouverture', COALESCE(heure_v, paris_hm))
      );

    ELSIF r.meta->>'kind' = 'chrono_miscalibrated'
       OR r.titre IN ('Chrono mal calibré', '⏲️ Chrono mal calibré')
    THEN
      chrono_v := public._bf_field(r.corps, 'Chrono');
      attendu_v := public._bf_field(r.corps, 'Attendu');
      new_titre := '⚠️ Chrono';
      new_corps := public._bf_join(
        '⏲️ Chrono mal calibré',
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-')),
        public._bf_line('📅', 'Date', date_v),
        public._bf_line('⏲️', 'Chrono', COALESCE(chrono_v, '-')),
        public._bf_line('✅', 'Attendu', COALESCE(attendu_v, '2 min 25 s à 2 min 35 s'))
      );

    ELSIF r.meta->>'kind' = 'monday_opening_issues'
       OR r.titre IN (
         'Ouverture lundi — manques',
         '📋 Ouverture lundi — manques'
       )
    THEN
      new_titre := '⚠️ Ouverture';
      new_corps := regexp_replace(
        regexp_replace(r.corps, '^📋 Ouverture lundi — manques signalés', '📋 Manques lundi'),
        '^Ouverture lundi — manques signalés',
        '📋 Manques lundi'
      );
      new_corps := regexp_replace(new_corps, 'Site:\s*', '📍 Site : ');
      new_corps := regexp_replace(new_corps, 'Date:\s*', '📅 Date : ');
      new_corps := regexp_replace(new_corps, 'Teneur:\s*', '👤 Teneur : ');
      new_corps := regexp_replace(new_corps, chr(10) || '👥 Double:[^\n]*', '', 'g');
      new_corps := regexp_replace(new_corps, 'Détails:\s*', '📝 Détails : ');
      IF site_v IS NOT NULL THEN
        new_corps := regexp_replace(
          new_corps,
          '📍 Site : [^\n]+',
          '📍 Site : ' || upper(site_v)
        );
      END IF;

    ELSIF r.titre = 'Anniversaires' THEN
      new_titre := '⚠️ Anniversaires';
      names := regexp_replace(
        regexp_replace(r.corps, '^🎂 Aujourd''hui c''est l''anniversaire de:\s*', ''),
        '(^|' || chr(10) || ')- ',
        '\1👤 ',
        'g'
      );
      new_corps := public._bf_join(
        '🎂 Anniversaire',
        public._bf_line('📅', 'Date', paris_date),
        nullif(btrim(names), '')
      );

    ELSIF r.titre = 'Qui pourrions-nous déclarer cette semaine ?'
       OR r.corps = 'Qui pourrions-nous déclarer cette semaine ?'
    THEN
      new_titre := '⚠️ Hebdo';
      new_corps := public._bf_join(
        '💬 Qui pourrions-nous déclarer cette semaine ?',
        public._bf_line('📅', 'Date', paris_date)
      );

    ELSIF r.titre = 'Taux de déclaration' THEN
      new_titre := '⚠️ Déclaration';
      pct := (regexp_match(r.corps, 'soit\s+(\d+)\s*%'))[1];
      planned := (regexp_match(r.corps, 'sur\s+(\d+)\s+vendeur'))[1];
      declared := (regexp_match(r.corps, ',\s+(\d+)\s+(?:est|sont)\s+déclar'))[1];
      new_corps := public._bf_join(
        '📊 Taux de déclaration',
        public._bf_line('📊', 'Taux', COALESCE(pct, '-') || ' %'),
        public._bf_line('👤', 'Planifiés', COALESCE(planned, '-')),
        public._bf_line('✅', 'Déclarés', COALESCE(declared, '-')),
        public._bf_line('📅', 'Mois', to_char(timezone('Europe/Paris', r.publie_at), 'MM/YYYY')),
        '💬 Pourrions-nous en déclarer certains autres ?'
      );

    -- CA
    ELSIF r.channel = 'ca' AND (r.meta->>'kind' = 'ca_daily_pdf' OR r.titre = 'CA du jour') THEN
      new_titre := '⚠️ CA';
      new_corps := public._bf_join(
        '📄 PDF CA du jour',
        public._bf_line('📅', 'Date', meta_date),
        '💬 Ouvrir pour générer / télécharger.'
      );

    -- Inter pannes
    ELSIF r.meta->>'kind' = 'panne_created'
       OR r.titre IN ('Nouvelle panne', 'Panne urgente')
    THEN
      signal_v := COALESCE(
        public._bf_field(r.corps, 'Signalé par'),
        public._bf_field(r.corps, 'Signal' || chr(233) || ' par')
      );
      sujet_v := public._bf_field(r.corps, 'Sujet');
      desc_v := public._bf_field(r.corps, 'Description');
      urgent_v := public._bf_field(r.corps, 'Urgent');
      ticket_v := COALESCE(
        (regexp_match(r.corps, 'Ticket\s*#?\s*(\d+)'))[1],
        (r.meta->>'intervention_id')
      );
      new_titre := CASE
        WHEN r.titre = 'Panne urgente' OR COALESCE(urgent_v, '') ILIKE 'oui%'
          THEN '⚠️ Panne urgente'
        ELSE '⚠️ Panne'
      END;
      new_corps := public._bf_join(
        CASE WHEN new_titre = '⚠️ Panne urgente' THEN '🚨 Panne urgente' ELSE '🔧 Nouvelle panne' END,
        public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-'))),
        public._bf_line('👤', 'Signalé par', COALESCE(signal_v, '-')),
        public._bf_line('📅', 'Date', paris_date),
        public._bf_line('💬', 'Sujet', COALESCE(sujet_v, '-')),
        public._bf_line('📝', 'Description', COALESCE(desc_v, '-')),
        public._bf_line('🎫', 'Ticket', CASE WHEN ticket_v IS NULL THEN '-' ELSE '#' || ticket_v END)
      );

    ELSIF r.meta->>'kind' = 'panne_resolved'
       OR r.titre IN ('Panne résolue', 'Pannes résolues')
    THEN
      constate_v := COALESCE(
        public._bf_field(r.corps, 'Constaté par'),
        public._bf_field(r.corps, 'Constat' || chr(233) || ' par')
      );
      resolved_v := COALESCE(
        public._bf_field(r.corps, 'Date résolution'),
        public._bf_field(r.corps, 'Date r' || chr(233) || 'solution')
      );
      new_titre := CASE
        WHEN r.titre = 'Pannes résolues' THEN '⚠️ Pannes'
        ELSE '⚠️ Panne'
      END;
      -- En-tête + tickets : emoji-iser les libellés restants
      new_corps := CASE
        WHEN r.titre = 'Pannes résolues' THEN '✅ Pannes résolues'
        ELSE '✅ Panne résolue'
      END
        || chr(10) || public._bf_line('📍', 'Site', upper(COALESCE(site_v, '-')))
        || chr(10) || public._bf_line('👤', 'Teneur', COALESCE(teneur_v, '-'))
        || chr(10) || public._bf_line('👤', 'Constaté par', COALESCE(constate_v, '-'))
        || chr(10) || public._bf_line('📅', 'Date résolution', COALESCE(resolved_v, paris_date));
      -- Append ticket blocks from original, lightly emoji-ized
      IF position('--- Ticket' IN r.corps) > 0 THEN
        new_corps := new_corps
          || chr(10)
          || regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(
                     regexp_replace(
                       regexp_replace(
                         substring(r.corps from position('--- Ticket' in r.corps)),
                         '--- Ticket #',
                         '🎫 Ticket #',
                         'g'
                       ),
                       '(^|' || chr(10) || ')Sujet:\s*',
                       '\1💬 Sujet : ',
                       'g'
                     ),
                     '(^|' || chr(10) || ')Description:\s*',
                     '\1📝 Description : ',
                     'g'
                   ),
                   '(^|' || chr(10) || ')Signal[^\n:]*:\s*',
                   '\1📅 Signalé le : ',
                   'g'
                 ),
                 '(^|' || chr(10) || ')Statut avant:\s*',
                 '\1📌 Statut avant : ',
                 'g'
               ),
               '(^|' || chr(10) || ')Urgent:\s*',
               '\1🚨 Urgent : ',
               'g'
             );
      END IF;

    -- Staff : dispos / planning / météo
    ELSIF r.titre = 'Disponibilités' THEN
      new_titre := '⚠️ Disponibilités';
      new_corps := public._bf_join(
        '📅 Semaine prochaine',
        '💬 Pense à remplir tes disponibilités pour la semaine prochaine.'
      );

    ELSIF r.titre = 'Planning semaine prochaine' THEN
      new_titre := '⚠️ Planning';
      new_corps := public._bf_join(
        '📅 Semaine prochaine',
        '💬 Tu as reçu tes attributions. Merci de les valider.'
      );

    ELSIF r.titre IN ('Semaine prochaine') THEN
      new_titre := '⚠️ Semaine';
      new_corps := public._bf_join(
        '📅 Semaine prochaine',
        '💬 ' || btrim(r.corps)
      );

    ELSIF r.meta->>'kind' = 'weather_brief' THEN
      new_titre := '⚠️ Météo';
      encourage := btrim(r.corps);
      new_corps := public._bf_join(
        '🌤️ Infos : ' || r.titre,
        public._bf_line('📅', 'Date', meta_date),
        CASE WHEN encourage <> '' THEN '💬 ' || encourage ELSE NULL END
      );
    END IF;

    IF new_titre IS NOT NULL THEN
      UPDATE public.staff_message
      SET titre = new_titre,
          corps = COALESCE(new_corps, corps)
      WHERE id = r.id;
      updated := updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'whatsapp backfill updated % messages', updated;
END;
$$;

DROP FUNCTION IF EXISTS public._bf_field(text, text);
DROP FUNCTION IF EXISTS public._bf_line(text, text, text);
DROP FUNCTION IF EXISTS public._bf_join(text[]);
