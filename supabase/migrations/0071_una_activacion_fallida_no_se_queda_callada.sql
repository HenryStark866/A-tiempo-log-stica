-- A TIEMPO LOGÍSTICA — si una activación falla, que se sepa.
--
-- at_activate_on_confirm es el trigger que corre cuando alguien hace clic en el
-- enlace del correo. Termina en:
--
--     exception when others then return new;
--
-- y eso está bien puesto: el trigger cuelga de auth.users, así que si dejara
-- escapar el error, Supabase no podría marcar el correo como confirmado y la
-- persona quedaría sin poder confirmar NUNCA. Vale más una activación a medias
-- que un correo que no se puede verificar.
--
-- El problema es el silencio. Si el comercio no se llega a crear —un nombre
-- repetido, una restricción, lo que sea—, el usuario ve la pantalla de
-- bienvenida, cree que ya está adentro, y en realidad quedó en 'pendiente'
-- esperando a alguien que no sabe que tiene que hacer nada. Y como el error se
-- tragó, no queda ni rastro en los logs de la aplicación.
--
-- Ahora el error se sigue tragando —eso no cambia— pero antes de devolver, deja
-- un aviso a los administradores con el motivo real de Postgres. La regla que
-- pidió Henry sigue igual: el e-commerce se activa solo al confirmar; los demás
-- esperan aprobación.

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

  -- Personal propio y CEDIs afiliados: el correo queda verificado, pero el
  -- acceso lo abre un administrador. Se queda en 'pendiente' a propósito.
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

  -- El e-commerce queda operando de inmediato: se le crea el comercio y se le
  -- abre el acceso en el mismo paso. No espera a nadie.
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
            'Ya puedes crear pedidos y solicitar recogidas.', '/inicio');
  end if;

  return new;

exception when others then
  -- Se sigue tragando el error para no romper la confirmación del correo, pero
  -- ya no en silencio. El aviso va dentro de su propio bloque: si esto también
  -- falla, lo único que se pierde es el aviso, no la confirmación.
  begin
    insert into public.at_notifications (user_id, title, body, link)
    select a.id, 'Una activación de cuenta falló',
           coalesce(nullif(trim(v_profile.full_name),''), 'Alguien')
             || ' confirmó su correo pero su cuenta no se pudo activar ('
             || coalesce(v_profile.requested_role::text, 'sin rol') || '). '
             || 'Motivo: ' || coalesce(sqlerrm, 'desconocido')
             || '. Hay que activarla a mano.',
           '/usuarios'
    from public.at_profiles a
    where a.role = 'admin' and a.active;
  exception when others then
    null;
  end;
  return new;
end $function$;
