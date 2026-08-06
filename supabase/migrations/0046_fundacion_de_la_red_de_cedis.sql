-- A TIEMPO LOGÍSTICA — fundación de la red de CEDIs afiliados.
--
-- Hoy toda la app asume un solo CEDI: at_facilities existe, pero es un
-- directorio de una fila, y ninguna otra tabla sabe que existe. Esta
-- migración prepara el terreno para que otros emprendedores operen su propio
-- CEDI en su ciudad, afiliados a A Tiempo:
--
--   · El comercio lo sigue captando y facturando A Tiempo a nivel nacional
--     (decisión de negocio); el CEDI afiliado solo ejecuta la logística.
--   · A Tiempo cobra una comisión por entrega, liquidada aparte del recaudo
--     de cada mensajero (eso ya existe y sigue igual).
--   · Cada CEDI tiene su propio administrador local, que ve y gestiona solo
--     su operación — sin tocar la del CEDI Principal ni la de otro afiliado.
--
-- DELIBERADAMENTE aditiva y sin efecto: agrega columnas, un rol y una tabla,
-- todo con valores por defecto que dejan al CEDI Principal exactamente como
-- está. Ninguna política de RLS existente cambia aquí — eso es la fase
-- siguiente, y se hace política por política, no en un solo golpe a ciegas
-- sobre una base compartida en producción.

-- ── El nuevo rol ──────────────────────────────────────────────────────────
alter type public.at_role add value if not exists 'admin_cedi';

-- ── A qué CEDI pertenece cada cosa ───────────────────────────────────────
-- NULL sigue significando "nacional / CEDI Principal, se ve todo" — es el
-- valor con el que queda todo el personal y todo dato ya existente. Un valor
-- no nulo es lo que en la fase siguiente empieza a acotar la vista de un
-- admin_cedi a lo suyo.
alter table public.at_facilities
  add column if not exists owner_profile_id uuid references public.at_profiles(id) on delete set null,
  -- Comisión de A Tiempo por entrega, en puntos base (1500 = 15.00%). Puntos
  -- base y no un numeric(5,2) directo: evita el error clásico de un 15%
  -- guardado como 0.15 en una columna y como 15 en otra.
  add column if not exists commission_bps int not null default 0
    check (commission_bps >= 0 and commission_bps <= 10000);

alter table public.at_profiles
  add column if not exists facility_id uuid references public.at_facilities(id) on delete set null;

alter table public.at_clients
  add column if not exists facility_id uuid references public.at_facilities(id) on delete set null;

alter table public.at_zones
  add column if not exists facility_id uuid references public.at_facilities(id) on delete set null;

alter table public.at_guides
  add column if not exists facility_id uuid references public.at_facilities(id) on delete set null;

-- ── Backfill: todo lo que ya existe queda atado al CEDI Principal ────────
-- Los comercios y las zonas de hoy SÍ son del CEDI Principal — a diferencia
-- del personal, para ellos NULL no sería correcto, sería "sin dueño".
do $$
declare v_principal uuid;
begin
  select id into v_principal from public.at_facilities where is_default limit 1;
  if v_principal is not null then
    update public.at_clients set facility_id = v_principal where facility_id is null;
    update public.at_zones   set facility_id = v_principal where facility_id is null;
    update public.at_guides  set facility_id = v_principal where facility_id is null;
  end if;
end $$;

-- Toda zona nueva necesita saber de qué CEDI es — no tiene sentido una zona
-- huérfana. Los comercios y las guías se quedan opcionales: existen flujos
-- (una guía recién insertada antes del trigger de abajo) donde se resuelve
-- un instante después.
alter table public.at_zones alter column facility_id set not null;

-- ── Cada guía nueva hereda el CEDI de su comercio ────────────────────────
-- Así se decide UNA vez, al crearse, y no hay que recalcularlo en cada
-- pantalla: quién puede ver y tocar una guía es una pregunta de un solo join
-- constante, no de perseguir el comercio cada vez.
create or replace function public.at_set_guide_facility()
returns trigger
language plpgsql
as $$
begin
  if new.facility_id is null then
    select facility_id into new.facility_id
    from public.at_clients where id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists at_guides_set_facility on public.at_guides;
create trigger at_guides_set_facility
  before insert on public.at_guides
  for each row execute function public.at_set_guide_facility();

-- ── Quién soy, en qué CEDI ────────────────────────────────────────────────
-- Mismo patrón que at_my_role/at_my_client: una consulta, resuelta una vez
-- por sesión gracias a `stable`. NULL = personal nacional, ve todo — el
-- significado que ya tiene facility_id en at_profiles.
create or replace function public.at_my_facility()
returns uuid
language sql stable security definer set search_path = public
as $$ select facility_id from public.at_profiles where id = auth.uid() $$;

revoke execute on function public.at_my_facility() from public, anon;
grant execute on function public.at_my_facility() to authenticated;

-- ── Liquidación entre A Tiempo y cada CEDI afiliado ──────────────────────
-- Aparte de at_settlements (eso es el mensajero consignándole a su CEDI): esto
-- es el CEDI afiliado rindiéndole cuentas a A Tiempo por la comisión de red.
create table if not exists public.at_facility_settlements (
  id               uuid primary key default gen_random_uuid(),
  facility_id      uuid not null references public.at_facilities(id) on delete restrict,
  period_start     date not null,
  period_end       date not null,
  delivered_count  int not null default 0,
  gross_amount     numeric(14,2) not null default 0,
  commission_bps   int not null default 0,
  commission_amount numeric(14,2) not null default 0,
  net_amount       numeric(14,2) not null default 0,
  status           text not null default 'pendiente'
    check (status in ('pendiente','pagado')),
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  check (period_end >= period_start)
);

comment on table public.at_facility_settlements is
  'Liquidación periódica de la comisión de red entre A Tiempo y cada CEDI afiliado. No confundir con at_settlements (cierre de caja del mensajero).';

alter table public.at_facility_settlements enable row level security;

-- Sin políticas todavía a propósito: hasta que exista la pantalla que las
-- use, es más seguro que nadie —ni el propio admin_cedi— pueda leerlas por
-- accidente que abrir un acceso a ciegas y ajustarlo después.
