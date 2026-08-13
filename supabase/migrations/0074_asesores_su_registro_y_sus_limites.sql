-- A TIEMPO LOGÍSTICA — el asesor comercial: cómo entra y hasta dónde llega.
--
-- El asesor se registra solo, dice a qué comercio pertenece, y queda esperando.
-- Quien lo habilita NO somos nosotros: es su jefe, el dueño del comercio, que
-- es el único que sabe si esa persona trabaja ahí. A nosotros no nos consta y
-- no deberíamos estar en esa decisión.
--
-- ── El riesgo que hay que cerrar aquí ────────────────────────────────────
--
-- Para que el asesor pueda trabajar necesita `client_id`, porque es lo que
-- usan las políticas de RLS para saber de qué comercio es cada pedido. Pero
-- ese mismo `client_id` es el que da acceso a las FACTURAS, los PAGOS, las
-- REMESAS DE RECAUDO y los MEDIOS DE PAGO de su jefe. Si se le pone sin más,
-- un asesor recién aprobado entra y ve cuánto factura la empresa, cuánto debe
-- y a qué cuenta le consignan.
--
-- Por eso las políticas del dinero pasan a exigir explícitamente que sea el
-- dueño. No se resuelve escondiendo pantallas: se resuelve en la base, que es
-- donde de verdad se decide quién lee qué.

-- ── Quién es el dueño ────────────────────────────────────────────────────
create or replace function public.at_soy_dueno()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.at_my_role() = 'cliente' $$;

comment on function public.at_soy_dueno() is
  'True solo para el dueño del comercio. El asesor comparte client_id pero no manda.';

revoke execute on function public.at_soy_dueno() from public, anon;
grant execute on function public.at_soy_dueno() to authenticated;

-- ── A qué comercio dice pertenecer quien se registra ─────────────────────
alter table public.at_profiles
  add column if not exists requested_client_id uuid references public.at_clients(id) on delete set null;

comment on column public.at_profiles.requested_client_id is
  'El comercio que eligió un asesor al registrarse. Es una SOLICITUD: no da acceso hasta que el dueño la aprueba.';

-- ── El dinero, solo para el dueño ────────────────────────────────────────
drop policy if exists "ops o cliente dueño lee facturas" on public.at_invoices;
create policy "ops o cliente dueño lee facturas" on public.at_invoices
  for select to authenticated
  using (public.at_is_ops() or (client_id = public.at_my_client() and public.at_soy_dueno()));

drop policy if exists "ops o cliente dueño lee items" on public.at_invoice_items;
create policy "ops o cliente dueño lee items" on public.at_invoice_items
  for select to authenticated
  using (public.at_is_ops() or exists (
    select 1 from public.at_invoices i
    where i.id = invoice_id and i.client_id = public.at_my_client() and public.at_soy_dueno()));

drop policy if exists "ops o cliente dueño lee pagos" on public.at_invoice_payments;
create policy "ops o cliente dueño lee pagos" on public.at_invoice_payments
  for select to authenticated
  using (public.at_is_ops() or exists (
    select 1 from public.at_invoices i
    where i.id = invoice_id and i.client_id = public.at_my_client() and public.at_soy_dueno()));

drop policy if exists "ops o comercio dueño lee remesas" on public.at_cod_remittances;
create policy "ops o comercio dueño lee remesas" on public.at_cod_remittances
  for select to authenticated
  using (public.at_is_ops() or (client_id = public.at_my_client() and public.at_soy_dueno()));

drop policy if exists "cliente administra sus medios de pago" on public.at_payment_methods;
create policy "cliente administra sus medios de pago" on public.at_payment_methods
  for all to authenticated
  using (client_id = public.at_my_client() and public.at_soy_dueno())
  with check (client_id = public.at_my_client() and public.at_soy_dueno());

