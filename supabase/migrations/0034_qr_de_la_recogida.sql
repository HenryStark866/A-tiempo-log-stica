-- ══════════════════════════════════════════════════════════════════════════
-- 0034 · El QR de la recogida
--
-- Hasta aquí el CEDI recibía guía por guía: el operario leía un código, lo
-- escaneaba, esperaba, y repetía tantas veces como bultos trajera el mensajero.
-- Una recogida de veinte paquetes eran veinte escaneos en el muelle, con el
-- mensajero parado al lado.
--
-- Pero el lote ya existe como grupo: las guías quedan colgadas de `pickup_id`
-- y ahí siguen cuando el mensajero confirma —at_confirm_pickup solo suelta las
-- que NO recogió—. Si el grupo existe, el grupo puede tener su propio código:
-- un escaneo y entra el lote entero al inventario.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. El código de la recogida ───────────────────────────────────────────
--
-- Token aleatorio y no el id de la fila. El QR se imprime y se pega en la
-- estiba: queda a la vista de cualquiera que pase por el muelle, y un uuid de
-- recogida es una llave con la que se pueden pedir datos del comercio. El token
-- no significa nada por sí solo y se puede rotar sin tocar el resto de la fila.
--
-- Se genera con la fila, no al asignar ni al confirmar: el comercio tiene que
-- poder imprimirlo en el momento en que pide la recogida.
alter table public.at_pickups
  add column if not exists pickup_token text not null
    default encode(gen_random_bytes(12), 'hex');

create unique index if not exists at_pickups_pickup_token_key
  on public.at_pickups (pickup_token);

comment on column public.at_pickups.pickup_token is
  'Código del QR del lote. El operario lo escanea en el CEDI y at_receive_pickup ingresa de una todas las guías recogidas de esa solicitud.';

-- ── 2. Recibir el lote completo ───────────────────────────────────────────
create or replace function public.at_receive_pickup(p_token text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup     public.at_pickups;
  v_role       public.at_role := public.at_my_role();
  v_recibidas  int := 0;
  v_ya_estaban int := 0;
  v_sin_salir  int := 0;
  v_comercio   text;
begin
  -- El CEDI es bodega: recibir mercancía es del personal de operaciones. El
  -- mensajero no se recibe a sí mismo, y el comercio no toca inventario.
  --
  -- El `is null` va de primero y no sobra: sin él, un usuario sin fila en
  -- at_profiles da rol NULL, `NULL not in (...)` vale NULL, el `if` no entra y
  -- la sesión pasa el control. Es el mismo orden que usa at_change_guide_status.
  if v_role is null or v_role not in ('admin','coordinador','operario') then
    raise exception 'Solo el personal del CEDI puede recibir mercancía';
  end if;

  select * into v_pickup
  from public.at_pickups
  where pickup_token = nullif(trim(p_token), '')
  for update;

  if not found then
    raise exception 'Ese código no corresponde a ninguna recogida';
  end if;

  select business_name into v_comercio
  from public.at_clients where id = v_pickup.client_id;

  -- Solo las que el mensajero verificó en el comercio. Una guía que sigue en
  -- 'creada' nunca salió de allá: darla por recibida en bodega sería inventar
  -- un movimiento que no ocurrió, y de ahí en adelante nadie sabría si el
  -- paquete existe. Se cuentan aparte y se avisan.
  with movidas as (
    update public.at_guides g set
      status = 'en_cedi',
      received_cedi_at = coalesce(g.received_cedi_at, now()),
      -- Al entrar a bodega deja de ser de nadie: se reasigna al despachar.
      courier_id = null,
      -- Mismo criterio que at_change_guide_status: si nadie le puso zona, se
      -- deduce de la dirección para que caiga sola en el tablero de ruteo.
      zone_id = coalesce(
        g.zone_id,
        public.at_zone_for_city(
          coalesce(g.recipient_city, '') || ' ' || coalesce(g.recipient_address, '')
        )
      )
    where g.pickup_id = v_pickup.id
      and g.status = 'recogida'
    returning g.id
  ),
  eventos as (
    insert into public.at_guide_events (guide_id, status, note, actor_id)
    select m.id, 'en_cedi', 'Ingreso al CEDI con el QR de la recogida', auth.uid()
    from movidas m
    returning 1
  )
  select count(*) into v_recibidas from movidas;

  select
    count(*) filter (where g.status = 'en_cedi'),
    count(*) filter (where g.status = 'creada')
  into v_ya_estaban, v_sin_salir
  from public.at_guides g
  where g.pickup_id = v_pickup.id;

  -- Las que ya estaban dentro antes de este escaneo.
  v_ya_estaban := greatest(v_ya_estaban - v_recibidas, 0);

  return json_build_object(
    'recibidas',   v_recibidas,
    'ya_estaban',  v_ya_estaban,
    'sin_salir',   v_sin_salir,
    'comercio',    v_comercio,
    'pickup_id',   v_pickup.id
  );
end $$;

revoke execute on function public.at_receive_pickup(text) from public, anon;
grant execute on function public.at_receive_pickup(text) to authenticated;

comment on function public.at_receive_pickup(text) is
  'Ingreso al CEDI de todo un lote con un solo escaneo del QR de la recogida. Solo mueve guías en estado recogida; las que nunca salieron del comercio se reportan sin tocarlas.';

-- ── 3. El mensajero también carga el QR ───────────────────────────────────
--
-- El código va en el papel pegado a la estiba, pero el papel se moja, se cae y
-- se despega. El mensajero lleva el mismo código en su pantalla, así que en el
-- muelle siempre hay algo que escanear.
create or replace function public.at_my_pickups()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.at_role := public.at_my_role();
  v_uid  uuid := auth.uid();
begin
  if v_role not in ('mensajero','admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select json_agg(t order by t.scheduled_date, t.scheduled_time nulls last)
    from (
      select p.id            as pickup_id,
             p.status,
             p.address,
             p.contact_name,
             p.contact_phone,
             p.scheduled_date,
             p.scheduled_time,
             p.started_at,
             p.notes,
             p.package_count,
             p.pickup_token,
             c.business_name,
             c.phone         as business_phone,
             c.address       as business_address,
             coalesce((
               select json_agg(json_build_object(
                        'id', g.id,
                        'guide_number', g.guide_number,
                        'recipient_name', g.recipient_name,
                        'recipient_city', g.recipient_city,
                        'is_cod', g.is_cod,
                        'cod_amount', g.cod_amount
                      ) order by g.guide_number)
               from public.at_guides g
               where g.pickup_id = p.id and g.status = 'creada'
             ), '[]'::json) as guias
      from public.at_pickups p
      join public.at_clients c on c.id = p.client_id
      where p.status in ('asignada','en_curso')
        and (v_role <> 'mensajero' or p.operator_id = v_uid)
    ) t
  ), '[]'::json);
end $$;

revoke execute on function public.at_my_pickups() from public, anon;
grant execute on function public.at_my_pickups() to authenticated;
