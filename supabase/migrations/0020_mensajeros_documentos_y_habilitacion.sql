-- A TIEMPO LOGÍSTICA — Documentos del mensajero y habilitación por el admin.
--
-- PROBLEMA: desde 0016, quien se registra como mensajero queda activo apenas
-- confirma su correo y ya puede recibir recogidas y entregas. Eso sirve para el
-- personal propio, que se conoce, pero no para abrir la operación a mensajeros
-- externos: nadie revisó su cédula, su licencia ni el SOAT de su moto.
--
-- SOLUCIÓN: se separan dos cosas que hoy están confundidas en `active`.
--   · active      → la cuenta existe y puede entrar a la app.
--   · verified_at → el admin revisó sus papeles y puede recibir trabajo.
-- Un mensajero nuevo entra (para subir documentos) pero no recibe nada hasta
-- que un admin apruebe cada documento y lo habilite.
--
-- Dos clases de mensajero, con exigencias distintas:
--   · corporativo  → de la empresa, usa vehículo de la empresa. Cédula y licencia.
--   · colaborativo → externo, pone su propio vehículo. Además tarjeta de
--                    propiedad y SOAT, porque responde con él ante un siniestro.

-- ── 1. Tipos ───────────────────────────────────────────────────────────
do $$ begin
  create type public.at_courier_type as enum ('corporativo', 'colaborativo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.at_doc_status as enum ('pendiente', 'aprobado', 'rechazado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.at_doc_type as enum (
    'cedula_frente', 'cedula_reverso', 'licencia_conduccion',
    'tarjeta_propiedad', 'soat', 'tecnomecanica',
    'foto_vehiculo', 'certificado_eps', 'antecedentes'
  );
exception when duplicate_object then null; end $$;

-- ── 2. Columnas del mensajero ──────────────────────────────────────────
alter table public.at_profiles
  add column if not exists courier_type  public.at_courier_type,
  add column if not exists verified_at   timestamptz,
  add column if not exists verified_by   uuid references public.at_profiles(id),
  add column if not exists vehicle_plate text;

comment on column public.at_profiles.verified_at is
  'Cuándo un admin revisó los documentos y habilitó al mensajero para recibir trabajo. Distinto de active, que solo dice si puede entrar a la app.';
comment on column public.at_profiles.courier_type is
  'corporativo = de la empresa; colaborativo = externo con vehículo propio. Define qué documentos se le exigen.';

-- ── 3. Documentos ──────────────────────────────────────────────────────
create table if not exists public.at_courier_documents (
  id           uuid primary key default gen_random_uuid(),
  courier_id   uuid not null references public.at_profiles(id) on delete cascade,
  doc_type     public.at_doc_type not null,
  file_path    text not null,
  status       public.at_doc_status not null default 'pendiente',
  review_notes text,
  reviewed_by  uuid references public.at_profiles(id),
  reviewed_at  timestamptz,
  expires_on   date,
  uploaded_at  timestamptz not null default now(),
  -- Un solo archivo vigente por tipo: volver a subir reemplaza el anterior y
  -- vuelve a dejarlo en revisión.
  unique (courier_id, doc_type)
);

create index if not exists at_courier_documents_courier_idx
  on public.at_courier_documents (courier_id);

alter table public.at_courier_documents enable row level security;

drop policy if exists "mensajero ve sus documentos" on public.at_courier_documents;
create policy "mensajero ve sus documentos" on public.at_courier_documents
  for select to authenticated
  using (courier_id = auth.uid() or public.at_is_ops());

-- Escribir siempre pasa por los RPC, que validan estado y propiedad.

-- ── 4. Qué documentos se exigen según el tipo ──────────────────────────
-- En una sola función para que la app, la validación y la pantalla del admin
-- no puedan quedar diciendo cosas distintas.
create or replace function public.at_required_courier_docs(p_type public.at_courier_type)
returns public.at_doc_type[]
language sql immutable
as $$
  select case
    when p_type = 'colaborativo' then array[
      'cedula_frente', 'cedula_reverso', 'licencia_conduccion',
      'tarjeta_propiedad', 'soat'
    ]::public.at_doc_type[]
    else array[
      'cedula_frente', 'cedula_reverso', 'licencia_conduccion'
    ]::public.at_doc_type[]
  end
$$;

grant execute on function public.at_required_courier_docs(public.at_courier_type) to authenticated;

-- ── 5. El mensajero registra un documento que acaba de subir ───────────
create or replace function public.at_register_courier_doc(
  p_doc_type   public.at_doc_type,
  p_file_path  text,
  p_expires_on date default null
)
returns public.at_courier_documents
language plpgsql security definer set search_path = public
as $$
declare
  v_doc public.at_courier_documents;
begin
  if public.at_my_role() <> 'mensajero' then
    raise exception 'Solo un mensajero sube sus documentos';
  end if;
  if coalesce(trim(p_file_path), '') = '' then
    raise exception 'Falta el archivo';
  end if;
  -- El archivo tiene que estar en la carpeta del propio mensajero. Sin esto,
  -- alguien podría registrar como suyo el archivo de otro.
  if split_part(p_file_path, '/', 1) <> auth.uid()::text then
    raise exception 'El archivo no corresponde a tu carpeta';
  end if;

  insert into public.at_courier_documents (courier_id, doc_type, file_path, expires_on)
  values (auth.uid(), p_doc_type, trim(p_file_path), p_expires_on)
  on conflict (courier_id, doc_type) do update set
    file_path    = excluded.file_path,
    expires_on   = excluded.expires_on,
    status       = 'pendiente',   -- vuelve a revisión
    review_notes = null,
    reviewed_by  = null,
    reviewed_at  = null,
    uploaded_at  = now()
  returning * into v_doc;

  return v_doc;
end $$;

revoke execute on function public.at_register_courier_doc(public.at_doc_type, text, date) from public, anon;
grant execute on function public.at_register_courier_doc(public.at_doc_type, text, date) to authenticated;

-- ── 6. El admin aprueba o rechaza cada documento ───────────────────────
create or replace function public.at_review_courier_doc(
  p_doc_id   uuid,
  p_approved boolean,
  p_notes    text default null
)
returns public.at_courier_documents
language plpgsql security definer set search_path = public
as $$
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
  end if;

  return v_doc;
end $$;

revoke execute on function public.at_review_courier_doc(uuid, boolean, text) from public, anon;
grant execute on function public.at_review_courier_doc(uuid, boolean, text) to authenticated;

-- ── 7. Habilitar al mensajero ──────────────────────────────────────────
-- Es el único punto que pone verified_at, y exige que TODOS los documentos
-- obligatorios de su tipo estén aprobados. Así el admin no puede habilitar por
-- descuido a alguien con la licencia sin revisar.
create or replace function public.at_verify_courier(
  p_courier_id   uuid,
  p_courier_type public.at_courier_type,
  p_zone_id      uuid default null,
  p_max_capacity int  default null
)
returns public.at_profiles
language plpgsql security definer set search_path = public
as $$
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

  return v_courier;
end $$;

revoke execute on function public.at_verify_courier(uuid, public.at_courier_type, uuid, int) from public, anon;
grant execute on function public.at_verify_courier(uuid, public.at_courier_type, uuid, int) to authenticated;

-- ── 8. Retirar la habilitación ─────────────────────────────────────────
-- No borra nada: el mensajero conserva su historial y sus documentos, solo
-- deja de recibir trabajo. Sirve cuando se le vence el SOAT.
create or replace function public.at_revoke_courier(p_courier_id uuid, p_reason text)
returns public.at_profiles
language plpgsql security definer set search_path = public
as $$
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

  return v_courier;
end $$;

revoke execute on function public.at_revoke_courier(uuid, text) from public, anon;
grant execute on function public.at_revoke_courier(uuid, text) to authenticated;

-- ── 9. Nadie sin habilitar recibe trabajo ──────────────────────────────
-- Se refuerza en los dos puntos por donde entra el trabajo. La pantalla ya
-- filtra, pero la regla tiene que vivir donde no se pueda esquivar.
create or replace function public.at_assign_courier(
  p_guide_id uuid, p_courier_id uuid, p_zone_id uuid default null
)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_courier public.at_profiles;
  v_role public.at_role := public.at_my_role();
begin
  -- Ops, operario y mensajero pueden armar ruta (el cliente y anon nunca).
  if v_role is null or v_role not in ('admin','coordinador','operario','mensajero') then
    raise exception 'No autorizado';
  end if;

  select * into v_courier from public.at_profiles where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;
  if v_courier.verified_at is null then
    raise exception 'El mensajero % todavía no está habilitado: sus documentos no han sido aprobados', v_courier.full_name;
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;
  if v_guide.status not in ('en_cedi','reprogramada') then
    raise exception 'Solo guías en CEDI o reprogramadas se pueden zonificar (estado actual: %)', v_guide.status;
  end if;

  update public.at_guides g set
    courier_id = p_courier_id,
    zone_id = coalesce(p_zone_id, g.zone_id, v_courier.zone_id),
    status = 'zonificada'
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, 'zonificada', 'Asignada a ' || v_courier.full_name, auth.uid());

  return v_guide;
