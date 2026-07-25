-- A TIEMPO LOGÍSTICA — permite el autoaprovisionamiento sin abrir un hueco
--
-- at_ensure_my_client() no podía enlazar el comercio: el trigger antiescalada
-- at_guard_profile_role bloquea cualquier cambio de client_id que no venga de un
-- admin, y SECURITY DEFINER no cambia auth.uid(), así que el guard igual se
-- disparaba.
--
-- POR QUÉ NO SE RELAJA EL GUARD A SECAS: si simplemente permitiéramos
-- "el usuario puede fijar su propio client_id cuando lo tiene en NULL", cualquier
-- cliente podría hacer un PATCH directo sobre at_profiles apuntando al comercio
-- de OTRO y pasaría a leerle guías, facturas y destinatarios. La política de
-- update sobre at_profiles permite editar el perfil propio.
--
-- SOLUCIÓN: la excepción se ata a un flag de transacción que solo fija
-- at_ensure_my_client(), que es quien decide a qué comercio se enlaza. El flag
-- lleva el uuid exacto autorizado, así que aunque alguien lograra activarlo no
-- serviría para enlazarse a un comercio distinto. set_config() vive en
-- pg_catalog, no en el esquema expuesto por PostgREST, así que no es invocable
-- desde la API.

create or replace function public.at_guard_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  -- Autoaprovisionamiento válido: es mi propio perfil, no tenía comercio,
  -- el comercio destino es exactamente el que autorizó at_ensure_my_client,
  -- y no se está tocando ni el rol ni el estado activo.
  v_autoprovision boolean :=
        old.client_id is null
    and new.client_id is not null
    and new.id = auth.uid()
    and new.role   is not distinct from old.role
    and new.active is not distinct from old.active
    and coalesce(current_setting('at.self_provision', true), '') = new.client_id::text;
begin
  if (new.role is distinct from old.role
      or new.client_id is distinct from old.client_id
      or new.active is distinct from old.active)
     and coalesce(public.at_my_role(),'pendiente') <> 'admin'
     and auth.uid() is not null
     and not v_autoprovision then
    raise exception 'Solo un administrador puede cambiar rol, cliente o estado activo';
  end if;
  return new;
end $$;

revoke execute on function public.at_guard_profile_role() from public, anon, authenticated;

-- at_ensure_my_client ahora abre el flag justo antes de enlazar, y lo cierra
-- enseguida para que no quede vivo el resto de la transacción.
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
    insert into public.at_clients (business_name, nit, address, phone, contact_name)
    values (v_nombre,
            nullif(trim(v_profile.business_nit), ''),
            nullif(trim(v_profile.business_address), ''),
            nullif(trim(v_profile.phone), ''),
            nullif(trim(v_profile.full_name), ''))
    returning * into v_client;
  end if;

  perform set_config('at.self_provision', v_client.id::text, true);
  update public.at_profiles set client_id = v_client.id where id = v_uid;
  perform set_config('at.self_provision', '', true);

  return v_client;
end $$;

revoke execute on function public.at_ensure_my_client() from public, anon;
grant execute on function public.at_ensure_my_client() to authenticated;
