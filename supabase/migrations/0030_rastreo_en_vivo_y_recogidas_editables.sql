-- A TIEMPO LOGÍSTICA — rastreo en vivo de verdad y recogidas que el comercio puede corregir.
--
-- QUÉ RESUELVE:
--   1. El mapa iba por sondeo: el mensajero enviaba posición cada 30 s y la
--      pantalla preguntaba cada 20 s, así que un punto podía tardar casi un
--      minuto en moverse. Ahora la posición viaja por Realtime y el mapa se
--      entera en cuanto llega.
--   2. Un comercio que se equivocaba de fecha, dirección o teléfono no podía
--      hacer nada: tocaba llamar al CEDI. Ahora puede corregir o cancelar su
--      solicitud mientras el mensajero no haya arrancado.
--
-- CRITERIO DE HASTA CUÁNDO SE PUEDE TOCAR:
--   pendiente  → sí, nadie la ha mirado todavía
--   asignada   → sí, hay mensajero pero aún no sale (se le avisa del cambio)
--   en_curso   → NO, ya va en camino: cambiarle la dirección a alguien que
--                está conduciendo hacia allá es peor que no dejar editar
--   completada / cancelada → NO, es historia

-- ═══════════════════════════════════════════════════════════════════════
--  1. POSICIÓN DE LA FLOTA EN TIEMPO REAL
-- ═══════════════════════════════════════════════════════════════════════
-- Tabla aparte de at_profiles por dos razones: el canal de Realtime solo se
-- despierta cuando cambia una posición (y no cada vez que alguien edita su
-- teléfono), y el payload que viaja no arrastra los datos personales del
-- mensajero (documentos, contacto) que sí viven en el perfil.
create table if not exists public.at_courier_positions (
  courier_id  uuid primary key references public.at_profiles(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,          -- radio de error que informa el GPS
  speed_kmh   double precision,          -- para distinguir "parado" de "rodando"
  heading     double precision,          -- rumbo en grados, si el equipo lo da
  updated_at  timestamptz not null default now()
);

comment on table public.at_courier_positions is
  'Última posición conocida de cada mensajero. Una fila por mensajero: se pisa, no se acumula. Es la tabla que publica Realtime para el mapa del CEDI.';

alter table public.at_courier_positions enable row level security;

-- Solo quien coordina la operación ve dónde va la flota. El comercio sigue
-- viendo la posición de SU paquete por at_my_shipments, no la de las personas.
drop policy if exists "staff ve la flota" on public.at_courier_positions;
create policy "staff ve la flota"
  on public.at_courier_positions for select
  using (public.at_is_staff());

-- Nadie escribe directo: se entra por at_report_position (security definer).
revoke all on public.at_courier_positions from anon, authenticated;
grant select on public.at_courier_positions to authenticated;

create index if not exists at_courier_positions_updated_idx
  on public.at_courier_positions (updated_at desc);

-- Publicar en Realtime. Si la publicación ya la contiene, no pasa nada.
do $$
begin
  alter publication supabase_realtime add table public.at_courier_positions;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- entorno sin la publicación creada
end $$;

-- Realtime necesita la fila completa para los UPDATE, no solo la clave.
alter table public.at_courier_positions replica identity full;

-- ── El mensajero reporta ───────────────────────────────────────────────
-- Se conserva la firma de dos argumentos (0014) porque hay clientes viejos
-- en la calle que siguen llamándola; la nueva añade precisión y velocidad.
create or replace function public.at_report_position(
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision default null,
  p_speed    double precision default null,
  p_heading  double precision default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_role public.at_role := public.at_my_role();
begin
  if v_role is null or v_role <> 'mensajero' then
    raise exception 'Solo un mensajero reporta posición';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Coordenadas inválidas';
  end if;

  -- at_profiles sigue siendo lo que leen at_live_couriers y el seguimiento
  -- del comprador; se mantiene al día para no romper nada de lo existente.
  update public.at_profiles
  set last_lat = p_lat, last_lng = p_lng, last_position_at = now()
  where id = auth.uid();

  -- Y esta es la que dispara el evento de Realtime hacia el mapa.
  insert into public.at_courier_positions
    (courier_id, lat, lng, accuracy_m, speed_kmh, heading, updated_at)
  values
    (auth.uid(), p_lat, p_lng, p_accuracy,
     case when p_speed is null then null else greatest(p_speed, 0) end,
     p_heading, now())
  on conflict (courier_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      accuracy_m = excluded.accuracy_m,
      speed_kmh = excluded.speed_kmh,
      heading = excluded.heading,
      updated_at = excluded.updated_at;
end $$;

revoke execute on function public.at_report_position(double precision, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.at_report_position(double precision, double precision, double precision, double precision, double precision) to authenticated;

-- Sembrar la tabla con lo último que ya sabíamos de cada mensajero, para que
-- el mapa no arranque vacío mientras nadie ha vuelto a reportar.
insert into public.at_courier_positions (courier_id, lat, lng, updated_at)
select id, last_lat, last_lng, coalesce(last_position_at, now())
from public.at_profiles
where role = 'mensajero' and last_lat is not null and last_lng is not null
on conflict (courier_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
--  2. EL COMERCIO CORRIGE SU SOLICITUD
-- ═══════════════════════════════════════════════════════════════════════
-- Quién puede tocar esta recogida y hasta cuándo. Devuelve la fila bloqueada
-- para que editar y cancelar compartan exactamente el mismo criterio.
create or replace function public.at_pickup_editable(p_pickup_id uuid)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup public.at_pickups;
  v_role   public.at_role := public.at_my_role();
  v_client uuid;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then
    raise exception 'Esa recogida ya no existe';
  end if;

  if v_role = 'cliente' then
    v_client := public.at_my_client();
    if v_client is null or v_pickup.client_id is distinct from v_client then
      raise exception 'Esa recogida no es de tu comercio';
    end if;
  elsif v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  if v_pickup.status = 'en_curso' then
    raise exception 'El mensajero ya va en camino. Llámanos al CEDI y lo coordinamos.';
  elsif v_pickup.status = 'completada' then
    raise exception 'Esa recogida ya se hizo';
  elsif v_pickup.status = 'cancelada' then
    raise exception 'Esa recogida ya estaba cancelada';
  end if;

  return v_pickup;
end $$;

revoke execute on function public.at_pickup_editable(uuid) from public, anon;
grant execute on function public.at_pickup_editable(uuid) to authenticated;

-- ── Editar ─────────────────────────────────────────────────────────────
-- Cada parámetro en null significa "esto no lo toques", salvo los que el
-- comercio puede querer vaciar a propósito (notas y datos de contacto), que
-- se limpian mandando cadena vacía.
create or replace function public.at_update_pickup(
  p_pickup_id      uuid,
  p_scheduled_date date default null,
  p_scheduled_time time default null,
  p_address        text default null,
  p_contact_name   text default null,
  p_contact_phone  text default null,
  p_notes          text default null,
  p_guide_ids      uuid[] default null
)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup   public.at_pickups := public.at_pickup_editable(p_pickup_id);
  v_address  text;
  v_ajenas   int;
  v_comercio text;
begin
  v_address := coalesce(nullif(trim(p_address), ''), v_pickup.address);
  if v_address is null or trim(v_address) = '' then
    raise exception 'Indica la dirección donde debemos recoger';
  end if;

  if p_scheduled_date is not null and p_scheduled_date < current_date then
    raise exception 'Esa fecha ya pasó';
  end if;

  -- Las guías incluidas deben ser del mismo comercio
  if p_guide_ids is not null then
    select count(*) into v_ajenas
    from public.at_guides g
    where g.id = any(p_guide_ids) and g.client_id is distinct from v_pickup.client_id;
    if v_ajenas > 0 then
      raise exception 'Hay % guía(s) que no pertenecen a tu comercio', v_ajenas;
    end if;
  end if;

  update public.at_pickups
  set scheduled_date = coalesce(p_scheduled_date, scheduled_date),
      scheduled_time = coalesce(p_scheduled_time, scheduled_time),
      address        = v_address,
      contact_name   = case when p_contact_name  is null then contact_name
                            else nullif(trim(p_contact_name), '') end,
      contact_phone  = case when p_contact_phone is null then contact_phone
                            else nullif(trim(p_contact_phone), '') end,
      notes          = case when p_notes is null then notes
                            else nullif(trim(p_notes), '') end
  where id = p_pickup_id
  returning * into v_pickup;

  -- Reemplazar el juego de guías: se sueltan las que salieron y se enganchan
  -- las nuevas, siempre que sigan sin recoger.
  if p_guide_ids is not null then
    update public.at_guides g
    set pickup_id = null
    where g.pickup_id = p_pickup_id
      and g.status = 'creada'
      and not (g.id = any(p_guide_ids));

    update public.at_guides g
    set pickup_id = p_pickup_id
    where g.id = any(p_guide_ids)
      and g.client_id = v_pickup.client_id
      and g.status = 'creada'
      and (g.pickup_id is null or g.pickup_id = p_pickup_id);
  end if;

  -- Si ya había mensajero asignado, se entera: salía con otros datos.
  if v_pickup.operator_id is not null then
    select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;
    insert into public.at_notifications (user_id, title, body, link)
    values (v_pickup.operator_id, 'Cambió una recogida tuya',
            coalesce(v_comercio, 'Un comercio') || ' actualizó los datos · ' ||
            to_char(v_pickup.scheduled_date, 'DD/MM') ||
            coalesce(' ' || to_char(v_pickup.scheduled_time, 'HH24:MI'), '') ||
            ' · ' || v_pickup.address,
            '/conductor/recogida');
  end if;

  return v_pickup;
end $$;

revoke execute on function public.at_update_pickup(uuid, date, time, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.at_update_pickup(uuid, date, time, text, text, text, text, uuid[]) to authenticated;

-- ── Cancelar ───────────────────────────────────────────────────────────
-- No se borra la fila: queda como 'cancelada' con el motivo. Un comercio que
-- cancela cinco recogidas seguidas es información que la operación necesita.
create or replace function public.at_cancel_pickup(
  p_pickup_id uuid,
  p_reason    text default null
)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup   public.at_pickups := public.at_pickup_editable(p_pickup_id);
  v_comercio text;
  v_motivo   text := nullif(trim(p_reason), '');
  v_ops      record;
  v_sueltas  int := 0;
begin
  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;

  -- Las guías vuelven a quedar libres para entrar en otra recogida.
  update public.at_guides g
  set pickup_id = null
  where g.pickup_id = p_pickup_id and g.status = 'creada';
  get diagnostics v_sueltas = row_count;

  update public.at_pickups
  set status = 'cancelada',
      completed_at = now(),
      notes = coalesce(nullif(notes, '') || ' · ', '') ||
              'Cancelada por el comercio' ||
              coalesce(': ' || v_motivo, '')
  where id = p_pickup_id
  returning * into v_pickup;

  -- Avisar al mensajero que la tenía asignada
  if v_pickup.operator_id is not null then
    insert into public.at_notifications (user_id, title, body, link)
    values (v_pickup.operator_id, 'Recogida cancelada',
            coalesce(v_comercio, 'Un comercio') || ' canceló la recogida de ' ||
            v_pickup.address || coalesce(' · ' || v_motivo, ''),
            '/conductor/recogida');
  end if;

  -- Y al CEDI, que puede tener la ruta del día armada con ella dentro
  for v_ops in
    select id from public.at_profiles
    where role in ('operario','coordinador','admin') and active
  loop
    insert into public.at_notifications (user_id, title, body, link)
    values (v_ops.id, 'Recogida cancelada por el comercio',
            coalesce(v_comercio, 'Un comercio') || ' · ' ||
            to_char(v_pickup.scheduled_date, 'DD/MM') || ' · ' || v_pickup.address ||
            case when v_sueltas > 0
                 then ' · ' || v_sueltas || ' guía(s) quedaron sin recogida'
                 else '' end,
            '/recogidas');
  end loop;

  return v_pickup;
end $$;

revoke execute on function public.at_cancel_pickup(uuid, text) from public, anon;
grant execute on function public.at_cancel_pickup(uuid, text) to authenticated;

-- ── Las guías que el comercio puede meter en una recogida ───────────────
-- Al editar hay que ofrecer tanto las libres como las que ya están en ESTA
-- recogida; el listado de "pendientes" que usa la pantalla solo trae libres.
create or replace function public.at_pickup_guides(p_pickup_id uuid)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pickup public.at_pickups;
  v_role   public.at_role := public.at_my_role();
  v_client uuid;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id;
  if not found then raise exception 'Esa recogida ya no existe'; end if;

  if v_role = 'cliente' then
    v_client := public.at_my_client();
    if v_client is null or v_pickup.client_id is distinct from v_client then
      raise exception 'Esa recogida no es de tu comercio';
    end if;
  elsif v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select json_agg(t order by t.guide_number)
    from (
      select g.id,
             g.guide_number,
             g.recipient_name,
             g.recipient_city,
             (g.pickup_id = p_pickup_id) as incluida
      from public.at_guides g
      where g.client_id = v_pickup.client_id
        and g.status = 'creada'
        and (g.pickup_id is null or g.pickup_id = p_pickup_id)
    ) t
  ), '[]'::json);
end $$;

revoke execute on function public.at_pickup_guides(uuid) from public, anon;
grant execute on function public.at_pickup_guides(uuid) to authenticated;
