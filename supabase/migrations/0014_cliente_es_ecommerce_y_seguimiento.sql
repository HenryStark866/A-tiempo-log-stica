-- A TIEMPO LOGÍSTICA — el cliente ES el e-commerce, y seguimiento en tiempo real
--
-- 1) Desaparece el paso de "vincular usuario a comercio". Todo usuario con rol
--    cliente es un e-commerce, así que su comercio se crea automáticamente por
--    trigger y entra solo a la lista de clientes. Nadie lo enlaza a mano y nadie
--    lo crea desde la administración.
-- 2) El e-commerce puede ver estado y ubicación de sus envíos en tiempo real.

-- ── 1. El comercio se crea solo al quedar en rol cliente ────────────────
-- El trigger se llama at_profiles_autoclient para que corra ANTES de
-- at_profiles_guard (los triggers BEFORE se ejecutan en orden alfabético):
-- así el guard ve el client_id ya puesto y lo valida en el mismo movimiento.
create or replace function public.at_autocreate_client()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_nombre text;
  v_client public.at_clients;
begin
  if new.role <> 'cliente' or new.client_id is not null then
    return new;
  end if;

  v_nombre := coalesce(
    nullif(trim(new.business_name), ''),
    nullif(trim(new.full_name), ''),
    'Comercio sin nombre'
  );

  -- No duplica si ya existe un comercio con esa razón social.
  select * into v_client from public.at_clients
  where public.at_norm(business_name) = public.at_norm(v_nombre)
  limit 1;

  if not found then
    insert into public.at_clients (business_name, nit, address, phone, contact_name)
    values (v_nombre,
            nullif(trim(new.business_nit), ''),
            nullif(trim(new.business_address), ''),
            nullif(trim(new.phone), ''),
            nullif(trim(new.full_name), ''))
    returning * into v_client;
  end if;

  new.client_id := v_client.id;
  return new;
end $$;

revoke execute on function public.at_autocreate_client() from public, anon, authenticated;

drop trigger if exists at_profiles_autoclient on public.at_profiles;
create trigger at_profiles_autoclient
  before insert or update on public.at_profiles
  for each row execute function public.at_autocreate_client();

-- Backfill de las cuentas cliente que hoy están sin comercio: basta con tocar la
-- fila para que at_profiles_autoclient haga el trabajo. Corriendo como migración
-- auth.uid() es NULL, así que el guard antiescalada no se interpone.
update public.at_profiles set updated_at = now()
where role = 'cliente' and client_id is null;

-- ── 2. Nadie crea comercios a mano ──────────────────────────────────────
-- Se quitan los permisos de INSERT: el único camino es el trigger (definer).
-- Ops conserva UPDATE, que es lo que necesita para tarifas y estado.
drop policy if exists "ops administra clientes" on public.at_clients;
create policy "ops actualiza clientes" on public.at_clients
  for update to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

drop policy if exists "ops elimina clientes" on public.at_clients;
create policy "ops elimina clientes" on public.at_clients
  for delete to authenticated
  using (public.at_is_ops());

-- El mensajero ya no da de alta comercios a mano (los e-commerce se registran solos).
drop policy if exists "mensajero crea clientes" on public.at_clients;

-- ── 3. Última posición conocida del mensajero ───────────────────────────
alter table public.at_profiles
  add column if not exists last_lat          double precision,
  add column if not exists last_lng          double precision,
  add column if not exists last_position_at  timestamptz;

comment on column public.at_profiles.last_lat is
  'Última posición reportada por el mensajero. Se expone al cliente solo vía at_my_shipments, nunca leyendo at_profiles.';

create or replace function public.at_report_position(p_lat double precision, p_lng double precision)
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

  update public.at_profiles
  set last_lat = p_lat, last_lng = p_lng, last_position_at = now()
  where id = auth.uid();
end $$;

revoke execute on function public.at_report_position(double precision, double precision) from public, anon;
grant execute on function public.at_report_position(double precision, double precision) to authenticated;

-- ── 4. Seguimiento en tiempo real para el e-commerce ───────────────────
-- Devuelve los envíos activos del comercio con estado y posición del mensajero.
-- Va por RPC porque el cliente NO puede leer at_profiles de terceros: así se
-- expone la posición sin abrir la tabla de perfiles.
create or replace function public.at_my_shipments()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  result json;
begin
  if v_role is null then raise exception 'No autorizado'; end if;
  -- Staff ve todo; el cliente solo lo suyo.
  if v_role = 'cliente' and v_client is null then
    return '[]'::json;
  end if;
  if v_role not in ('cliente','admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  select coalesce(json_agg(t order by t.created_at desc), '[]'::json) into result
  from (
    select g.id,
           g.guide_number,
           g.status,
           g.recipient_name,
           g.recipient_address,
           g.recipient_city,
           g.is_cod,
           g.cod_amount,
           g.delivery_attempts,
           g.created_at,
           g.delivered_at,
           z.name  as zone_name,
           z.delivery_rate,
           c.full_name as courier_name,
           -- La posición solo se entrega mientras el paquete va en ruta.
           case when g.status = 'en_ruta' then c.last_lat end as courier_lat,
           case when g.status = 'en_ruta' then c.last_lng end as courier_lng,
           case when g.status = 'en_ruta' then c.last_position_at end as courier_position_at
    from public.at_guides g
    left join public.at_zones z    on z.id = g.zone_id
    left join public.at_profiles c on c.id = g.courier_id
    where (v_role <> 'cliente' or g.client_id = v_client)
      and g.status in ('creada','recogida','en_cedi','zonificada','en_ruta','novedad','reprogramada','en_devolucion')
    order by g.created_at desc
    limit 200
  ) t;

  return result;
end $$;

revoke execute on function public.at_my_shipments() from public, anon;
grant execute on function public.at_my_shipments() to authenticated;
