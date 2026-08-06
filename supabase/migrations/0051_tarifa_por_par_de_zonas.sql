-- A TIEMPO LOGÍSTICA — el precio del domicilio depende de DÓNDE SALE, no solo
-- de a dónde llega.
--
-- EL PROBLEMA: el tarifario por zona (11.500 a 22.000) describe el viaje
-- SALIENDO DEL CEDI de Sabaneta. Por eso "Zona 4 · Norte Extendido" vale
-- 22.000: es cruzar todo el valle. Pero a un e-commerce que ya está en
-- Girardota y le entrega a un vecino de Girardota se le estaba cobrando esos
-- mismos 22.000 por un viaje de diez cuadras.
--
-- Y encima nada de eso llegaba a la factura: at_generate_invoice cobraba
-- at_clients.delivery_rate —los 6.000 planos que traía la cuenta de fábrica—
-- e ignoraba la zona por completo. O sea que el tarifario existía en la
-- pantalla del cliente pero no en lo que se le cobraba.
--
-- LA SOLUCIÓN: una matriz de precios por PAR de zonas (de dónde sale → a
-- dónde llega), editable por el admin, y el precio se congela en cada guía
-- para que un cambio de tarifario mañana no reescriba lo ya facturado.

-- ── 1. En qué zona queda cada comercio ────────────────────────────────────
alter table public.at_clients
  add column if not exists zone_id uuid references public.at_zones(id) on delete set null;

comment on column public.at_clients.zone_id is
  'Zona desde la que SALEN los envíos de este comercio. Es el origen del par de tarifa.';

-- Se resuelve de la dirección que el comercio ya tiene registrada. Los que no
-- se puedan resolver quedan en null y caen al comportamiento de siempre
-- (tarifa del destino), que es exactamente lo que pasaba hasta hoy.
update public.at_clients c
set zone_id = public.at_zone_for_city(coalesce(c.address, ''))
where c.zone_id is null and coalesce(trim(c.address), '') <> '';

-- ── 2. La matriz ──────────────────────────────────────────────────────────
create table if not exists public.at_zone_pair_rates (
  origin_zone_id uuid not null references public.at_zones(id) on delete cascade,
  dest_zone_id   uuid not null references public.at_zones(id) on delete cascade,
  delivery_rate  numeric(12,2) not null check (delivery_rate >= 0),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.at_profiles(id) on delete set null,
  primary key (origin_zone_id, dest_zone_id)
);

comment on table public.at_zone_pair_rates is
  'Precio del domicilio por par (zona de origen → zona de destino). El CEDI de cada zona se deduce de at_zones.facility_id: una fila nunca cruza dos CEDIs.';

alter table public.at_zone_pair_rates enable row level security;

-- Un comercio necesita leer su propio tarifario (la lista de precios que ve
-- antes de despachar), pero solo las filas que SALEN de su zona: lo que le
-- cobran a otro no es asunto suyo.
drop policy if exists "lectura del tarifario propio" on public.at_zone_pair_rates;
create policy "lectura del tarifario propio" on public.at_zone_pair_rates
  for select to authenticated
  using (
    public.at_is_staff()
    or origin_zone_id = (select zone_id from public.at_clients where id = public.at_my_client())
  );

drop policy if exists "ops administra el tarifario" on public.at_zone_pair_rates;
create policy "ops administra el tarifario" on public.at_zone_pair_rates
  for all to authenticated
  using (
    public.at_is_ops()
    and public.at_puede_ver_facility((select facility_id from public.at_zones where id = origin_zone_id))
  )
  with check (
    public.at_is_ops()
    and public.at_puede_ver_facility((select facility_id from public.at_zones where id = origin_zone_id))
  );

