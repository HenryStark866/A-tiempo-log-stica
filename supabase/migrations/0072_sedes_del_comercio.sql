-- A TIEMPO LOGÍSTICA — un comercio puede tener varias sedes.
--
-- Hasta ahora un comercio era un punto: una dirección, un municipio, una zona.
-- Con eso, una tienda con bodega en Sabaneta y local en Bello tenía que elegir
-- cuál de las dos mentía.
--
-- Y no es un detalle de directorio: la zona del ORIGEN es la mitad del precio.
-- El domicilio se cobra por el par (zona de donde sale → zona a donde va), así
-- que despachar desde Bello o desde Sabaneta puede ser el doble o la mitad. Sin
-- sedes, a un comercio con dos bodegas se le estaba cobrando todo como si
-- saliera de una sola.
--
-- Cada sede tiene su propia zona y se deduce sola de su municipio, igual que se
-- hace con el comercio.

create table if not exists public.at_client_sites (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.at_clients(id) on delete cascade,
  name          text not null,
  address       text,
  city          text,
  zone_id       uuid references public.at_zones(id) on delete set null,
  contact_name  text,
  contact_phone text,
  -- La sede por omisión: la que se propone al crear un pedido si nadie elige.
  es_principal  boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.at_client_sites is
  'Sedes de un comercio. Cada una con su zona de origen, que es la mitad del precio de cada domicilio.';

-- Una sola principal por comercio, y solo entre las activas: al desactivar una
-- sede, su lugar queda libre sin tener que limpiar la marca a mano.
create unique index if not exists at_client_sites_una_principal
  on public.at_client_sites (client_id)
  where es_principal and active;

create index if not exists at_client_sites_client_idx
  on public.at_client_sites (client_id) where active;

-- ── La zona de la sede se deduce sola ────────────────────────────────────
-- Mismo criterio que para el comercio (0059): solo rellena cuando está vacía,
-- para no pisar nunca una zona que ops eligió a mano.
create or replace function public.at_zona_de_la_sede()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.zone_id is null then
    new.zone_id := public.at_zone_for_city(
      coalesce(new.city, '') || ' ' || coalesce(new.address, '')
    );
  end if;
  return new;
end $$;

drop trigger if exists at_zona_de_la_sede_trg on public.at_client_sites;
create trigger at_zona_de_la_sede_trg
  before insert or update of city, address on public.at_client_sites
  for each row execute function public.at_zona_de_la_sede();

-- ── A qué sede pertenece cada cosa ───────────────────────────────────────
-- Todo nullable: un comercio de una sola sede no tiene por qué enterarse de
-- que esto existe, y las guías viejas no tienen sede que declarar.
alter table public.at_profiles
  add column if not exists site_id uuid references public.at_client_sites(id) on delete set null;
alter table public.at_guides
  add column if not exists site_id uuid references public.at_client_sites(id) on delete set null;
alter table public.at_pickups
  add column if not exists site_id uuid references public.at_client_sites(id) on delete set null;

comment on column public.at_profiles.site_id is
  'Sede a la que pertenece un asesor comercial. Null en el dueño, que las ve todas.';
comment on column public.at_guides.site_id is
  'Sede desde la que sale el pedido. De su zona sale el precio del domicilio.';

create index if not exists at_guides_site_idx on public.at_guides (site_id) where site_id is not null;
create index if not exists at_pickups_site_idx on public.at_pickups (site_id) where site_id is not null;

-- ── A cada comercio, su sede principal ───────────────────────────────────
-- Se le crea una con lo que ya tenía. Así nada queda «sin sede» y el comercio
-- que nunca abra esta pantalla sigue funcionando exactamente igual que ayer.
insert into public.at_client_sites (client_id, name, address, city, zone_id, contact_name, contact_phone, es_principal)
select c.id, 'Sede principal', c.address, c.city, c.zone_id, c.contact_name, c.phone, true
from public.at_clients c
where not exists (select 1 from public.at_client_sites s where s.client_id = c.id);

-- Y las guías y recogidas que ya existen se quedan colgando de esa principal,
-- para que los informes por sede no empiecen con un agujero.
update public.at_guides g
set site_id = (select s.id from public.at_client_sites s
               where s.client_id = g.client_id and s.es_principal limit 1)
where g.site_id is null;

update public.at_pickups p
set site_id = (select s.id from public.at_client_sites s
               where s.client_id = p.client_id and s.es_principal limit 1)
where p.site_id is null;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.at_client_sites enable row level security;

-- El comercio ve y administra las suyas; el staff las ve todas porque el
-- operario necesita saber a qué dirección va la recogida.
drop policy if exists "comercio o staff lee sedes" on public.at_client_sites;
create policy "comercio o staff lee sedes" on public.at_client_sites
  for select to authenticated
  using (public.at_is_staff() or client_id = public.at_my_client());

-- Escribir solo el dueño: un asesor no se crea sedes ni se cambia de sitio.
-- (at_soy_dueno llega en 0074; aquí se compara el rol directo para no depender
-- de una función que todavía no existe.)
drop policy if exists "el dueño administra sus sedes" on public.at_client_sites;
create policy "el dueño administra sus sedes" on public.at_client_sites
  for all to authenticated
  using (client_id = public.at_my_client() and public.at_my_role() = 'cliente')
  with check (client_id = public.at_my_client() and public.at_my_role() = 'cliente');

drop policy if exists "ops administra sedes" on public.at_client_sites;
create policy "ops administra sedes" on public.at_client_sites
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── El precio sale de la zona de la SEDE ─────────────────────────────────
-- Se reemplaza la función de dos parámetros por una de tres. No se deja la
-- vieja conviviendo: dos versiones de la misma función es exactamente el error
-- que ya costó caro con at_update_my_business — la app acertaba por casualidad
-- y el día que alguien llamara distinto, escribía en la que no era.
drop function if exists public.at_precio_domicilio(uuid, uuid);

create or replace function public.at_precio_domicilio(
  p_client_id uuid,
  p_dest_zone_id uuid,
  p_site_id uuid default null
)
returns numeric
language sql stable security definer set search_path = public
as $function$
  select coalesce(
    (select r.delivery_rate
     from public.at_zone_pair_rates r
     where r.origin_zone_id = coalesce(
             -- La sede manda. Si no se indica, la zona del comercio.
             (select s.zone_id from public.at_client_sites s where s.id = p_site_id),
             (select c.zone_id from public.at_clients c where c.id = p_client_id))
       and r.dest_zone_id = p_dest_zone_id),
    (select z.delivery_rate from public.at_zones z where z.id = p_dest_zone_id),
    (select c.delivery_rate from public.at_clients c where c.id = p_client_id),
    0
  )
$function$;

comment on function public.at_precio_domicilio(uuid, uuid, uuid) is
  'Precio del domicilio por el par de zonas. El origen sale de la sede si se indica, y si no del comercio.';

revoke execute on function public.at_precio_domicilio(uuid, uuid, uuid) from public, anon;
grant execute on function public.at_precio_domicilio(uuid, uuid, uuid) to authenticated;

-- El congelado del precio en la guía ahora mira su sede.
create or replace function public.at_set_guide_shipping_fee()
returns trigger
language plpgsql security definer set search_path = public
as $function$
begin
  if new.status in ('entregada','devuelta','cancelada') then
    return new;
  end if;
  if new.zone_id is not null then
    new.shipping_fee := public.at_precio_domicilio(new.client_id, new.zone_id, new.site_id);
  end if;
  return new;
end $function$;

-- ── Lo que el comercio ve de sus sedes ───────────────────────────────────
create or replace function public.at_mis_sedes()
returns json
language sql stable security definer set search_path = public
as $function$
  select coalesce(json_agg(json_build_object(
           'id', s.id,
           'name', s.name,
           'address', s.address,
           'city', s.city,
           'zone_id', s.zone_id,
           'zone_name', z.name,
           'contact_name', s.contact_name,
           'contact_phone', s.contact_phone,
           'es_principal', s.es_principal,
           'active', s.active,
           'asesores', (select count(*) from public.at_profiles p
                        where p.site_id = s.id and p.active),
           'pedidos', (select count(*) from public.at_guides g where g.site_id = s.id)
         ) order by s.es_principal desc, s.name), '[]'::json)
  from public.at_client_sites s
  left join public.at_zones z on z.id = s.zone_id
  where s.client_id = public.at_my_client()
$function$;

revoke execute on function public.at_mis_sedes() from public, anon;
grant execute on function public.at_mis_sedes() to authenticated;