-- ── El guardia deja pasar la aprobación del jefe ─────────────────────────
-- Mismo patrón que el autoaprovisionamiento: un flag de transacción que lleva
-- el uuid EXACTO del perfil autorizado. Sin el uuid dentro, el flag serviría
-- para cambiarle el rol a cualquiera dentro de la misma transacción.
create or replace function public.at_guard_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $function$
declare
  v_autoprovision boolean :=
        old.client_id is null
    and new.client_id is not null
    and new.id = auth.uid()
    and new.role   is not distinct from old.role
    and new.active is not distinct from old.active
    and coalesce(current_setting('at.self_provision', true), '') = new.client_id::text;

  v_email_confirm boolean :=
    coalesce(current_setting('at.email_confirm', true), '') = new.id::text;

  -- El dueño de un comercio habilitando a su propio asesor.
  v_aprueba_asesor boolean :=
    coalesce(current_setting('at.aprueba_asesor', true), '') = new.id::text;

  v_hay_cambio boolean :=
    new.role is distinct from old.role
    or new.client_id is distinct from old.client_id
    or new.active is distinct from old.active;

  v_lo_hace_admin boolean :=
    auth.uid() is not null and coalesce(public.at_my_role(),'pendiente') = 'admin';
begin
  if v_hay_cambio and not v_lo_hace_admin and auth.uid() is not null
     and not v_autoprovision and not v_email_confirm and not v_aprueba_asesor then
    raise exception 'Solo un administrador puede cambiar rol, cliente o estado activo';
  end if;

  if v_hay_cambio and v_lo_hace_admin and new.id is distinct from auth.uid() then
    perform public.at_log_security_event(
      'cambio_rol_admin', 'info',
      jsonb_build_object(
        'perfil_id', new.id,
        'rol_antes', old.role, 'rol_despues', new.role,
        'cliente_antes', old.client_id, 'cliente_despues', new.client_id,
        'activo_antes', old.active, 'activo_despues', new.active
      )
    );
  end if;

  return new;
end;
$function$;

-- ── El registro trae el comercio elegido ─────────────────────────────────
create or replace function public.at_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $function$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_requested text := v_meta->>'requested_role';
begin
  insert into public.at_profiles (
    id, full_name, phone, role,
    requested_role, business_type, business_name, business_nit, business_address,
    business_city, proposed_city, requested_client_id
  )
  values (
    new.id,
    coalesce(v_meta->>'full_name', ''),
    nullif(v_meta->>'phone', ''),
    'pendiente',
    case when v_requested in ('cliente','mensajero','operario','admin_cedi','asesor')
         then v_requested::public.at_role else null end,
    nullif(v_meta->>'business_type', ''),
    nullif(v_meta->>'business_name', ''),
    nullif(v_meta->>'business_nit', ''),
    nullif(v_meta->>'business_address', ''),
    nullif(v_meta->>'business_city', ''),
    nullif(v_meta->>'proposed_city', ''),
    -- Solo se acepta si el comercio existe: un uuid inventado en el metadata
    -- no debe convertirse en una solicitud contra nada.
    (select c.id from public.at_clients c
      where c.id = nullif(v_meta->>'requested_client_id','')::uuid)
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end $function$;

-- ── Al confirmar el correo, el asesor queda esperando a SU JEFE ──────────
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

  -- El asesor no lo aprueba A Tiempo: lo aprueba el dueño del comercio que
  -- eligió. Se le avisa a él, no a nuestros administradores.
  if v_profile.requested_role = 'asesor' then
    if v_profile.requested_client_id is not null then
      for v_admin in
        select id from public.at_profiles
        where client_id = v_profile.requested_client_id and role = 'cliente' and active
      loop
        insert into public.at_notifications (user_id, title, body, link)
        values (
          v_admin.id,
          'Un asesor quiere unirse a tu equipo',
          coalesce(nullif(trim(v_profile.full_name),''), 'Alguien')
            || ' se registró como asesor de tu comercio y espera que lo habilites.',
          '/mi-equipo'
        );
      end loop;
    end if;
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
            'Ya puedes crear pedidos y solicitar recogidas.', '/inicio');
  end if;

  return new;

exception when others then
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

