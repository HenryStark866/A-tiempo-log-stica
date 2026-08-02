-- A TIEMPO LOGÍSTICA — registro de seguridad y auditoría
--
-- Una tabla de solo-inserción para dos cosas distintas que comparten forma:
--   1) acciones sensibles que SÍ se permitieron (quién cambió el rol de
--      quién, quién habilitó o le retiró la habilitación a un mensajero,
--      qué documento se rechazó) — trazabilidad operativa.
--   2) intentos que vale la pena mirar y que sí pueden registrarse desde
--      dentro de la app (credenciales fallidas).
--
-- Por qué NO registra cada RPC rechazado desde dentro de la propia función:
-- un `raise exception` deshace toda la transacción, incluida cualquier fila
-- que esa misma función haya insertado un instante antes de fallar.
-- PostgreSQL no tiene transacciones autónomas sin extensiones adicionales
-- (dblink, pg_background), así que "registrar y aun así bloquear" en el
-- mismo movimiento no es honesto de prometer. Los intentos bloqueados en la
-- UI se registran con una llamada aparte, ya después de que el cliente ve el
-- error — nunca desde dentro de la función que lo rechazó. Para lo que pase
-- por fuera de la UI (alguien pegándole directo a la API con la anon key),
-- la fuente de verdad son los logs de infraestructura de Supabase, no esta
-- tabla.

create table public.at_security_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  event_type  text not null,
  severity    text not null default 'info',
  actor_id    uuid references auth.users(id) on delete set null,
  actor_role  public.at_role,
  detail      jsonb not null default '{}'::jsonb,
  path        text,
  user_agent  text,
  constraint at_security_events_severity_check
    check (severity in ('info','advertencia','critico')),
  constraint at_security_events_event_type_check
    check (event_type in (
      'login_fallido',
      'escalar_rol_bloqueado',
      'cambio_rol_admin',
      'mensajero_habilitado',
      'mensajero_revocado',
      'documento_rechazado'
    ))
);

comment on table public.at_security_events is
  'Registro append-only de acciones sensibles y de intentos en contra del sistema. Nadie tiene UPDATE ni DELETE sobre ella, ni siquiera admin: la única puerta de entrada es at_log_security_event.';

create index at_security_events_created_at_idx on public.at_security_events (created_at desc);
create index at_security_events_event_type_idx on public.at_security_events (event_type);

alter table public.at_security_events enable row level security;

create policy "staff lee el registro de seguridad" on public.at_security_events
  for select to authenticated
  using (public.at_is_ops());

