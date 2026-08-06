-- A TIEMPO LOGÍSTICA — el registro público de un CEDI afiliado.
--
-- Hasta ahora un CEDI nuevo solo lo podía crear el admin nacional a mano
-- desde /sedes, sin que el emprendedor mismo pudiera pedirlo. Esto abre esa
-- puerta, con el mismo cuidado que ya existe para un mensajero externo: la
-- cuenta se crea y confirma el correo sola, pero se queda 'pendiente' —no
-- entra a operar nada— hasta que:
--
--   1. suba los documentos de la persona (cédula) y del local (propiedad o
--      arriendo, recibo de servicio público, foto del sitio), y
--   2. un administrador nacional los revise y apruebe la solicitud completa.
--
-- Al aprobar, la sede se crea, se le zonifica solo —copiando la escalera de
-- tarifas de Medellín aplicada a la ciudad nueva, ver el punto 6— y la
-- cuenta pasa a administrar su propio CEDI.

-- ── 1. Dónde va a quedar el local ─────────────────────────────────────────
-- business_name/business_address ya existen y sirven igual (nombre del CEDI,
-- dirección del local); falta la ciudad, que para un comercio nunca hizo
-- falta preguntar porque solo operábamos en el área metropolitana.
alter table public.at_profiles
  add column if not exists proposed_city text;

