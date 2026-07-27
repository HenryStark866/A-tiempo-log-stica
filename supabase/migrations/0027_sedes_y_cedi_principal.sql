-- A TIEMPO LOGÍSTICA — dónde queda el CEDI.
--
-- La dirección del centro de distribución no estaba en ninguna parte: ni en la
-- base, ni en el código. El mensajero terminaba una recogida y la app le decía
-- "va en camino al CEDI" sin decirle a dónde. La sabía de memoria, o
-- preguntaba.
--
-- Va en tabla y no en una constante del código porque una mudanza de bodega no
-- puede exigir un despliegue, y porque "nuestro PRIMER CEDI" anticipa que
-- habrá más.

create table if not exists public.at_facilities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text not null,
  city       text not null,
  notes      text,
  phone      text,
  -- La sede a la que van los paquetes mientras no se diga otra cosa.
  is_default boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.at_facilities is
  'Sedes propias (CEDI, bodegas). Separado de at_clients: esos son los comercios, esto es la operación de ATL.';

-- Una sola sede por defecto. Sin esto, dos sedes marcadas dejarían al mensajero
-- viendo un destino distinto según el orden en que salgan de la consulta.
create unique index if not exists at_facilities_default_idx
  on public.at_facilities (is_default) where is_default;

alter table public.at_facilities enable row level security;

-- La dirección del CEDI no es secreta para quien trabaja aquí: el mensajero
-- tiene que llegar. El comercio no la necesita.
drop policy if exists "staff lee sedes" on public.at_facilities;
create policy "staff lee sedes" on public.at_facilities
  for select to authenticated
  using (public.at_is_staff());

drop policy if exists "ops administra sedes" on public.at_facilities;
create policy "ops administra sedes" on public.at_facilities
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── El primero ─────────────────────────────────────────────────────────
insert into public.at_facilities (name, address, city, is_default, active)
select 'CEDI Principal', 'Calle 57 sur No 43a - 46', 'Sabaneta', true, true
where not exists (select 1 from public.at_facilities where is_default);

-- ── La sede a donde llevar los paquetes ────────────────────────────────
-- Va por función y no consultando la tabla desde la app para que el día que
-- haya varias sedes, la regla de cuál corresponde se cambie en un solo lugar.
create or replace function public.at_default_facility()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'id', f.id, 'name', f.name, 'address', f.address,
    'city', f.city, 'phone', f.phone, 'notes', f.notes
  )
  from public.at_facilities f
  where f.active and f.is_default and public.at_is_staff()
  limit 1
$$;

revoke execute on function public.at_default_facility() from public, anon;
grant execute on function public.at_default_facility() to authenticated;