-- ── Buscar el comercio al registrarse ────────────────────────────────────
-- Se puede llamar sin cuenta, porque quien se registra todavía no tiene una.
-- Por eso pide al menos 3 caracteres, devuelve como mucho 20 y pasa por el
-- mismo freno que el resto de lo público: sin eso, sería una forma cómoda de
-- descargarse la lista de clientes de A Tiempo escribiendo letra por letra.
create or replace function public.at_comercios_para_registro(p_busca text)
returns json
language plpgsql volatile security definer set search_path = public
as $function$
declare v_q text := public.at_norm(coalesce(trim(p_busca), ''));
begin
  if length(v_q) < 3 then
    return '[]'::json;
  end if;

  perform public.at_limitar('busca_comercio', 30, 600);

  return coalesce((
    select json_agg(json_build_object('id', c.id, 'business_name', c.business_name)
                    order by c.business_name)
    from (
      select c.id, c.business_name
      from public.at_clients c
      where c.active and public.at_norm(c.business_name) like '%' || v_q || '%'
      order by c.business_name
      limit 20
    ) c
  ), '[]'::json);
end $function$;

comment on function public.at_comercios_para_registro(text) is
  'Busca comercios por nombre para el registro de un asesor. Mínimo 3 letras y con freno de solicitudes.';

grant execute on function public.at_comercios_para_registro(text) to anon, authenticated;

-- ── El equipo, visto por el dueño ────────────────────────────────────────
create or replace function public.at_mis_asesores()
returns json
language plpgsql stable security definer set search_path = public
as $function$
declare v_client uuid := public.at_my_client();
begin
  if not public.at_soy_dueno() or v_client is null then
    raise exception 'Solo el dueño del comercio ve su equipo';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'id', p.id,
             'full_name', p.full_name,
             'phone', p.phone,
             'estado', case when p.role = 'asesor' and p.active then 'habilitado'
                            when p.role = 'asesor' then 'suspendido'
                            else 'por_aprobar' end,
             'site_id', p.site_id,
             'site_name', s.name,
             'created_at', p.created_at,
             'pedidos', (select count(*) from public.at_guides g where g.created_by = p.id)
           ) order by (p.role = 'pendiente') desc, p.full_name)
    from public.at_profiles p
    left join public.at_client_sites s on s.id = p.site_id
    where (p.client_id = v_client and p.role = 'asesor')
       or (p.requested_client_id = v_client and p.role = 'pendiente'
           and p.requested_role = 'asesor')
  ), '[]'::json);
end $function$;

revoke execute on function public.at_mis_asesores() from public, anon;
grant execute on function public.at_mis_asesores() to authenticated;

