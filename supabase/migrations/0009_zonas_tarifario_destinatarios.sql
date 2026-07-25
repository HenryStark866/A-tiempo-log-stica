-- A TIEMPO LOGÍSTICA — tarifario V2 por zona, destinatarios predeterminados
-- del cliente y cierre de una fuga de datos hacia el rol cliente.
--
-- Fuente del tarifario: "Modelo Financiero y Flota de Domiciliarios V2", sección 4.
-- Decisión de diseño importante: la tarifa que se le COBRA al cliente vive en
-- at_zones (catálogo legible por todos), pero lo que se le PAGA al domiciliario
-- vive en at_zone_costs, con RLS de solo-staff. Si ambos vivieran en la misma
-- tabla, cualquier cliente podría leer el margen bruto de la operación.

-- ── 1. Catálogo de zonas con tarifa ──────────────────────────────────────
alter table public.at_zones
  add column if not exists coverage      text,
  add column if not exists delivery_rate numeric(12,2) not null default 0,
  add column if not exists sort_order    int not null default 0;

comment on column public.at_zones.coverage is 'Municipios/sectores cubiertos, separados por coma. Se usa para autoasignar zona.';
comment on column public.at_zones.delivery_rate is 'Tarifa cobrada al e-commerce por entrega (COP). Modelo V2.';

-- ── 2. Costo interno por zona (NO visible para el cliente) ───────────────
create table if not exists public.at_zone_costs (
  zone_id     uuid primary key references public.at_zones(id) on delete cascade,
  courier_fee numeric(12,2) not null default 4000,
  updated_at  timestamptz not null default now()
);

comment on table public.at_zone_costs is
  'Pago al domiciliario por entrega. Separada de at_zones para que el rol cliente no pueda leer el margen.';

alter table public.at_zone_costs enable row level security;

drop policy if exists "staff lee costos de zona" on public.at_zone_costs;
create policy "staff lee costos de zona" on public.at_zone_costs
  for select to authenticated
  using (public.at_is_staff());

drop policy if exists "ops administra costos de zona" on public.at_zone_costs;
create policy "ops administra costos de zona" on public.at_zone_costs
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── 3. Carga del tarifario V2 (reemplaza el catálogo anterior) ──────────
-- Las guías referencian zone_id con ON DELETE SET NULL y at_profiles también,
-- así que borrar el catálogo viejo no rompe filas existentes.
delete from public.at_zones;

with nuevas(name, coverage, delivery_rate, courier_fee, sort_order) as (
  values
    ('Zona 1 · Sur Metropolitano',   'Envigado, Sabaneta, Itagüí, La Estrella',            11500::numeric, 4000::numeric, 1),
    ('Zona 2 · Centro Sur Medellín', 'El Poblado, Guayabal, Belén, Laureles, La América',  12500::numeric, 4000::numeric, 2),
    ('Zona 3 · Centro Norte / Bello','Centro, Robledo, Aranjuez, Manrique, Castilla, Bello',15000::numeric, 4000::numeric, 3),
    ('Zona 4 · Norte Extendido',     'Copacabana, Girardota',                              20000::numeric, 4000::numeric, 4),
    ('Zona 5 · Sur Extendido',       'Caldas, San Antonio de Prado',                       14000::numeric, 4000::numeric, 5)
),
ins as (
  insert into public.at_zones (name, description, coverage, delivery_rate, sort_order, active)
  select name, coverage, coverage, delivery_rate, sort_order, true from nuevas
  returning id, name
)
insert into public.at_zone_costs (zone_id, courier_fee)
select ins.id, nuevas.courier_fee from ins join nuevas on nuevas.name = ins.name;

