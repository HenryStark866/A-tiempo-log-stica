-- Columnas que tenía la base de producción en Supabase Cloud y que ninguna
-- migración del repo crea. Se encontraron el 2026-10-19 al comparar el
-- respaldo db_cluster del 2026-09-23 contra la base nueva de AWS, antes de
-- importar los datos viejos: sin ellas, la importación perdía las coordenadas
-- de la sede y el rol de quien respondió la encuesta.
--
-- DATO (del respaldo): nombres y tipos de at_facilities.lat/lng y
-- at_survey_responses.rol.
-- DISEÑO: rol queda NULL-able (en producción era NOT NULL) porque las
-- funciones de la encuesta reconstruidas en 01087 no lo llenan; las respuestas
-- viejas sí lo traen. La columna `hasta` de at_survey_snooze NO se recrea: es
-- la misma que snoozed_until (01087) y la importación la mapea.

alter table public.at_facilities
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.at_survey_responses
  add column if not exists rol public.at_role;