-- ── El dueño habilita a su asesor ────────────────────────────────────────
create or replace function public.at_aprobar_asesor(p_profile_id uuid, p_site_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_client uuid := public.at_my_client();
  v_perfil public.at_profiles;
begin
  if not public.at_soy_dueno() or v_client is null then
    raise exception 'Solo el dueño del comercio puede habilitar asesores';
  end if;

  select * into v_perfil from public.at_profiles where id = p_profile_id;
  if not found then raise exception 'Esa persona no existe'; end if;

  -- Que la solicitud sea contra ESTE comercio. Sin esto, un dueño podría
  -- habilitar como suyo a alguien que se registró para otro.
  if v_perfil.requested_client_id is distinct from v_client
     or v_perfil.requested_role is distinct from 'asesor'
     or v_perfil.role <> 'pendiente' then
    raise exception 'Esa solicitud no es de tu comercio o ya fue resuelta';
  end if;

  if p_site_id is not null and not exists (
    select 1 from public.at_client_sites s where s.id = p_site_id and s.client_id = v_client
  ) then
    raise exception 'Esa sede no es de tu comercio';
  end if;

  perform set_config('at.aprueba_asesor', p_profile_id::text, true);
  update public.at_profiles set
    role                = 'asesor',
    client_id           = v_client,
    site_id             = coalesce(p_site_id, (select id from public.at_client_sites
                                               where client_id = v_client and es_principal and active
                                               limit 1)),
    requested_role      = null,
    requested_client_id = null,
    active              = true
  where id = p_profile_id;
  perform set_config('at.aprueba_asesor', '', true);

  insert into public.at_notifications (user_id, title, body, link)
  values (p_profile_id, '¡Ya puedes trabajar!',
          'Tu jefe habilitó tu cuenta. Ya puedes registrar pedidos y solicitar recogidas.',
          '/inicio');
end $function$;

revoke execute on function public.at_aprobar_asesor(uuid, uuid) from public, anon;
grant execute on function public.at_aprobar_asesor(uuid, uuid) to authenticated;

-- ── Y también puede negarse, o suspender a uno que ya estaba ─────────────
create or replace function public.at_rechazar_asesor(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare v_client uuid := public.at_my_client();
begin
  if not public.at_soy_dueno() or v_client is null then
    raise exception 'Solo el dueño del comercio puede hacer esto';
  end if;

  if not exists (
    select 1 from public.at_profiles p
    where p.id = p_profile_id and p.requested_client_id = v_client
      and p.role = 'pendiente' and p.requested_role = 'asesor'
  ) then
    raise exception 'Esa solicitud no es de tu comercio o ya fue resuelta';
  end if;

  -- No se le borra la cuenta: solo se le quita la solicitud. Puede haberse
  -- equivocado de comercio y volver a pedirlo al correcto.
  update public.at_profiles
  set requested_role = null, requested_client_id = null
  where id = p_profile_id;

  insert into public.at_notifications (user_id, title, body, link)
  values (p_profile_id, 'Tu solicitud no fue aprobada',
          'El comercio que elegiste no confirmó que trabajas allí. Si te equivocaste de comercio, vuelve a solicitarlo.',
          '/inicio');
end $function$;

revoke execute on function public.at_rechazar_asesor(uuid) from public, anon;
grant execute on function public.at_rechazar_asesor(uuid) to authenticated;

create or replace function public.at_actualizar_asesor(
  p_profile_id uuid,
  p_site_id uuid default null,
  p_active boolean default null
)
returns void
language plpgsql security definer set search_path = public
as $function$
declare v_client uuid := public.at_my_client();
begin
  if not public.at_soy_dueno() or v_client is null then
    raise exception 'Solo el dueño del comercio puede hacer esto';
  end if;

  if not exists (
    select 1 from public.at_profiles p
    where p.id = p_profile_id and p.client_id = v_client and p.role = 'asesor'
  ) then
    raise exception 'Ese asesor no es de tu comercio';
  end if;

  if p_site_id is not null and not exists (
    select 1 from public.at_client_sites s where s.id = p_site_id and s.client_id = v_client
  ) then
    raise exception 'Esa sede no es de tu comercio';
  end if;

  perform set_config('at.aprueba_asesor', p_profile_id::text, true);
  update public.at_profiles set
    site_id = coalesce(p_site_id, site_id),
    active  = coalesce(p_active, active)
  where id = p_profile_id;
  perform set_config('at.aprueba_asesor', '', true);
end $function$;

revoke execute on function public.at_actualizar_asesor(uuid, uuid, boolean) from public, anon;
grant execute on function public.at_actualizar_asesor(uuid, uuid, boolean) to authenticated;

-- ── Lo que el asesor SÍ puede hacer ──────────────────────────────────────
-- Estas tres trataban 'cliente' como «es alguien de un comercio». Ahora lo son
-- dos roles. No se cambian todas las funciones que dicen 'cliente': solo las
-- de la operación diaria. Las del dinero y las de configuración del negocio se
-- quedan como estaban, que es justo el punto.

create or replace function public.at_pickup_editable(p_pickup_id uuid)
returns at_pickups
language plpgsql security definer set search_path = public
as $function$
declare
  v_pickup public.at_pickups;
  v_role   public.at_role := public.at_my_role();
  v_client uuid;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then
    raise exception 'Esa recogida ya no existe';
  end if;

  if v_role in ('cliente','asesor') then
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
end $function$;

create or replace function public.at_pickup_guides(p_pickup_id uuid)
returns json
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_pickup public.at_pickups;
  v_role   public.at_role := public.at_my_role();
  v_client uuid;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id;
  if not found then raise exception 'Esa recogida ya no existe'; end if;

  if v_role in ('cliente','asesor') then
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
end $function$;

create or replace function public.at_delete_guide(p_guide_id uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide  public.at_guides;
  v_role   public.at_role := public.at_my_role();
  v_client uuid           := public.at_my_client();
begin
  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_guide.status <> 'creada' then
    raise exception 'Este pedido ya fue despachado al CEDI y no se puede eliminar';
  end if;

  if v_role in ('cliente','asesor') and v_guide.client_id is distinct from v_client then
    raise exception 'No tienes permiso para eliminar este pedido';
  elsif v_role not in ('cliente','asesor','admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  delete from public.at_guides where id = p_guide_id;
end $function$;

-- ── Y pedir recogida, que es la otra mitad de su trabajo ─────────────────
create or replace function public.at_request_pickup(
  p_client_id uuid default null,
  p_scheduled_date date default null,
  p_scheduled_time time without time zone default null,
  p_address text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_guide_ids uuid[] default '{}'::uuid[]
)
returns at_pickups
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_client uuid;
  v_pickup public.at_pickups;
  v_address text;
  v_site uuid;
  v_ajenas int;
  v_vencida public.at_invoices;
  v_horas int := extract(epoch from public.at_ciclo_cobro()) / 3600;
begin
  if v_role is null or v_role in ('pendiente','mensajero') then
    raise exception 'No autorizado';
  end if;

  if v_role in ('cliente','asesor') then
    v_client := public.at_my_client();
    if v_client is null then
      raise exception 'Tu cuenta todavía no tiene comercio';
    end if;

    select * into v_vencida
    from public.at_invoices
    where client_id = v_client
      and status in ('borrador','emitida')
      and created_at < now() - public.at_ciclo_cobro()
    order by created_at
    limit 1;

    if found then
      raise exception 'Tienes la factura % sin pagar desde hace más de % horas (%). Reporta el pago y, apenas lo verifiquemos, puedes volver a solicitar recogidas.',
        v_vencida.invoice_number, v_horas, to_char(v_vencida.total, 'FM$999G999G999');
    end if;

    -- La recogida sale de la sede del asesor; el dueño usa la principal.
    v_site := coalesce(
      (select p.site_id from public.at_profiles p where p.id = auth.uid()),
      (select s.id from public.at_client_sites s
        where s.client_id = v_client and s.es_principal and s.active limit 1));
  else
    v_client := p_client_id;
    if v_client is null then
      raise exception 'Selecciona el comercio que solicita la recogida';
    end if;
    if not exists (select 1 from public.at_clients where id = v_client) then
      raise exception 'El comercio indicado no existe';
    end if;
    v_site := (select s.id from public.at_client_sites s
               where s.client_id = v_client and s.es_principal and s.active limit 1);
  end if;

  select count(*) into v_ajenas
  from public.at_guides g
  where g.id = any(p_guide_ids) and g.client_id is distinct from v_client;
  if v_ajenas > 0 then
    raise exception 'Hay % pedido(s) que no pertenecen a ese comercio', v_ajenas;
  end if;

  -- La dirección: la que se indique, si no la de la sede, y si no la del
  -- comercio. Con varias sedes, la del comercio ya no es necesariamente donde
  -- hay que ir a recoger.
  v_address := coalesce(
    nullif(trim(p_address), ''),
    (select nullif(trim(s.address), '') from public.at_client_sites s where s.id = v_site),
    (select nullif(trim(address), '') from public.at_clients where id = v_client)
  );
  if v_address is null then
    raise exception 'Indica la dirección donde debemos recoger';
  end if;

  update public.at_clients set address = v_address
  where id = v_client and coalesce(trim(address), '') = '';

  insert into public.at_pickups
    (client_id, site_id, scheduled_date, scheduled_time, address, contact_name, contact_phone, notes, status, created_by)
  values
    (v_client, v_site, coalesce(p_scheduled_date, current_date), p_scheduled_time, v_address,
     nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''),
     nullif(trim(p_notes), ''), 'pendiente', auth.uid())
  returning * into v_pickup;

  update public.at_guides g set pickup_id = v_pickup.id
  where g.id = any(p_guide_ids) and g.client_id = v_client
    and g.status = 'creada' and g.pickup_id is null;

  return v_pickup;
end $function$;