end $$;

create or replace function public.at_assign_pickup(p_pickup_id uuid, p_courier_id uuid)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup public.at_pickups;
  v_courier public.at_profiles;
  v_comercio text;
  v_guias int;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador asigna recogidas';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;
  if v_courier.verified_at is null then
    raise exception 'El mensajero % todavía no está habilitado: sus documentos no han sido aprobados', v_courier.full_name;
  end if;

  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;
  if v_pickup.status in ('completada','cancelada') then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  update public.at_pickups
  set operator_id = p_courier_id, status = 'asignada'
  where id = p_pickup_id
  returning * into v_pickup;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;
  select count(*) into v_guias from public.at_guides where pickup_id = p_pickup_id;

  insert into public.at_notifications (user_id, title, body, link)
  values (
    p_courier_id,
    'Nueva recogida asignada',
    coalesce(v_comercio,'Un comercio') || ' · ' || v_pickup.address
      || case when v_pickup.scheduled_time is not null
              then ' · ' || to_char(v_pickup.scheduled_time,'HH24:MI') else '' end
      || case when v_guias > 0 then ' · ' || v_guias || ' guía(s)' else '' end,
    '/recogidas'
  );

  return v_pickup;
end $$;

-- ── 10. Al confirmar el correo, el mensajero entra pero no trabaja ─────
-- Solo cambia la rama del mensajero: sigue recibiendo su rol y su acceso, pero
-- ahora aterriza en su perfil a subir papeles, y se le avisa al admin.
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
    active         = true,
    -- Quien se registra solo es externo por definición. El personal propio lo
    -- crea el admin, que puede cambiarle el tipo al habilitarlo.
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
  return new; -- nunca bloquear la confirmación del correo