-- ── 3. Siembra ────────────────────────────────────────────────────────────
-- Regla deliberadamente conservadora, para no subirle el precio a nadie de un
-- día para otro:
--
--   · origen = destino  → la tarifa MÁS BARATA del tarifario de ese CEDI.
--     Es el viaje más corto que existe (el CEDI está en esa misma zona), y es
--     justo lo que arregla el caso de Girardota→Girardota.
--   · origen ≠ destino  → la tarifa del DESTINO, o sea exactamente lo que se
--     cobraba hasta hoy. Nadie ve un aumento por esta migración.
--
-- La matriz queda editable: la geografía real no es lineal (Norte Extendido y
-- Sur Extendido están lejísimos entre sí y esta regla los cobra igual que
-- desde el CEDI), y esas celdas se ajustan a mano desde la pantalla.
create or replace function public.at_sembrar_tarifario(p_facility_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_min numeric(12,2);
  v_creadas int := 0;
begin
  select min(delivery_rate) into v_min
  from public.at_zones where facility_id = p_facility_id and active;

  if v_min is null then return 0; end if;

  insert into public.at_zone_pair_rates (origin_zone_id, dest_zone_id, delivery_rate)
  select o.id, d.id,
         case when o.id = d.id then v_min else d.delivery_rate end
  from public.at_zones o
  join public.at_zones d on d.facility_id = o.facility_id
  where o.facility_id = p_facility_id and o.active and d.active
  on conflict (origin_zone_id, dest_zone_id) do nothing;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end $$;

revoke execute on function public.at_sembrar_tarifario(uuid) from public, anon;
grant execute on function public.at_sembrar_tarifario(uuid) to authenticated;

-- Se siembra para todos los CEDIs que ya existen.
do $$
declare v_f record;
begin
  for v_f in select id from public.at_facilities loop
    perform public.at_sembrar_tarifario(v_f.id);
  end loop;
end $$;

-- Un CEDI afiliado nuevo nace con su matriz puesta: at_generar_zonas_por_defecto
-- ya le copia las zonas, aquí se le copia también el cruce entre ellas.
create or replace function public.at_generar_zonas_por_defecto(p_facility_id uuid, p_city text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_creadas int := 0;
  v_zona record;
  v_nueva_id uuid;
  v_sufijo int := 0;
  v_nombre text;
begin
  for v_zona in
    select z.*, zc.courier_fee
    from public.at_zones z
    left join public.at_zone_costs zc on zc.zone_id = z.id
    where z.facility_id = (select id from public.at_facilities where is_default limit 1)
    order by z.sort_order
  loop
    v_sufijo := v_sufijo + 1;
    v_nombre := trim(p_city) || ' - Zona ' || v_sufijo;
    if exists (select 1 from public.at_zones where name = v_nombre) then
      v_nombre := v_nombre || ' (' || left(p_facility_id::text, 8) || ')';
    end if;

    insert into public.at_zones (name, description, coverage, city_fallback, delivery_rate, sort_order, facility_id, active)
    values (
      v_nombre,
      'Zona generada automáticamente a partir del tarifario de Medellín. Falta afinar los barrios.',
      null,
      trim(p_city),
      v_zona.delivery_rate,
      v_zona.sort_order,
      p_facility_id,
      true
    )
    returning id into v_nueva_id;

    insert into public.at_zone_costs (zone_id, courier_fee)
    values (v_nueva_id, coalesce(v_zona.courier_fee, 4000));

    v_creadas := v_creadas + 1;
  end loop;

  -- NUEVO: con las zonas ya creadas, se siembra el cruce entre ellas.
  perform public.at_sembrar_tarifario(p_facility_id);

  return v_creadas;
end $$;

-- ── 4. El precio de un envío ──────────────────────────────────────────────
-- Un solo lugar que responde "cuánto vale llevar esto", para que la pantalla
-- del cliente, la guía y la factura no puedan decir tres cifras distintas.
create or replace function public.at_precio_domicilio(p_client_id uuid, p_dest_zone_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- 1. La matriz, si el comercio tiene zona y el destino también.
    (select r.delivery_rate
     from public.at_zone_pair_rates r
     where r.origin_zone_id = (select zone_id from public.at_clients where id = p_client_id)
       and r.dest_zone_id = p_dest_zone_id),
    -- 2. Sin zona de origen conocida: la tarifa del destino, como siempre.
    (select z.delivery_rate from public.at_zones z where z.id = p_dest_zone_id),
    -- 3. Sin zona de destino tampoco (dirección que no reconocimos): la
    --    tarifa de la cuenta. Es el último recurso, no el caso normal.
    (select c.delivery_rate from public.at_clients c where c.id = p_client_id),
    0
  )
$$;

revoke execute on function public.at_precio_domicilio(uuid, uuid) from public, anon;
grant execute on function public.at_precio_domicilio(uuid, uuid) to authenticated;

-- ── 5. El precio se congela en la guía ────────────────────────────────────
alter table public.at_guides
  add column if not exists shipping_fee numeric(12,2),
  add column if not exists cod_includes_shipping boolean not null default false;

comment on column public.at_guides.shipping_fee is
  'Precio del domicilio congelado en el momento en que se supo la zona. Un cambio de tarifario mañana no reescribe lo ya cobrado.';
comment on column public.at_guides.cod_includes_shipping is
  'El valor a recaudar ya trae el domicilio: el comprador paga producto + envío, y esa entrega no se le vuelve a cobrar al comercio.';

-- Se recalcula mientras el viaje no haya terminado —la zona se suele asignar
-- recién en el CEDI, después de crear la guía— y se queda quieto en cuanto la
-- guía se entrega o se devuelve.
create or replace function public.at_set_guide_shipping_fee()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status in ('entregada','devuelta','cancelada') then
    return new;
  end if;
  if new.zone_id is not null then
    new.shipping_fee := public.at_precio_domicilio(new.client_id, new.zone_id);
  end if;
  return new;
end $$;

drop trigger if exists at_guides_set_shipping_fee on public.at_guides;
create trigger at_guides_set_shipping_fee
  before insert or update of zone_id on public.at_guides
  for each row execute function public.at_set_guide_shipping_fee();

-- Las guías que ya existen y todavía están en vuelo estrenan precio real.
update public.at_guides g
set shipping_fee = public.at_precio_domicilio(g.client_id, g.zone_id)
where g.shipping_fee is null and g.zone_id is not null
  and g.status not in ('entregada','devuelta','cancelada');

-- Las ya entregadas/devueltas también, pero solo las que nadie ha facturado:
-- reescribir una factura emitida sería cambiarle a alguien una cuenta cerrada.
update public.at_guides g
set shipping_fee = public.at_precio_domicilio(g.client_id, g.zone_id)
where g.shipping_fee is null and g.zone_id is not null and g.invoice_id is null;

-- ── 6. El tarifario que ve un comercio ────────────────────────────────────
-- Su lista de precios personalizada: cada zona de destino con lo que le
-- cuesta A ÉL llegar allá desde donde está.
create or replace function public.at_mi_tarifario()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(t order by t.sort_order), '[]'::json)
  from (
    select z.id, z.name, z.coverage, z.sort_order,
           public.at_precio_domicilio(public.at_my_client(), z.id) as delivery_rate,
           z.id = (select zone_id from public.at_clients where id = public.at_my_client()) as es_mi_zona
    from public.at_zones z
    where z.active
      and z.facility_id = coalesce(
        (select facility_id from public.at_clients where id = public.at_my_client()),
        (select id from public.at_facilities where is_default limit 1)
      )
  ) t
$$;

revoke execute on function public.at_mi_tarifario() from public, anon;
grant execute on function public.at_mi_tarifario() to authenticated;

-- ── 7. Ver y editar la matriz (admin) ─────────────────────────────────────
create or replace function public.at_tarifario_matriz(p_facility_id uuid default null)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'zonas', coalesce((
      select json_agg(json_build_object('id', z.id, 'name', z.name, 'sort_order', z.sort_order)
             order by z.sort_order)
      from public.at_zones z
      where z.active and z.facility_id = coalesce(
        p_facility_id, public.at_my_facility(),
        (select id from public.at_facilities where is_default limit 1))
    ), '[]'::json),
    'tarifas', coalesce((
      select json_agg(json_build_object(
        'origin_zone_id', r.origin_zone_id,
        'dest_zone_id', r.dest_zone_id,
        'delivery_rate', r.delivery_rate))
      from public.at_zone_pair_rates r
      join public.at_zones o on o.id = r.origin_zone_id
      where o.facility_id = coalesce(
        p_facility_id, public.at_my_facility(),
        (select id from public.at_facilities where is_default limit 1))
    ), '[]'::json)
  )
  where public.at_is_ops()