-- ── 2. Documentos de la solicitud ──────────────────────────────────────────
do $$ begin
  create type public.at_facility_doc_type as enum (
    'cedula_frente', 'cedula_reverso',
    'documento_local', 'recibo_servicio_publico', 'foto_local'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.at_facility_documents (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.at_profiles(id) on delete cascade,
  doc_type     public.at_facility_doc_type not null,
  file_path    text not null,
  status       public.at_doc_status not null default 'pendiente',
  review_notes text,
  reviewed_by  uuid references public.at_profiles(id),
  reviewed_at  timestamptz,
  uploaded_at  timestamptz not null default now(),
  unique (applicant_id, doc_type)
);

create index if not exists at_facility_documents_applicant_idx
  on public.at_facility_documents (applicant_id);

alter table public.at_facility_documents enable row level security;

drop policy if exists "solicitante ve sus documentos" on public.at_facility_documents;
create policy "solicitante ve sus documentos" on public.at_facility_documents
  for select to authenticated
  using (applicant_id = auth.uid() or public.at_my_role() = 'admin');

create or replace function public.at_required_facility_docs()
returns public.at_facility_doc_type[]
language sql immutable
as $$
  select array[
    'cedula_frente', 'cedula_reverso',
    'documento_local', 'recibo_servicio_publico', 'foto_local'
  ]::public.at_facility_doc_type[]
$$;

grant execute on function public.at_required_facility_docs() to authenticated;

create or replace function public.at_register_facility_doc(
  p_doc_type  public.at_facility_doc_type,
  p_file_path text
)
returns public.at_facility_documents
language plpgsql security definer set search_path = public
as $$
declare v_doc public.at_facility_documents;
begin
  if public.at_my_role() <> 'pendiente' then
    raise exception 'Solo se suben documentos mientras la solicitud está en revisión';
  end if;
  if coalesce(trim(p_file_path), '') = '' then
    raise exception 'Falta el archivo';
  end if;
  if split_part(p_file_path, '/', 1) <> auth.uid()::text then
    raise exception 'El archivo no corresponde a tu carpeta';
  end if;

  insert into public.at_facility_documents (applicant_id, doc_type, file_path)
  values (auth.uid(), p_doc_type, trim(p_file_path))
  on conflict (applicant_id, doc_type) do update set
    file_path    = excluded.file_path,
    status       = 'pendiente',
    review_notes = null,
    reviewed_by  = null,
    reviewed_at  = null,
    uploaded_at  = now()
  returning * into v_doc;

  return v_doc;
end $$;

revoke execute on function public.at_register_facility_doc(public.at_facility_doc_type, text) from public, anon;
grant execute on function public.at_register_facility_doc(public.at_facility_doc_type, text) to authenticated;

create or replace function public.at_review_facility_doc(
  p_doc_id   uuid,
  p_approved boolean,
  p_notes    text default null
)
returns public.at_facility_documents
language plpgsql security definer set search_path = public
as $$
declare v_doc public.at_facility_documents;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo el administrador nacional revisa solicitudes de CEDI';
  end if;
  if not p_approved and coalesce(trim(p_notes), '') = '' then
    raise exception 'Para rechazar un documento hay que decir por qué';
  end if;

  update public.at_facility_documents set
    status       = case when p_approved then 'aprobado' else 'rechazado' end::public.at_doc_status,
    review_notes = nullif(trim(coalesce(p_notes, '')), ''),
    reviewed_by  = auth.uid(),
    reviewed_at  = now()
  where id = p_doc_id
  returning * into v_doc;

  if not found then raise exception 'Documento no encontrado'; end if;

  if not p_approved then
    insert into public.at_notifications (user_id, title, body, link)
    values (v_doc.applicant_id, 'Documento rechazado',
            replace(v_doc.doc_type::text, '_', ' ') || ': ' || v_doc.review_notes,
            '/dashboard');
  end if;

  return v_doc;
end $$;

revoke execute on function public.at_review_facility_doc(uuid, boolean, text) from public, anon;
grant execute on function public.at_review_facility_doc(uuid, boolean, text) to authenticated;

-- ── 3. Storage privado para los documentos ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('at-facility-docs', 'at-facility-docs', false)
on conflict (id) do nothing;

drop policy if exists "at solicitante sube sus documentos" on storage.objects;
create policy "at solicitante sube sus documentos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'at-facility-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "at solicitante reemplaza sus documentos" on storage.objects;
create policy "at solicitante reemplaza sus documentos"
on storage.objects for update to authenticated
using (
  bucket_id = 'at-facility-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "at dueno o admin ve documentos de cedi" on storage.objects;
create policy "at dueno o admin ve documentos de cedi"
on storage.objects for select to authenticated
using (
  bucket_id = 'at-facility-docs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.at_my_role() = 'admin'
  )
);

-- ── 4. El registro público acepta la solicitud de CEDI ────────────────────
-- Mismo mecanismo que 'operario': queda pendiente y espera al admin. No se
-- toca at_activate_on_confirm porque su condición ya es "todo lo que no sea
-- cliente/mensajero espera aprobación" — admin_cedi cae ahí sola.
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
    requested_role, business_type, business_name, business_nit, business_address,
    proposed_city
  )
  values (
    new.id,
    coalesce(v_meta->>'full_name', ''),
    nullif(v_meta->>'phone', ''),
    'pendiente',
    case when v_requested in ('cliente','mensajero','operario','admin_cedi')
         then v_requested::public.at_role else null end,
    nullif(v_meta->>'business_type', ''),
    nullif(v_meta->>'business_name', ''),
    nullif(v_meta->>'business_nit', ''),
    nullif(v_meta->>'business_address', ''),
    nullif(v_meta->>'proposed_city', '')
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end $$;

-- ── 5. Le notifica al admin igual que con 'operario' ───────────────────────
-- at_activate_on_confirm ya cubre cualquier requested_role fuera de
-- ('cliente','mensajero') con el mismo aviso genérico a los admins; no hace
-- falta tocarla. Se deja el comentario para quien busque dónde engancha
-- admin_cedi y no lo encuentre a primera vista.

-- ── 6. Zonificación automática al aprobar ─────────────────────────────────
-- Copia la escalera de tarifas del CEDI Principal —mismo número de zonas,
-- mismo orden, mismo delivery_rate relativo— a la ciudad nueva. No hay datos
-- de barrios de una ciudad que la plataforma nunca ha operado, así que
-- `coverage` queda vacío a propósito: cada dirección de esa ciudad cae por
-- el `city_fallback`, que sí se llena, hasta que alguien afine los sectores
-- a mano. Es peor no tener ninguna zona que tener una aproximada: sin esto,
-- cada guía nueva del CEDI llegaría "fuera de cobertura".
create or replace function public.at_generar_zonas_por_defecto(p_facility_id uuid, p_city text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_creadas int := 0;
  v_zona record;
  v_nueva_id uuid;
  v_sufijo int := 0;
  v_nombre text;
begin
  for v_zona in
    select z.*, zc.courier_fee
    from public.at_zones z
    left join public.at_zone_costs zc on zc.zone_id = z.id
    where z.facility_id = (select id from public.at_facilities where is_default limit 1)
    order by z.sort_order
  loop
    v_sufijo := v_sufijo + 1;
    v_nombre := trim(p_city) || ' - Zona ' || v_sufijo;
    -- El nombre es único en toda la tabla: si ya existe (dos aprobaciones en
    -- la misma ciudad, por ejemplo), se le agrega el CEDI para no chocar.
    if exists (select 1 from public.at_zones where name = v_nombre) then
      v_nombre := v_nombre || ' (' || left(p_facility_id::text, 8) || ')';
    end if;

    insert into public.at_zones (name, description, coverage, city_fallback, delivery_rate, sort_order, facility_id, active)
    values (
      v_nombre,
      'Zona generada automáticamente a partir del tarifario de Medellín. Falta afinar los barrios.',
      null,
      trim(p_city),
      v_zona.delivery_rate,
      v_zona.sort_order,
      p_facility_id,
      true
    )
    returning id into v_nueva_id;

    insert into public.at_zone_costs (zone_id, courier_fee)
    values (v_nueva_id, coalesce(v_zona.courier_fee, 4000));

    v_creadas := v_creadas + 1;
  end loop;

  return v_creadas;
end $$;

-- ── 7. Aprobar la solicitud completa ──────────────────────────────────────
create or replace function public.at_aprobar_solicitud_cedi(
  p_profile_id uuid,
  p_commission_bps int default 1000
)
returns public.at_facilities
language plpgsql security definer set search_path = public
as $$
declare
  v_perfil public.at_profiles;
  v_faltante text;
  v_facility public.at_facilities;
  v_zonas int;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo el administrador nacional aprueba una solicitud de CEDI';
  end if;

  select * into v_perfil from public.at_profiles
  where id = p_profile_id and role = 'pendiente' and requested_role = 'admin_cedi';
  if not found then raise exception 'Esa solicitud no existe o ya fue resuelta'; end if;

  select string_agg(replace(d.tipo::text, '_', ' '), ', ')
    into v_faltante
  from unnest(public.at_required_facility_docs()) as d(tipo)
  where not exists (
    select 1 from public.at_facility_documents fd
    where fd.applicant_id = p_profile_id
      and fd.doc_type = d.tipo
      and fd.status = 'aprobado'
  );
  if v_faltante is not null then
    raise exception 'Faltan documentos aprobados: %', v_faltante;
  end if;

  if coalesce(trim(v_perfil.business_name), '') = '' then
    raise exception 'La solicitud no tiene nombre de CEDI';
  end if;
  if coalesce(trim(v_perfil.proposed_city), '') = '' then
    raise exception 'La solicitud no tiene ciudad';
  end if;

  insert into public.at_facilities (name, address, city, phone, commission_bps, is_default, active, owner_profile_id)
  values (
    trim(v_perfil.business_name),
    coalesce(nullif(trim(v_perfil.business_address), ''), 'Sin dirección registrada'),
    trim(v_perfil.proposed_city),
    v_perfil.phone,
    p_commission_bps,
    false,
    true,
    p_profile_id
  )
  returning * into v_facility;

  select public.at_generar_zonas_por_defecto(v_facility.id, v_facility.city) into v_zonas;

  perform set_config('at.email_confirm', p_profile_id::text, true);
  update public.at_profiles set
    role = 'admin_cedi',
    requested_role = null,
    facility_id = v_facility.id,
    active = true
  where id = p_profile_id;
  perform set_config('at.email_confirm', '', true);

  insert into public.at_notifications (user_id, title, body, link)
  values (
    p_profile_id, '¡Tu CEDI ya está activo!',
    format(
      'Aprobamos %s en %s con %s zona(s) de arranque, copiadas del tarifario de Medellín. Revísalas y ajusta los barrios de cada una antes de operar a fondo.',
      v_facility.name, v_facility.city, v_zonas
    ),
    '/dashboard'
  );

  return v_facility;
end $$;

revoke execute on function public.at_aprobar_solicitud_cedi(uuid, int) from public, anon;
grant execute on function public.at_aprobar_solicitud_cedi(uuid, int) to authenticated;

-- ── 8. Listar solicitudes de CEDI pendientes, con sus documentos ─────────
create or replace function public.at_list_solicitudes_cedi()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(t order by t.created_at), '[]'::json)
  from (
    select
      p.id, p.full_name, p.phone, p.business_name, p.business_address,
      p.proposed_city, p.created_at,
      (
        select coalesce(json_agg(json_build_object(
          'id', fd.id, 'doc_type', fd.doc_type, 'file_path', fd.file_path,
          'status', fd.status, 'review_notes', fd.review_notes, 'uploaded_at', fd.uploaded_at
        )), '[]'::json)
        from public.at_facility_documents fd where fd.applicant_id = p.id
      ) as documentos
    from public.at_profiles p
    where p.role = 'pendiente' and p.requested_role = 'admin_cedi'
      and public.at_my_role() = 'admin'
  ) t
$$;

revoke execute on function public.at_list_solicitudes_cedi() from public, anon;
grant execute on function public.at_list_solicitudes_cedi() to authenticated;
