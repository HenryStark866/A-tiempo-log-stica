-- A TIEMPO LOGÍSTICA — Solicitudes de registro con verificación por administración
--
-- Al registrarse, la persona declara QUÉ solicita ser (requested_role: cliente | mensajero)
-- y, si es un negocio, su tipo de negocio y datos reales del comercio. El perfil queda en
-- rol 'pendiente' hasta que un administrador lo verifica y aprueba desde Usuarios, momento
-- en el que se le asigna el rol real (y para cliente se crea/enlaza su comercio).

-- ── Campos de la solicitud en el perfil ──────────────────────────────────
alter table public.at_profiles
  add column if not exists requested_role   public.at_role,   -- rol solicitado (cliente | mensajero)
  add column if not exists business_type     text,            -- tipo de negocio declarado
  add column if not exists business_name     text,            -- razón social / nombre del comercio
  add column if not exists business_nit      text,            -- NIT declarado
  add column if not exists business_address  text;            -- dirección del comercio

comment on column public.at_profiles.requested_role is
  'Rol que la persona solicitó al registrarse; se limpia al aprobar. Solo cliente|mensajero.';

create index if not exists at_profiles_requested_idx
  on public.at_profiles (requested_role)
  where requested_role is not null and role = 'pendiente';

-- ── Alta automática de perfil: ahora copia la solicitud desde el signup ───
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
    -- Solo se aceptan roles de autoservicio; cualquier otro valor se ignora
    case when v_requested in ('cliente','mensajero') then v_requested::public.at_role else null end,
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
