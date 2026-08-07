-- A TIEMPO LOGÍSTICA — el comercio tiene municipio propio, y de ahí sale su zona.
--
-- El precio de cada domicilio se calcula entre la zona del comercio y la del
-- destinatario. Pero el comercio no tenía dónde decir en qué municipio está:
-- el formulario de Clientes lo venía pegando al final de la dirección
-- ("Cl 10 #43E-31 · Sabaneta"), y así no sirve para nada — at_zone_for_city
-- no lo lee, la siguiente edición de la dirección lo borra, y en la etiqueta
-- de una recogida sale un " · Sabaneta" que nadie escribió.
--
-- Con columna propia, la zona se deduce sola al registrarse y ya no depende de
-- que alguien se acuerde de elegirla a mano.

-- ── 1. La columna ─────────────────────────────────────────────────────────
alter table public.at_clients
  add column if not exists city text;

comment on column public.at_clients.city is
  'Municipio donde está el comercio. De aquí sale su zona de origen, y de la zona el precio de cada domicilio.';

alter table public.at_profiles
  add column if not exists business_city text;

comment on column public.at_profiles.business_city is
  'Municipio que declaró el comercio al registrarse. Se copia a at_clients cuando se le crea el comercio.';

-- Rescata el municipio que quedó pegado a la dirección con " · ", y devuelve
-- la dirección a como debía estar.
update public.at_clients
set city    = nullif(trim(split_part(address, ' · ', 2)), ''),
    address = nullif(trim(split_part(address, ' · ', 1)), '')
where address like '%' || ' · ' || '%';

-- ── 2. La zona se deduce sola ─────────────────────────────────────────────
-- Solo rellena cuando está vacía. Si ops eligió una zona a mano, manda esa:
-- puede haber razones que la dirección no cuenta (el comercio despacha desde
-- una bodega distinta, se le respeta una zona por acuerdo comercial). Que un
-- cambio de dirección le mueva el precio por debajo sería peor que el hueco.
create or replace function public.at_zona_del_comercio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.zone_id is null then
    new.zone_id := public.at_zone_for_city(
      coalesce(new.city, '') || ' ' || coalesce(new.address, '')
    );
  end if;
  return new;
end $$;

drop trigger if exists at_zona_del_comercio_trg on public.at_clients;
create trigger at_zona_del_comercio_trg
  before insert or update of city, address on public.at_clients
  for each row execute function public.at_zona_del_comercio();

comment on function public.at_zona_del_comercio() is
  'Deduce la zona de origen del comercio a partir de su municipio y dirección, sin pisar nunca una zona elegida a mano.';

-- ── 3. El municipio viaja desde el registro hasta el comercio ─────────────
-- Son las tres puertas por donde nace un comercio. Cambia una sola línea en
-- cada una: el municipio entra al insert. La zona no se toca aquí, la pone el
-- trigger de arriba, así que no hay tres copias de la misma regla.

create or replace function public.at_ensure_my_client()
returns public.at_clients
language plpgsql security definer set search_path = public
as $function$
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

  if v_profile.client_id is not null then
    select * into v_client from public.at_clients where id = v_profile.client_id;
    if found then return v_client; end if;
  end if;

  v_nombre := coalesce(
    nullif(trim(v_profile.business_name), ''),
    nullif(trim(v_profile.full_name), ''),
    'Comercio sin nombre'
  );

  select * into v_client from public.at_clients
  where public.at_norm(business_name) = public.at_norm(v_nombre)
  limit 1;

  if not found then
    insert into public.at_clients (business_name, nit, address, city, phone, contact_name)
    values (v_nombre,
            nullif(trim(v_profile.business_nit), ''),
            nullif(trim(v_profile.business_address), ''),
            nullif(trim(v_profile.business_city), ''),
            nullif(trim(v_profile.phone), ''),
            nullif(trim(v_profile.full_name), ''))
    returning * into v_client;
  end if;

  perform set_config('at.self_provision', v_client.id::text, true);
  update public.at_profiles set client_id = v_client.id where id = v_uid;
  perform set_config('at.self_provision', '', true);

  return v_client;
end $function$;

create or replace function public.at_autocreate_client()
returns trigger
language plpgsql security definer set search_path = public
as $function$
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

  select * into v_client from public.at_clients
  where public.at_norm(business_name) = public.at_norm(v_nombre)
  limit 1;

  if not found then
    insert into public.at_clients (business_name, nit, address, city, phone, contact_name)
    values (v_nombre,
            nullif(trim(new.business_nit), ''),
            nullif(trim(new.business_address), ''),
            nullif(trim(new.business_city), ''),
            nullif(trim(new.phone), ''),
            nullif(trim(new.full_name), ''))
    returning * into v_client;
  end if;

  new.client_id := v_client.id;
  return new;
