-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-DEPLOY — 0088, la hora de recogida
--
-- Todo esto es de solo lectura salvo el último bloque, que está comentado.
-- Pégalo en el SQL Editor de Supabase. Cada consulta dice qué se espera ver.
--
-- Proyecto: uhbtivaepyhwfdvtpfjq  ⚠ es el de PRODUCCIÓN (ver
-- docs/despliegue-supabase.md).
-- https://supabase.com/dashboard/project/uhbtivaepyhwfdvtpfjq/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. ¿Llegaron las tres piezas? Se esperan 3 filas.
select 'CHECK' as pieza, conname as nombre,
       case when convalidated then 'validado' else 'NOT VALID (correcto por ahora)' end as estado
from pg_constraint
where conrelid = 'public.at_pickups'::regclass and conname = 'at_pickups_hora_en_franja'
union all
select 'trigger', tgname, case when tgenabled = 'O' then 'activo' else 'DESACTIVADO ⚠' end
from pg_trigger
where tgrelid = 'public.at_pickups'::regclass and not tgisinternal
  and tgname like 'at_pickups_valida_momento%'
order by 1, 2;

-- 2. ¿La función quedó anclada a la hora de Medellín?
--    Se espera ver 'TimeZone=America/Bogota' y 'search_path=public'.
--    Si falta el TimeZone, la función cuenta los días en UTC y a partir de las
--    7 p. m. da por «mañana» lo que el comercio pide para hoy.
select proname, proconfig
from pg_proc
where proname in ('at_valida_momento_recogida', 'at_request_pickup', 'at_update_pickup');

-- 3. ⚠ EL CHEQUEO QUE MÁS IMPORTA
--    `create or replace function` BORRA los `set` que puso un `alter function`.
--    La migración 0041 fijó la zona de at_request_pickup y at_update_pickup con
--    ALTER. Si alguna otra migración las volvió a crear sin repetir el `set`,
--    esas dos funciones perdieron la zona sin que nadie se enterara.
--    Se esperan CERO filas.
select proname as "función sin zona horaria — REVISAR"
from pg_proc
where proname in ('at_request_pickup', 'at_update_pickup', 'at_valida_momento_recogida')
  and not coalesce(array_to_string(proconfig, ',') like '%America/Bogota%', false);

-- 4. ¿Qué filas viejas quedan fuera de la rejilla?
--    Mientras el CHECK sea NOT VALID estas siguen ahí y no molestan.
--    Cuando esta consulta devuelva cero, se puede validar del todo (bloque 7).
select id, scheduled_date, scheduled_time, status
from public.at_pickups
where scheduled_time is not null
  and (scheduled_time < time '08:00'
       or scheduled_time > time '17:00'
       or extract(minute from scheduled_time)::int % 15 <> 0
       or extract(second from scheduled_time) <> 0)
order by scheduled_date desc;

-- 5. Cuánto queda por limpiar, de un vistazo.
select count(*) filter (where scheduled_time is null)              as "sin hora",
       count(*) filter (where scheduled_time is not null
                          and extract(minute from scheduled_time)::int % 15 = 0
                          and scheduled_time between time '08:00' and time '17:00') as "en rejilla",
       count(*)                                                     as total
from public.at_pickups;

-- 6. La prueba de fuego, sin ensuciar nada: se inserta a propósito algo
--    inválido dentro de una transacción que se deshace sola.
--    Se espera que el bloque termine SIN error y liste tres rechazos.
do $$
declare v_msg text;
begin
  begin
    insert into public.at_pickups (client_id, scheduled_date, scheduled_time, address, status)
    select client_id, current_date + 1, time '08:07', address, 'pendiente'
    from public.at_pickups limit 1;
    raise warning '❌ el CHECK dejó pasar 08:07';
  exception when check_violation then
    raise notice '✅ el CHECK rechaza 08:07 (fuera de rejilla)';
  end;

  begin
    insert into public.at_pickups (client_id, scheduled_date, scheduled_time, address, status)
    select client_id, current_date + 1, time '07:45', address, 'pendiente'
    from public.at_pickups limit 1;
    raise warning '❌ el CHECK dejó pasar 07:45';
  exception when check_violation then
    raise notice '✅ el CHECK rechaza 07:45 (fuera de la jornada)';
  end;

  raise notice 'ℹ El trigger de «hora pasada» solo aplica a cliente/asesor, así que desde el SQL Editor (que corre como postgres) no salta: eso se prueba desde la pantalla, con una cuenta de comercio.';
  raise exception 'fin de la prueba — nada se guardó';
exception when others then
  if sqlerrm <> 'fin de la prueba — nada se guardó' then raise; end if;
  raise notice '↩ transacción deshecha, la tabla quedó igual';
end $$;

-- 7. SOLO cuando el bloque 4 devuelva cero filas: dar el CHECK por bueno.
--    Escanea la tabla una vez y no bloquea escrituras (SHARE UPDATE EXCLUSIVE).
-- alter table public.at_pickups validate constraint at_pickups_hora_en_franja;
