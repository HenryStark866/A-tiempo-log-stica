-- A TIEMPO LOGÍSTICA — cómo se afilia un CEDI nuevo y cómo se le liquida su
-- comisión. Solo el admin nacional puede hacer las dos cosas: afiliar es
-- una decisión de negocio, no operativa.

-- ── Crear una sede nueva ──────────────────────────────────────────────────
create or replace function public.at_crear_facility(
  p_name text,
  p_address text,
  p_city text,
  p_commission_bps int default 0,
  p_phone text default null,
  p_notes text default null
)
returns public.at_facilities
language plpgsql security definer set search_path = public
as $$
declare v_out public.at_facilities;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo el administrador nacional afilia un CEDI nuevo';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_city), '') = '' then
    raise exception 'El nombre y la ciudad son obligatorios';
  end if;
  if p_commission_bps < 0 or p_commission_bps > 10000 then
    raise exception 'La comisión debe estar entre 0%% y 100%%';
  end if;

  insert into public.at_facilities (name, address, city, phone, notes, commission_bps, is_default, active)
  values (trim(p_name), trim(p_address), trim(p_city), nullif(trim(p_phone),''), nullif(trim(p_notes),''), p_commission_bps, false, true)
  returning * into v_out;

  return v_out;
end $$;

revoke execute on function public.at_crear_facility(text, text, text, int, text, text) from public, anon;
grant execute on function public.at_crear_facility(text, text, text, int, text, text) to authenticated;

-- ── Asignarle un administrador a esa sede ─────────────────────────────────
-- Sobre un perfil que YA existe (se registró como cualquiera, el admin
-- nacional lo eleva a admin_cedi de una sede puntual). No crea la cuenta:
-- eso ya lo resuelve el registro normal + la aprobación de siempre.
create or replace function public.at_asignar_admin_cedi(p_profile_id uuid, p_facility_id uuid)
returns public.at_profiles
language plpgsql security definer set search_path = public
as $$
declare v_out public.at_profiles;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo el administrador nacional asigna administradores de CEDI';
  end if;

  if not exists (select 1 from public.at_facilities where id = p_facility_id and active) then
    raise exception 'Esa sede no existe o está inactiva';
  end if;

  update public.at_profiles set
    role = 'admin_cedi',
    facility_id = p_facility_id,
    active = true
  where id = p_profile_id
  returning * into v_out;

  if not found then raise exception 'Ese usuario no existe'; end if;

  update public.at_facilities set owner_profile_id = p_profile_id where id = p_facility_id;

  insert into public.at_notifications (user_id, title, body, link)
  values (
    p_profile_id, 'Ya administras un CEDI',
    'Te asignaron la administración de una sede en A Tiempo. Ya puedes habilitar mensajeros y operar tus guías.',
    '/dashboard'
  );

  return v_out;
end $$;

revoke execute on function public.at_asignar_admin_cedi(uuid, uuid) from public, anon;
grant execute on function public.at_asignar_admin_cedi(uuid, uuid) to authenticated;

-- ── Liquidación de la comisión de red ──────────────────────────────────────
-- Calcado de at_generate_invoice: mismo patrón, otra cuenta. Cuenta las
-- guías ENTREGADAS por ese CEDI en el período y aplica su % de comisión
-- sobre el valor de entrega cobrado al comercio (at_zones.delivery_rate de
-- la zona de cada guía, que es lo que A Tiempo factura por esa entrega).
create or replace function public.at_generate_facility_settlement(
  p_facility_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.at_facility_settlements
language plpgsql security definer set search_path = public
as $$
declare
  v_facility public.at_facilities;
  v_bruto numeric(14,2);
  v_conteo int;
  v_out public.at_facility_settlements;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo el administrador nacional liquida la comisión de un CEDI';
  end if;

  select * into v_facility from public.at_facilities where id = p_facility_id;
  if not found then raise exception 'Esa sede no existe'; end if;

  select count(*), coalesce(sum(z.delivery_rate), 0)
    into v_conteo, v_bruto
  from public.at_guides g
  left join public.at_zones z on z.id = g.zone_id
  where g.facility_id = p_facility_id
    and g.status = 'entregada'
    and g.delivered_at::date between p_period_start and p_period_end;

  insert into public.at_facility_settlements (
    facility_id, period_start, period_end, delivered_count,
    gross_amount, commission_bps, commission_amount, net_amount
  ) values (
    p_facility_id, p_period_start, p_period_end, v_conteo,
    v_bruto, v_facility.commission_bps,
    round(v_bruto * v_facility.commission_bps / 10000.0, 2),
    v_bruto - round(v_bruto * v_facility.commission_bps / 10000.0, 2)
  )
  returning * into v_out;

  return v_out;
end $$;

revoke execute on function public.at_generate_facility_settlement(uuid, date, date) from public, anon;
grant execute on function public.at_generate_facility_settlement(uuid, date, date) to authenticated;

-- ── Pagar una liquidación ──────────────────────────────────────────────────
create or replace function public.at_pay_facility_settlement(p_settlement_id uuid)
returns public.at_facility_settlements
language plpgsql security definer set search_path = public
as $$
declare v_out public.at_facility_settlements;
begin
  if public.at_my_role() <> 'admin' then raise exception 'No autorizado'; end if;

  update public.at_facility_settlements
  set status = 'pagado', paid_at = now()
  where id = p_settlement_id and status = 'pendiente'
  returning * into v_out;

  if not found then raise exception 'Esa liquidación no existe o ya está pagada'; end if;
  return v_out;
end $$;

revoke execute on function public.at_pay_facility_settlement(uuid) from public, anon;
grant execute on function public.at_pay_facility_settlement(uuid) to authenticated;

-- ── Listar sedes con sus números, para la pantalla de administración ───────
create or replace function public.at_list_facilities()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(t order by t.is_default desc, t.name), '[]'::json)
  from (
    select
      f.id, f.name, f.city, f.address, f.active, f.is_default, f.commission_bps,
      f.created_at,
      o.full_name as owner_name,
      (select count(*) from public.at_clients c where c.facility_id = f.id) as comercios,
      (select count(*) from public.at_profiles p where p.facility_id = f.id and p.role = 'mensajero' and p.active) as mensajeros,
      (select count(*) from public.at_guides g where g.facility_id = f.id) as guias_totales,
      (select count(*) from public.at_facility_settlements s where s.facility_id = f.id and s.status = 'pendiente') as liquidaciones_pendientes
    from public.at_facilities f
    left join public.at_profiles o on o.id = f.owner_profile_id
    where public.at_my_role() = 'admin'
  ) t
$$;

revoke execute on function public.at_list_facilities() from public, anon;
grant execute on function public.at_list_facilities() to authenticated;

alter table public.at_facility_settlements enable row level security;
drop policy if exists "admin nacional lee liquidaciones" on public.at_facility_settlements;
create policy "admin nacional lee liquidaciones" on public.at_facility_settlements
  for select to authenticated
  using (public.at_my_role() = 'admin');
