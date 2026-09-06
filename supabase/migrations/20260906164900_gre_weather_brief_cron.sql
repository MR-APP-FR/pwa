-- Brief météo 9h Paris : 1 staff_message + push par employé planifié (Edge weather-brief).

CREATE UNIQUE INDEX IF NOT EXISTS staff_message_weather_brief_user_day
  ON public.staff_message (
    (meta ->> 'date'),
    ((meta ->> 'user_id')::int)
  )
  WHERE meta ->> 'kind' = 'weather_brief';

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'weather-brief-utc7',
      'weather-brief-utc8'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'weather-brief-utc7',
  '0 7 * * *',
  $$SELECT internal.invoke_edge('weather-brief');$$
);

SELECT cron.schedule(
  'weather-brief-utc8',
  '0 8 * * *',
  $$SELECT internal.invoke_edge('weather-brief');$$
);