end $function$;

create or replace function public.at_activate_on_confirm()
returns trigger
language plpgsql security definer set search_path = public
as $function$
declare
  v_profile public.at_profiles;
  v_client  public.at_clients;
  v_nombre  text;
  v_admin   record;
begin
  select * into v_profile from public.at_profiles where id = new.id;
  if not found then return new; end if;

  if v_profile.role <> 'pendiente' or v_profile.requested_role is null then
    return new;
  end if;

  if v_profile.requested_role not in ('cliente','mensajero') then
    for v_admin in
      select id from public.at_profiles where role = 'admin' and active
    loop
      insert into public.at_notifications (user_id, title, body, link)
      values (
        v_admin.id,
        'Solicitud de acceso como personal',
        coalesce(nullif(trim(v_profile.full_name),''), 'Alguien')
          || ' confirmó su correo y espera aprobación como '
          || v_profile.requested_role,
        '/usuarios'
      );
    end loop;
    return new;
  end if;

  if v_profile.requested_role = 'cliente' then
    v_nombre := coalesce(
      nullif(trim(v_profile.business_name), ''),
      nullif(trim(v_profile.full_name), ''),
      'Comercio sin nombre'
    );

    select * into v_client from public.at_clients
    where public.at_norm(business_name) = public.at_norm(v_nombre)
    limit 1;

    if not found then
      insert into public.at_clients (business_name, nit, address, city, phone, contact_name)
      values (v_nombre,
              nullif(trim(v_profile.business_nit), ''),
              nullif(trim(v_profile.business_address), ''),
              nullif(trim(v_profile.business_city), ''),
              nullif(trim(v_profile.phone), ''),
              nullif(trim(v_profile.full_name), ''))
      returning * into v_client;
    end if;
  end if;

  perform set_config('at.email_confirm', new.id::text, true);
  update public.at_profiles set
    role           = v_profile.requested_role,
    requested_role = null,
    client_id      = coalesce(v_client.id, client_id),
    active         = true,
    courier_type   = case when v_profile.requested_role = 'mensajero'
                          then 'colaborativo'::public.at_courier_type
                          else courier_type end
  where id = new.id;
  perform set_config('at.email_confirm', '', true);

  if v_profile.requested_role = 'mensajero' then
    insert into public.at_notifications (user_id, title, body, link)
    values (new.id, 'Sube tus documentos',
            'Tu cuenta está lista. Para empezar a recibir entregas, sube tu cédula, licencia y los papeles de tu vehículo.',
            '/mi-perfil');

    for v_admin in
      select id from public.at_profiles where role = 'admin' and active
    loop
      insert into public.at_notifications (user_id, title, body, link)
      values (v_admin.id, 'Nuevo mensajero por verificar',
              coalesce(nullif(trim(v_profile.full_name),''), 'Alguien')
                || ' se registró como mensajero y va a subir sus documentos.',
              '/mensajeros');
    end loop;
  else
    insert into public.at_notifications (user_id, title, body, link)
    values (new.id, '¡Tu cuenta ya está activa!',
            'Ya puedes crear guías y solicitar recogidas.', '/dashboard');
  end if;

  return new;
exception when others then
  return new;
end $function$;

-- ── 4. El comercio corrige su propia ubicación ────────────────────────────
-- Aparte de at_update_my_business, igual que se hizo con los links en 0043:
-- ese formulario ya existe y sus llamadas también, y su firma es de las que
-- rompen si se les agrega un parámetro.
create or replace function public.at_update_my_location(
  p_city    text,
  p_address text default null
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
  if coalesce(trim(p_city), '') = '' then
    raise exception 'Dinos en qué municipio estás: de ahí sale el precio de tus domicilios';
  end if;

  update public.at_clients set
    city    = trim(p_city),
    address = coalesce(nullif(trim(p_address), ''), address)
  where id = v_client
  returning * into v_out;

  return v_out;
end $$;

revoke execute on function public.at_update_my_location(text, text) from public, anon;
grant execute on function public.at_update_my_location(text, text) to authenticated;

-- ── 5. A los que ya están ─────────────────────────────────────────────────
-- Un empujón sobre los que tienen dirección con barrio reconocible y siguen
-- sin zona. A los demás no se les inventa: la zona decide cuánto se le cobra
-- a un negocio real, y una zona adivinada es una factura equivocada. Quedan
-- marcados en la lista de Clientes para que se corrijan mirándolos.
update public.at_clients c
set zone_id = public.at_zone_for_city(coalesce(c.city,'') || ' ' || coalesce(c.address,''))
where c.zone_id is null
  and public.at_zone_for_city(coalesce(c.city,'') || ' ' || coalesce(c.address,'')) is not null;
