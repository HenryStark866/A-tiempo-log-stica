-- ═══════════════════════════════════════════════════════════════════════════
-- BARBOSA TIENE ZONA, Y LA SALUD AVISA SI A ALGUIEN LE FALTA
--
-- Encontrado el 2026-09-09 revisando rótulos en pantalla: una guía a Barbosa
-- mostraba «Zona 1 · Sur Metropolitano», una de las cinco zonas que la 0089
-- jubiló. Tirando del hilo: **Barbosa no está en ninguna de las diez
-- sub-zonas**, aunque sí está en CIUDADES_OPERADAS (src/lib/zones.ts) y la app
-- la ofrece en el desplegable de ciudad.
--
-- Lo que pasaba, y lo que NO pasaba todavía:
--
-- Esa guía es anterior a la 0089 y conservó su zona vieja, así que se cobró
-- ($11.500). No hay ni una guía sin zona en la base — se comprobó antes de
-- escribir esto. El daño no está hecho: lo que había era una gotera esperando
-- a que lloviera. El PRÓXIMO pedido a Barbosa, ya sin zonas viejas activas, no
-- resolvería ninguna, y ahí sí: at_precio_domicilio cae al delivery_rate del
-- comercio ($6.000 de fábrica) o a cero, y se factura mal en silencio.
--
-- Se arregla Barbosa y solo Barbosa. Rionegro y Oriente Cercano están en el
-- mismo limbo —en el selector, fuera de toda sub-zona— pero están fuera del
-- Valle de Aburrá y su tarifa es una decisión comercial, no geográfica. Queda
-- pendiente de hablarlo, no de adivinarlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Barbosa entra en Norte Extendido ───────────────────────────────────
-- Es donde le toca: subiendo el río, después de Girardota, que ya está ahí
-- junto con Copacabana. La condición `not ilike` la hace reaplicable sin
-- duplicar el nombre en la lista.
update public.at_zones
   set coverage = coverage || ', Barbosa'
 where code = 'EXT-NOR'
   and coalesce(coverage, '') not ilike '%barbosa%';

do $$
declare v_cobertura text;
begin
  select coverage into v_cobertura from public.at_zones where code = 'EXT-NOR';
  if v_cobertura is null or v_cobertura not ilike '%barbosa%' then
    raise exception 'Barbosa no quedó en EXT-NOR. Revisa at_zones.';
  end if;
end $$;

-- ── 2. Los destinatarios de Barbosa que ya existen ────────────────────────
-- Para que el próximo pedido a uno de ellos nazca zonificado. Las GUÍAS no se
-- tocan a propósito: la de Barbosa que hay se cobró a $11.500 y re-zonificarla
-- la subiría a $21.000 en un pedido que el comercio ya conoce. El precio se
-- congela al crear; hacia atrás no se toca.
update public.at_recipients
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where zone_id is null
   and public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

-- ── 3. El semáforo aprende a mirar las zonas ──────────────────────────────
-- Mismo cuerpo de la 0106 con dos cuentas nuevas. Se repite entero porque
-- `create or replace` reemplaza la función completa: lo que no se reescriba,
-- se pierde.
--
-- Por qué degrada solo con las de HOY: una guía vieja sin zona que nadie va a
-- arreglar dejaría el semáforo en rojo para siempre, y un rojo permanente se
-- deja de mirar a la semana. Lo que hay que ver hoy es que ENTREN pedidos sin
-- zona; el histórico se cuenta y se enseña, pero no pinta el semáforo.
create or replace function public.at_salud()
returns json
language plpgsql
volatile
security definer
set search_path to 'public', 'cron'
as $$
declare
  v_pendientes    int;
  v_atrasados     int;
  v_fallidos      int;
  v_ultimo_cron   timestamptz;
  v_sin_zona      int;
  v_sin_zona_hoy  int;
  v_zona_jubilada int;
  v_estado        text;
begin
  perform public.at_limitar('salud', 120, 2000);

  select count(*) into v_pendientes
  from public.at_message_outbox where status = 'pendiente';

  select count(*) into v_atrasados
  from public.at_message_outbox
  where status = 'pendiente' and created_at < now() - interval '15 minutes';

  select count(*), max(start_time) into v_fallidos, v_ultimo_cron
  from cron.job_run_details
  where start_time > now() - interval '1 hour' and status <> 'succeeded';

  if v_ultimo_cron is null then
    select max(start_time) into v_ultimo_cron from cron.job_run_details;
  end if;

  -- Una guía sin zona se factura por el respaldo del comercio o en cero, y no
  -- rompe ninguna pantalla: exactamente la clase de fallo mudo para la que se
  -- hizo este semáforo.
  select count(*) into v_sin_zona
  from public.at_guides
  where zone_id is null and status <> 'cancelada';

  select count(*) into v_sin_zona_hoy
  from public.at_guides
  where zone_id is null and status <> 'cancelada'
    and created_at > now() - interval '24 hours';

  -- Apuntando a una zona jubilada: se cobra, pero con una tarifa que ya no
  -- está en el tarifario. Se enseña, no degrada.
  select count(*) into v_zona_jubilada
  from public.at_guides g
  join public.at_zones z on z.id = g.zone_id
  where not z.active and g.status <> 'cancelada';

  v_estado := case
    when v_atrasados > 0 or v_fallidos > 0 or v_sin_zona_hoy > 0 then 'degradado'
    else 'ok'
  end;

  if not public.at_is_staff() then
    return json_build_object('estado', v_estado, 'ahora', now());
  end if;

  return json_build_object(
    'estado',            v_estado,
    'ahora',             now(),
    'buzon_pendiente',   v_pendientes,
    'buzon_atrasado',    v_atrasados,
    'crons_fallidos',    v_fallidos,
    'ultimo_cron',       v_ultimo_cron,
    'guias_sin_zona',    v_sin_zona,
    'guias_sin_zona_24h', v_sin_zona_hoy,
    'guias_zona_jubilada', v_zona_jubilada
  );
end $$;

comment on function public.at_salud() is
  'Semáforo de la operación. Sin sesión devuelve solo estado y hora; con sesión de staff, el detalle: buzón, crons y guías sin zona o con zona jubilada.';

grant execute on function public.at_salud() to anon, authenticated, service_role;

-- ── Cómo se comprueba ─────────────────────────────────────────────────────
--   select public.at_salud();            -- con sesión de staff, trae las tres cuentas
--   select code, coverage from public.at_zones where code = 'EXT-NOR';