-- Sin política de insert/update/delete para ningún rol: la tabla es
-- append-only incluso para admin. Escribir pasa solo por esta función.
create or replace function public.at_log_security_event(
  p_event_type text,
  p_severity   text default 'info',
  p_detail     jsonb default '{}'::jsonb,
  p_path       text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_detail    jsonb := coalesce(p_detail, '{}'::jsonb);
  v_severity  text := p_severity;
  v_recientes int;
begin
  -- Lista cerrada de tipos: esta función no admite texto libre que después
  -- alguien lea como si fuera un evento real.
  if p_event_type not in (
    'login_fallido','escalar_rol_bloqueado','cambio_rol_admin',
    'mensajero_habilitado','mensajero_revocado','documento_rechazado'
  ) then
    return; -- tipo desconocido: se ignora en silencio
  end if;

  if v_severity not in ('info','advertencia','critico') then
    v_severity := 'info';
  end if;

  -- El detalle no debería pesar nada: limita usar esto como almacenamiento gratis.
  if pg_column_size(v_detail) > 4000 then
    v_detail := jsonb_build_object('truncado', true);
  end if;

  -- Freno simple contra inundar la tabla: si ya hay 20 eventos del mismo
  -- tipo del mismo actor (o, sin sesión, del mismo user_agent) en el último
  -- minuto, no es información nueva.
  select count(*) into v_recientes
  from public.at_security_events
  where event_type = p_event_type
    and created_at > now() - interval '1 minute'
    and (
      (auth.uid() is not null and actor_id = auth.uid())
      or (auth.uid() is null and user_agent is not distinct from p_user_agent)
    );
  if v_recientes >= 20 then
    return;
  end if;

  insert into public.at_security_events (event_type, severity, actor_id, actor_role, detail, path, user_agent)
  values (
    p_event_type, v_severity, auth.uid(),
    case when auth.uid() is not null then public.at_my_role() else null end,
    v_detail, nullif(trim(coalesce(p_path,'')),''), nullif(trim(coalesce(p_user_agent,'')),'')
  );
exception when others then
  -- Un fallo al auditar nunca debe tumbar el flujo real de la app.
  return;
end;
$function$;

revoke all on function public.at_log_security_event(text, text, jsonb, text, text) from public;
grant execute on function public.at_log_security_event(text, text, jsonb, text, text) to anon, authenticated;

-- ── Auditoría de lo que SÍ se permitió: cambio de rol/comercio/estado hecho
-- por un admin sobre OTRA persona. Va dentro de at_guard_profile_role porque
-- ahí ya se decide si el cambio se autoriza: registrar en el mismo trigger
-- evita que alguien se salte el registro llamando por otro camino. El propio
-- autoaprovisionamiento de un usuario (self_provision, email_confirm) no
-- cuenta como "un admin actuó sobre otra persona" y no se registra aquí.
create or replace function public.at_guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

  v_hay_cambio boolean :=
    new.role is distinct from old.role
    or new.client_id is distinct from old.client_id
    or new.active is distinct from old.active;

  v_lo_hace_admin boolean :=
    auth.uid() is not null and coalesce(public.at_my_role(),'pendiente') = 'admin';
begin
  if v_hay_cambio and not v_lo_hace_admin and auth.uid() is not null
     and not v_autoprovision and not v_email_confirm then
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

-- ── Auditoría de habilitación/revocación de mensajeros y de documentos
-- rechazados: quién puede recibir trabajo es una decisión de seguridad, no
-- solo operativa.
create or replace function public.at_verify_courier(
  p_courier_id uuid, p_courier_type public.at_courier_type,
  p_zone_id uuid default null, p_max_capacity int default null
) returns public.at_profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_courier  public.at_profiles;
  v_faltante text;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador habilita mensajeros';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero';
  if not found then raise exception 'Ese usuario no es un mensajero'; end if;

  select string_agg(replace(d.tipo::text, '_', ' '), ', ')
    into v_faltante
  from unnest(public.at_required_courier_docs(p_courier_type)) as d(tipo)
  where not exists (
    select 1 from public.at_courier_documents cd
    where cd.courier_id = p_courier_id
      and cd.doc_type   = d.tipo
      and cd.status     = 'aprobado'
  );

  if v_faltante is not null then
    raise exception 'Faltan documentos aprobados: %', v_faltante;
  end if;

  update public.at_profiles set
    courier_type = p_courier_type,
    zone_id      = coalesce(p_zone_id, zone_id),
    max_capacity = coalesce(p_max_capacity, max_capacity),
    verified_at  = now(),
    verified_by  = auth.uid(),
    active       = true
  where id = p_courier_id
  returning * into v_courier;

  insert into public.at_notifications (user_id, title, body, link)
  values (p_courier_id, 'Ya estás habilitado',
          'Tus documentos fueron aprobados. Ya puedes recibir recogidas y entregas.',
          '/entregas');

  perform public.at_log_security_event(
    'mensajero_habilitado', 'info',
    jsonb_build_object('mensajero_id', p_courier_id, 'courier_type', p_courier_type)
  );

  return v_courier;
end $function$;

create or replace function public.at_revoke_courier(p_courier_id uuid, p_reason text)
returns public.at_profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_courier public.at_profiles;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador retira la habilitación';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Hay que decir por qué se retira la habilitación';
  end if;

  update public.at_profiles
  set verified_at = null, verified_by = null
  where id = p_courier_id and role = 'mensajero'
  returning * into v_courier;

  if not found then raise exception 'Ese usuario no es un mensajero'; end if;

  insert into public.at_notifications (user_id, title, body, link)
  values (p_courier_id, 'Habilitación suspendida', trim(p_reason), '/mi-perfil');

  perform public.at_log_security_event(
    'mensajero_revocado', 'advertencia',
    jsonb_build_object('mensajero_id', p_courier_id, 'motivo', trim(p_reason))
  );

  return v_courier;
end $function$;

create or replace function public.at_review_courier_doc(p_doc_id uuid, p_approved boolean, p_notes text default null)
returns public.at_courier_documents
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc public.at_courier_documents;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador revisa documentos';
  end if;
  if not p_approved and coalesce(trim(p_notes), '') = '' then
    raise exception 'Para rechazar un documento hay que decir por qué';
  end if;

  update public.at_courier_documents set
    status       = case when p_approved then 'aprobado' else 'rechazado' end::public.at_doc_status,
    review_notes = nullif(trim(coalesce(p_notes, '')), ''),
    reviewed_by  = auth.uid(),
    reviewed_at  = now()
  where id = p_doc_id
  returning * into v_doc;

  if not found then raise exception 'Documento no encontrado'; end if;

  if not p_approved then
    insert into public.at_notifications (user_id, title, body, link)
    values (v_doc.courier_id, 'Documento rechazado',
            replace(v_doc.doc_type::text, '_', ' ') || ': ' || v_doc.review_notes,
            '/mi-perfil');

    perform public.at_log_security_event(
      'documento_rechazado', 'info',
      jsonb_build_object('mensajero_id', v_doc.courier_id, 'doc_type', v_doc.doc_type, 'motivo', v_doc.review_notes)
    );
  end if;

  return v_doc;
end $function$;
