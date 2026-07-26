-- A TIEMPO LOGÍSTICA — la cuenta se activa sola al confirmar el correo.
--
-- ANTES: toda persona que se registraba quedaba en rol 'pendiente' y un
-- administrador tenía que aprobarla a mano desde Usuarios.
--
-- AHORA: confirmar el correo ES la verificación para los roles de
-- autoservicio (cliente y mensajero): al hacer clic en el enlace se les asigna
-- su rol real y, si son comercio, se les crea y enlaza su cuenta de cliente.
-- El administrador solo aprueba a quien pide entrar como personal de ATL
-- (operario), porque ahí sí hace falta un ojo humano.
--
-- El rol 'admin' NO es solicitable desde el registro público por diseño: se
-- asigna únicamente desde Usuarios por alguien que ya es admin.

-- ── 1. El guard reconoce la activación por confirmación de correo ───────
-- at_guard_profile_role bloquea cualquier cambio de rol que no venga de un
-- admin. La confirmación del correo la ejecuta GoTrue, no PostgREST, así que
-- auth.uid() viene NULL y el guard ya la dejaría pasar; aun así atamos la
-- excepción a un flag de transacción con el uuid exacto del perfil, para no
-- depender de ese detalle de implementación y que la intención quede explícita.
-- set_config() vive en pg_catalog, fuera del esquema que expone PostgREST, así
-- que el flag no se puede activar desde la API.
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

  -- Activación por confirmación de correo: solo la abre at_activate_on_confirm,
  -- y solo para el perfil cuyo uuid lleva el flag.
  v_email_confirm boolean :=
    coalesce(current_setting('at.email_confirm', true), '') = new.id::text;
begin
  if (new.role is distinct from old.role
      or new.client_id is distinct from old.client_id
      or new.active is distinct from old.active)
     and coalesce(public.at_my_role(),'pendiente') <> 'admin'
     and auth.uid() is not null
     and not v_autoprovision
     and not v_email_confirm then
    raise exception 'Solo un administrador puede cambiar rol, cliente o estado activo';
  end if;
  return new;
end $$;

revoke execute on function public.at_guard_profile_role() from public, anon, authenticated;

-- ── 2. Se admite 'operario' como rol solicitable ───────────────────────
-- Sigue requiriendo aprobación de un admin; lo único que cambia es que ahora
-- se puede pedir desde el registro público en vez de crearlo a mano.
create or replace function public.at_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_requested text := v_meta->>'requested_role';
begin
  insert into public.at_profiles (
    id, full_name, phone, role,
    requested_role, business_type, business_name, business_nit, business_address
  )
  values (
    new.id,
    coalesce(v_meta->>'full_name', ''),
    nullif(v_meta->>'phone', ''),
    'pendiente',
    -- Nunca se acepta 'admin' ni 'coordinador' desde el registro público.
    case when v_requested in ('cliente','mensajero','operario')
         then v_requested::public.at_role else null end,
    nullif(v_meta->>'business_type', ''),
    nullif(v_meta->>'business_name', ''),
    nullif(v_meta->>'business_nit', ''),
    nullif(v_meta->>'business_address', '')
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new; -- nunca bloquear la creación del usuario
end $$;

-- ── 3. Activación al confirmar el correo ───────────────────────────────
create or replace function public.at_activate_on_confirm()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.at_profiles;
  v_client  public.at_clients;
  v_nombre  text;
  v_admin   record;
begin
  select * into v_profile from public.at_profiles where id = new.id;
  if not found then return new; end if;

  -- Solo se activa una vez: si ya dejó de estar pendiente, no se toca nada.
  if v_profile.role <> 'pendiente' or v_profile.requested_role is null then
    return new;
  end if;

  -- Personal de ATL: confirmar el correo NO basta, sigue esperando al admin.
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

  -- Comercio: se le crea o enlaza su cuenta de cliente antes de darle el rol,
  -- para que entre con todo listo y no caiga en una pantalla vacía.
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
      insert into public.at_clients (business_name, nit, address, phone, contact_name)
      values (v_nombre,
              nullif(trim(v_profile.business_nit), ''),
              nullif(trim(v_profile.business_address), ''),
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
    active         = true
  where id = new.id;
  perform set_config('at.email_confirm', '', true);

  insert into public.at_notifications (user_id, title, body, link)
  values (
    new.id,
    '¡Tu cuenta ya está activa!',
    case when v_profile.requested_role = 'cliente'
         then 'Ya puedes crear guías y solicitar recogidas.'
         else 'Ya puedes ver tu ruta y registrar entregas.' end,
    case when v_profile.requested_role = 'cliente' then '/dashboard' else '/entregas' end
  );

  return new;
exception when others then
  return new; -- nunca bloquear la confirmación del correo
end $$;

-- Solo cuando el correo pasa de sin confirmar a confirmado.
drop trigger if exists at_on_auth_user_confirmed on auth.users;
create trigger at_on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.at_activate_on_confirm();
