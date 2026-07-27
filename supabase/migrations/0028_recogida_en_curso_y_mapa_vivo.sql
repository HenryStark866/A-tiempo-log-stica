-- A TIEMPO LOGÍSTICA — arrancar la recogida y ver la flota en vivo.
--
-- QUÉ FALTABA:
--   1. No había forma de decir "ya voy en camino al comercio". La recogida
--      saltaba de 'asignada' a 'completada', así que entre que se asigna y que
--      el mensajero llega, el CEDI no sabía si había arrancado.
--   2. La ubicación se compartía con un interruptor manual que el mensajero
--      tenía que acordarse de prender. Si se le olvidaba, nadie lo veía.
--   3. Nadie tenía un mapa. La posición se guardaba desde 0014, pero solo se
--      veía como texto en el seguimiento de una guía suelta.

-- ── 1. Estado "en curso" ───────────────────────────────────────────────
do $$ begin
  alter type public.at_pickup_status add value if not exists 'en_curso' after 'asignada';
exception when others then null; end $$;

alter table public.at_pickups
  add column if not exists started_at timestamptz;

comment on column public.at_pickups.started_at is
  'Cuándo el mensajero pulsó Iniciar. Es lo que separa "se la asignaron" de "va en camino".';
