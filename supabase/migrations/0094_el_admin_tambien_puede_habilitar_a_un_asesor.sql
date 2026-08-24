-- ═══════════════════════════════════════════════════════════════════════════
-- EL ADMIN TAMBIÉN PUEDE HABILITAR A UN ASESOR — y hacerlo completo
--
-- Habilitar a un asesor son cinco cosas, no una: ponerle el rol, copiarle el
-- comercio al que pidió entrar, asignarle la sede principal, limpiar la
-- solicitud y avisarle. Eso lo hace at_aprobar_asesor… que solo puede llamar
-- el DUEÑO del comercio.
--
-- El admin aprueba desde la pantalla de Usuarios, y allí se hacía un UPDATE
-- directo que solo tocaba rol, activo y solicitud. El comercio nunca se
-- copiaba. El resultado es un asesor CON rol de asesor y SIN comercio, que
-- entra a la app y no ve absolutamente nada —ni pedidos, ni recogidas, ni
-- productos— porque todo el RLS del comercio cuelga de client_id.
--
-- No es hipotético: le pasó a dos personas, Katerine y Astrid, que quedaron
-- aprobadas y sin poder trabajar. Sus perfiles se repararon a mano al aplicar
-- esta migración.
--
-- Sigue sin ser el camino normal: lo natural es que el dueño confirme que esa
-- persona trabaja con él. Esto es la salida para cuando el dueño no aparece o
-- la solicitud se quedó a medias — soporte, no operación.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_admin_aprobar_asesor(
  p_profile_id uuid,
  p_client_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_perfil  public.at_profiles;
  v_cliente uuid;
begin
  if coalesce(public.at_my_role() = 'admin', false) is not true then
    raise exception 'Solo un administrador puede habilitar asesores desde aquí';
  end if;

  select * into v_perfil from public.at_profiles where id = p_profile_id;
  if not found then
    raise exception 'Esa persona no existe';
  end if;

  -- El comercio indicado manda; si no se indica, el que pidió al registrarse.
  v_cliente := coalesce(p_client_id, v_perfil.requested_client_id, v_perfil.client_id);

  if v_cliente is null then
    raise exception 'Esa persona no dijo a qué comercio pertenece. Indica el comercio.';
  end if;

  if not exists (select 1 from public.at_clients c where c.id = v_cliente and c.active) then
    raise exception 'Ese comercio no existe o está inactivo';
  end if;

  -- El mismo salvoconducto que usa at_aprobar_asesor: sin él, el guardián
  -- at_guard_profile_role rechaza el cambio de rol y de comercio.
  perform set_config('at.aprueba_asesor', p_profile_id::text, true);

  update public.at_profiles set
    role                = 'asesor',
    client_id           = v_cliente,
    -- La sede principal, si el comercio tiene alguna. Un comercio sin sedes
    -- deja al asesor sin sede, que es lo correcto: no hay ninguna a la que
    -- pertenecer.
    site_id             = coalesce(
                            site_id,
                            (select s.id from public.at_client_sites s
                              where s.client_id = v_cliente and s.es_principal and s.active
                              limit 1)),
    requested_role      = null,
    requested_client_id = null,
    active              = true
  where id = p_profile_id;

  perform set_config('at.aprueba_asesor', '', true);

  insert into public.at_notifications (user_id, title, body, link)
  values (p_profile_id, '¡Ya puedes trabajar!',
          'Tu cuenta quedó habilitada. Ya puedes registrar pedidos y solicitar recogidas.',
          '/inicio');
end $function$;

revoke execute on function public.at_admin_aprobar_asesor(uuid, uuid) from public, anon;
grant execute on function public.at_admin_aprobar_asesor(uuid, uuid) to authenticated;