$$;

revoke execute on function public.at_tarifario_matriz(uuid) from public, anon;
grant execute on function public.at_tarifario_matriz(uuid) to authenticated;

create or replace function public.at_set_tarifa_par(
  p_origin_zone_id uuid,
  p_dest_zone_id uuid,
  p_delivery_rate numeric
)
returns public.at_zone_pair_rates
language plpgsql security definer set search_path = public
as $$
declare
  v_out public.at_zone_pair_rates;
  v_facility uuid;
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;
  if p_delivery_rate < 0 then raise exception 'La tarifa no puede ser negativa'; end if;

  select facility_id into v_facility from public.at_zones where id = p_origin_zone_id;
  if not public.at_puede_ver_facility(v_facility) then
    raise exception 'Esa zona no pertenece a tu CEDI';
  end if;
  if v_facility is distinct from (select facility_id from public.at_zones where id = p_dest_zone_id) then
    raise exception 'Las dos zonas tienen que ser del mismo CEDI';
  end if;

  insert into public.at_zone_pair_rates (origin_zone_id, dest_zone_id, delivery_rate, updated_by)
  values (p_origin_zone_id, p_dest_zone_id, p_delivery_rate, auth.uid())
  on conflict (origin_zone_id, dest_zone_id) do update set
    delivery_rate = excluded.delivery_rate,
    updated_at = now(),
    updated_by = auth.uid()
  returning * into v_out;

  return v_out;
end $$;

revoke execute on function public.at_set_tarifa_par(uuid, uuid, numeric) from public, anon;
grant execute on function public.at_set_tarifa_par(uuid, uuid, numeric) to authenticated;