-- ── 4. Normalización y autoasignación de zona por ciudad/sector ─────────
create or replace function public.at_norm(p text)
returns text language sql immutable set search_path = public
as $$ select lower(translate(coalesce(p,''), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuAEIOUUnN')) $$;

-- Devuelve la zona cuya cobertura menciona la ciudad/sector recibido.
create or replace function public.at_zone_for_city(p_text text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select z.id
  from public.at_zones z
  where z.active
    and exists (
      select 1
      from unnest(string_to_array(coalesce(z.coverage,''), ',')) as m(sector)
      where length(trim(m.sector)) > 0
        and public.at_norm(p_text) like '%' || public.at_norm(trim(m.sector)) || '%'
    )
  order by z.sort_order
  limit 1
$$;

revoke execute on function public.at_zone_for_city(text) from public, anon;
grant execute on function public.at_zone_for_city(text) to authenticated;

-- ── 5. Destinatarios predeterminados del cliente ────────────────────────
-- El e-commerce sincroniza su propia base de compradores para no volver a
-- digitar nombre/teléfono/dirección en cada guía.
create table if not exists public.at_recipients (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.at_clients(id) on delete cascade,
  external_id  text,                       -- id del comprador en el sistema del cliente
  full_name    text not null,
  phone        text,
  address      text not null,
  city         text not null default 'Medellín',
  zone_id      uuid references public.at_zones(id) on delete set null,
  notes        text,
  times_used   int not null default 0,
  last_used_at timestamptz,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Clave de re-sincronización: si el cliente vuelve a subir su base, los que ya
-- existen se actualizan en vez de duplicarse.
create unique index if not exists at_recipients_client_external_idx
  on public.at_recipients (client_id, external_id)
  where external_id is not null;

-- Sin external_id, la identidad es nombre+dirección normalizados.
create unique index if not exists at_recipients_client_natural_idx
  on public.at_recipients (client_id, public.at_norm(full_name), public.at_norm(address))
  where external_id is null;

create index if not exists at_recipients_client_idx on public.at_recipients (client_id, active);

drop trigger if exists at_recipients_touch on public.at_recipients;
create trigger at_recipients_touch before update on public.at_recipients
  for each row execute function public.at_touch_updated_at();

alter table public.at_recipients enable row level security;

drop policy if exists "cliente administra sus destinatarios" on public.at_recipients;
create policy "cliente administra sus destinatarios" on public.at_recipients
  for all to authenticated
  using (client_id = public.at_my_client())
  with check (client_id = public.at_my_client());

drop policy if exists "staff lee destinatarios" on public.at_recipients;
create policy "staff lee destinatarios" on public.at_recipients
  for select to authenticated
  using (public.at_is_staff());

drop policy if exists "ops administra destinatarios" on public.at_recipients;
create policy "ops administra destinatarios" on public.at_recipients
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── 6. Sincronización masiva de destinatarios (upsert por lote) ─────────
-- Recibe un JSON array desde el importador de CSV y devuelve el conteo de
-- creados/actualizados. La zona se autoasigna por ciudad si no viene.
create or replace function public.at_sync_recipients(p_rows jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_creados int := 0;
  v_actualizados int := 0;
  v_omitidos int := 0;
  r jsonb;
  v_name text; v_addr text; v_city text; v_ext text;
  v_existing uuid;
begin
  if v_role is null or v_client is null then
    raise exception 'Tu cuenta no está enlazada a un comercio. Pide al administrador que la enlace antes de sincronizar.';
  end if;
  if v_role <> 'cliente' and not public.at_is_ops() then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato inválido: se esperaba una lista de destinatarios';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(r->>'full_name'), '');
    v_addr := nullif(trim(r->>'address'), '');
    v_city := coalesce(nullif(trim(r->>'city'), ''), 'Medellín');
    v_ext  := nullif(trim(r->>'external_id'), '');

    -- Sin nombre o sin dirección la fila no sirve para crear una guía.
    if v_name is null or v_addr is null then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_ext is not null then
      select id into v_existing from public.at_recipients
      where client_id = v_client and external_id = v_ext;
    else
      select id into v_existing from public.at_recipients
      where client_id = v_client and external_id is null
        and public.at_norm(full_name) = public.at_norm(v_name)
        and public.at_norm(address) = public.at_norm(v_addr);
    end if;

    if v_existing is null then
      insert into public.at_recipients (client_id, external_id, full_name, phone, address, city, zone_id, notes)
      values (v_client, v_ext, v_name, nullif(trim(r->>'phone'),''), v_addr, v_city,
              public.at_zone_for_city(v_city || ' ' || v_addr), nullif(trim(r->>'notes'),''));
      v_creados := v_creados + 1;
    else
      update public.at_recipients set
        full_name = v_name,
        phone     = coalesce(nullif(trim(r->>'phone'),''), phone),
        address   = v_addr,
        city      = v_city,
        zone_id   = coalesce(public.at_zone_for_city(v_city || ' ' || v_addr), zone_id),
        notes     = coalesce(nullif(trim(r->>'notes'),''), notes),
        active    = true
      where id = v_existing;
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  return json_build_object('creados', v_creados, 'actualizados', v_actualizados, 'omitidos', v_omitidos);
end $$;

revoke execute on function public.at_sync_recipients(jsonb) from public, anon;
grant execute on function public.at_sync_recipients(jsonb) to authenticated;

-- ── 7. Fuga de datos: el cliente veía cierres de caja de toda la empresa ──
-- 'settlements_pending' no filtraba por cliente, así que el dashboard de cada
-- e-commerce mostraba el conteo global de cierres de caja de la operación.
create or replace function public.at_dashboard_kpis()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_es_cliente boolean := public.at_my_role() = 'cliente';
  result json;
begin
  if not (public.at_is_staff() or public.at_my_role() = 'cliente') then
    raise exception 'No autorizado';
  end if;

  select json_build_object(
    'by_status', (
      select coalesce(json_object_agg(status, n), '{}'::json)
      from (select status, count(*) n from public.at_guides
            where v_client is null or client_id = v_client group by status) s
    ),
    'guides_today', (
      select count(*) from public.at_guides
      where created_at::date = current_date and (v_client is null or client_id = v_client)
    ),
    'delivered_today', (
      select count(*) from public.at_guides
      where delivered_at::date = current_date and (v_client is null or client_id = v_client)
    ),
    'ltr_hours', (
      select round(avg(extract(epoch from (picked_up_at - created_at)) / 3600)::numeric, 1)
      from public.at_guides
      where picked_up_at is not null and created_at > now() - interval '30 days'
        and (v_client is null or client_id = v_client)
    ),
    'tli_pct', (
      select round(100.0 * count(*) filter (where status = 'devuelta')
             / nullif(count(*) filter (where status in ('entregada','devuelta')), 0), 1)
      from public.at_guides
      where created_at > now() - interval '30 days' and (v_client is null or client_id = v_client)
    ),
    'cod_pending', (
      select coalesce(sum(cod_amount),0) from public.at_guides
      where is_cod and status = 'entregada' and settlement_id is null
        and (v_client is null or client_id = v_client)
    ),
    -- Métrica interna de tesorería: nunca para el cliente.
    'settlements_pending', case when v_es_cliente then 0 else (
      select count(*) from public.at_settlements where status in ('pendiente','consignado')
    ) end,
    'active_couriers', (
      select count(distinct courier_id) from public.at_guides
      where status in ('zonificada','en_ruta') and courier_id is not null
        and (v_client is null or client_id = v_client)
    )
  ) into result;

  return result;
end $$;

revoke execute on function public.at_dashboard_kpis() from public, anon;
grant execute on function public.at_dashboard_kpis() to authenticated;
