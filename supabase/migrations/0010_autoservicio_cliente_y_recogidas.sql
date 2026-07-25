-- A TIEMPO LOGÍSTICA — autoservicio del cliente y recogidas como solicitud al CEDI
--
-- Elimina el bloqueo "tu cuenta no está enlazada a un comercio": si el usuario
-- tiene rol cliente, su comercio se crea solo a partir de los datos que ya dio
-- al registrarse. Nadie queda esperando a que un admin lo enlace a mano.
--
-- Además, la recogida deja de ser un formulario suelto: es una solicitud al CEDI
-- que arrastra los datos del comercio, las guías concretas que se van a recoger
-- y la hora deseada.

-- ── 1. Hora deseada de recogida ─────────────────────────────────────────
alter table public.at_pickups
  add column if not exists scheduled_time time;

comment on column public.at_pickups.scheduled_time is
  'Hora deseada de recogida en el comercio. requested_at guarda cuándo se hizo la solicitud.';

-- ── 2. Autoaprovisionamiento del comercio del cliente ───────────────────
-- Al aprobar la solicitud de registro, la migración 0006 limpia los campos
-- business_*, así que el nombre del comercio se toma de ahí si existe y si no
-- del nombre del perfil (que en la práctica es la razón social del e-commerce).
create or replace function public.at_ensure_my_client()
returns public.at_clients
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.at_profiles;
  v_client public.at_clients;
  v_nombre text;
begin
  if v_uid is null then raise exception 'No autorizado'; end if;

  select * into v_profile from public.at_profiles where id = v_uid;
  if not found then raise exception 'Perfil no encontrado'; end if;

  if v_profile.role <> 'cliente' then
    raise exception 'Solo una cuenta de cliente e-commerce tiene comercio propio';
  end if;

  -- Ya enlazado: no se toca nada.
  if v_profile.client_id is not null then
    select * into v_client from public.at_clients where id = v_profile.client_id;
    if found then return v_client; end if;
  end if;

  v_nombre := coalesce(
    nullif(trim(v_profile.business_name), ''),
    nullif(trim(v_profile.full_name), ''),
    'Comercio sin nombre'
  );

  -- Reusa un comercio con la misma razón social antes de crear un duplicado.
  select * into v_client from public.at_clients
  where public.at_norm(business_name) = public.at_norm(v_nombre)
  limit 1;

  if not found then
    insert into public.at_clients (business_name, nit, address, phone, contact_name)
    values (v_nombre,
            nullif(trim(v_profile.business_nit), ''),
            nullif(trim(v_profile.business_address), ''),
            nullif(trim(v_profile.phone), ''),
            nullif(trim(v_profile.full_name), ''))
    returning * into v_client;
  end if;

  update public.at_profiles set client_id = v_client.id where id = v_uid;

  return v_client;
end $$;

revoke execute on function public.at_ensure_my_client() from public, anon;
grant execute on function public.at_ensure_my_client() to authenticated;

-- ── 3. El cliente edita los datos de contacto de SU comercio ────────────
-- Solo campos seguros: nunca tarifas, ciclo de facturación ni estado activo.
create or replace function public.at_update_my_business(
  p_business_name text,
  p_nit           text default null,
  p_address       text default null,
  p_phone         text default null,
  p_contact_name  text default null
)
returns public.at_clients
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_out public.at_clients;
begin
  if v_role is null or v_role <> 'cliente' then raise exception 'No autorizado'; end if;
  if v_client is null then raise exception 'Tu cuenta todavía no tiene comercio'; end if;
  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'El nombre del comercio es obligatorio';
  end if;

  update public.at_clients set
    business_name = trim(p_business_name),
    nit          = coalesce(nullif(trim(p_nit), ''), nit),
    address      = coalesce(nullif(trim(p_address), ''), address),
    phone        = coalesce(nullif(trim(p_phone), ''), phone),
    contact_name = coalesce(nullif(trim(p_contact_name), ''), contact_name)
  where id = v_client
  returning * into v_out;

  return v_out;
end $$;

revoke execute on function public.at_update_my_business(text, text, text, text, text) from public, anon;
grant execute on function public.at_update_my_business(text, text, text, text, text) to authenticated;

-- ── 4. Recogida = solicitud al CEDI con guías asociadas ─────────────────
-- El cliente no puede hacer UPDATE sobre at_guides (política "ops edita guías"),
-- por eso enlazar las guías a la recogida tiene que pasar por esta función.
create or replace function public.at_request_pickup(
  p_scheduled_date date,
  p_scheduled_time time    default null,
  p_address        text    default null,
  p_contact_name   text    default null,
  p_contact_phone  text    default null,
  p_notes          text    default null,
  p_guide_ids      uuid[]  default '{}'
)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.at_role := public.at_my_role();
  v_client uuid := public.at_my_client();
  v_pickup public.at_pickups;
  v_address text;
  v_ajenas int;
begin
  if v_role is null or v_role in ('pendiente','mensajero') then
    raise exception 'No autorizado';
  end if;
  if v_role = 'cliente' and v_client is null then
    raise exception 'Tu cuenta todavía no tiene comercio';
  end if;
  if v_client is null then
    raise exception 'Selecciona el comercio que solicita la recogida';
  end if;

  -- Ninguna guía puede pertenecer a otro comercio.
  select count(*) into v_ajenas
  from public.at_guides g
  where g.id = any(p_guide_ids) and g.client_id is distinct from v_client;
  if v_ajenas > 0 then
    raise exception 'Hay % guía(s) que no pertenecen a tu comercio', v_ajenas;
  end if;

  v_address := coalesce(
    nullif(trim(p_address), ''),
    (select nullif(trim(address), '') from public.at_clients where id = v_client)
  );
  if v_address is null then
    raise exception 'Indica la dirección donde debemos recoger';
  end if;

  insert into public.at_pickups
    (client_id, scheduled_date, scheduled_time, address, contact_name, contact_phone, notes, status, created_by)
  values
    (v_client, coalesce(p_scheduled_date, current_date), p_scheduled_time, v_address,
     nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''),
     nullif(trim(p_notes), ''), 'pendiente', auth.uid())
  returning * into v_pickup;

  -- Solo guías todavía sin recoger y sin otra recogida asociada.
  update public.at_guides g
  set pickup_id = v_pickup.id
  where g.id = any(p_guide_ids)
    and g.client_id = v_client
    and g.status = 'creada'
    and g.pickup_id is null;

  return v_pickup;
end $$;

revoke execute on function public.at_request_pickup(date, time, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.at_request_pickup(date, time, text, text, text, text, uuid[]) to authenticated;

-- ── 5. Un cliente debe poder crear su primera recogida ──────────────────
-- La política de insert exigía status 'pendiente' explícito; la RPC ya lo fija,
-- pero se deja la política coherente para inserciones directas del propio dueño.
drop policy if exists "cliente solicita recogida propia" on public.at_pickups;
create policy "cliente solicita recogida propia" on public.at_pickups
  for insert to authenticated
  with check (
    (public.at_my_role() = 'cliente' and client_id = public.at_my_client() and status = 'pendiente')
    or public.at_is_staff()
  );