end $$;

-- ── 11. Los mensajeros que ya venían trabajando siguen habilitados ─────
-- Sin esto, el mensajero que hoy está en la calle dejaría de recibir trabajo
-- en el momento del despliegue. Son de la casa, así que corporativos.
update public.at_profiles
set verified_at  = coalesce(verified_at, now()),
    courier_type = coalesce(courier_type, 'corporativo')
where role = 'mensajero' and active;

-- ── 12. Storage privado para los documentos ────────────────────────────
insert into storage.buckets (id, name, public)
values ('at-courier-docs', 'at-courier-docs', false)
on conflict (id) do nothing;

-- Cada mensajero escribe únicamente dentro de la carpeta con su propio id.
drop policy if exists "at mensajero sube sus documentos" on storage.objects;
create policy "at mensajero sube sus documentos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'at-courier-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "at mensajero reemplaza sus documentos" on storage.objects;
create policy "at mensajero reemplaza sus documentos"
on storage.objects for update to authenticated
using (
  bucket_id = 'at-courier-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Documentos de identidad: los ve su dueño y quien tiene que verificarlos.
drop policy if exists "at dueno u ops ve documentos" on storage.objects;
create policy "at dueno u ops ve documentos"
on storage.objects for select to authenticated
using (
  bucket_id = 'at-courier-docs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.at_is_ops()
  )
);
