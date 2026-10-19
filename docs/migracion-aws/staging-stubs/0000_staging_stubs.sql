-- RECONSTRUCCIONES PARA LA PILA NUEVA (no son las de producción; no van a supabase/migrations).
--
-- Tres funciones existen en producción pero ninguna migración local las crea (se
-- hicieron desde el panel). Antes eran stubs de cuerpo vacío; ahora están
-- RECONSTRUIDAS a partir de la evidencia del repo. Qué es dato y qué suposición
-- está en LEEME.md. Tienen que existir ANTES de la 0100, que les hace
-- REVOKE/GRANT, por eso viven en este archivo (0000_ se ejecuta primero).

-- 1) La franja de atención, en un solo sitio de la base.
-- DATO: 08:00–17:00 en turnos de 15 min (CHECK at_pickups_hora_en_franja, 0088;
--       docs/hora-de-recogida.md).
-- SUPOSICIÓN: la forma del resultado (tres columnas). Nada del repo la consume
--       salvo at_valida_hora_recogida, así que la forma es libre.
create or replace function public.at_franja_de_recogida(
  out hora_inicio time without time zone,
  out hora_fin time without time zone,
  out paso_minutos integer
)
returns record
language sql
immutable
set search_path to 'public'
as $$ select time '08:00', time '17:00', 15 $$;

-- 2) Comprueba que la hora de recogida cae en la franja y en un turno.
-- DATO: firma (time); la llama at_request_pickup con PERFORM (0099, línea 64);
--       acepta NULL («sin preferencia», docs/hora-de-recogida.md); la regla es la
--       del CHECK de la 0088.
-- DATO (por la firma): solo recibe la hora, no la fecha, así que NO puede decidir
--       si «ya pasó»; eso lo hace el trigger at_valida_momento_recogida.
-- SUPUESTO: el texto del mensaje y el código check_violation (los de la 0088 son
--       otros mensajes; este es nuevo y no aparece en ningún lado del repo).
create or replace function public.at_valida_hora_recogida(p time without time zone)
returns void
language plpgsql
stable
set search_path to 'public'
as $$
declare
  f record;
begin
  if p is null then
    return;
  end if;

  select * into f from public.at_franja_de_recogida();

  if p < f.hora_inicio
     or p > f.hora_fin
     or extract(minute from p)::int % f.paso_minutos <> 0
     or extract(second from p) <> 0 then
    raise exception 'La hora de recogida debe estar entre las % y las %, en turnos de % minutos.',
      to_char(f.hora_inicio, 'FMHH12:MI') || case when f.hora_inicio < time '12:00' then ' a. m.' else ' p. m.' end,
      to_char(f.hora_fin, 'FMHH12:MI') || case when f.hora_fin < time '12:00' then ' a. m.' else ' p. m.' end,
      f.paso_minutos
      using errcode = 'check_violation';
  end if;
end $$;

-- 3) Función del trigger que deja el primer hito del pedido. El trigger en sí
--    está en 01086_staging_trigger_evento_pedido.sql (necesita que at_guides exista).
-- DATO: existe, es de trigger, y escribe el hito «creado» (comentario en
--       src/app/(plataforma)/pedidos/[id]/page.tsx); la tabla es at_guide_events
--       (guide_id, status, note, actor_id); la pantalla pinta el hito con
--       GUIDE_STATUS_LABELS[status] («Creada»); ninguna RPC inserta ese hito, así
--       que no se duplica; security definer porque quien crea la guía no tiene
--       permiso de insertar en at_guide_events.
-- SUPOSICIÓN: nota vacía; el actor es quien crea (auth.uid(), o created_by si la
--       creación no trae sesión); el estado del hito es el estado inicial de la guía.
create or replace function public.at_evento_al_crear_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (new.id, new.status, null, coalesce(auth.uid(), new.created_by));
  return new;
end $$;

-- Tablas de encuestas: existen en producción, ninguna migración local las crea.
create table if not exists public.at_survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  client_id uuid,
  created_at timestamptz not null default now()
);
alter table public.at_survey_responses enable row level security;
create policy "cada quien ve lo suyo, ops ve todo" on public.at_survey_responses for select using (true);
create table if not exists public.at_survey_snooze (
  user_id uuid primary key,
  snoozed_until timestamptz
);
alter table public.at_survey_snooze enable row level security;
