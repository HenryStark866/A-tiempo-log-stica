-- ═══════════════════════════════════════════════════════════════════════════
-- TODO COMERCIO NACE CON SU SEDE PRINCIPAL
--
-- Un comercio se puede crear por tres caminos distintos: el trigger
-- at_autocreate_client (cuando a un perfil se le pone rol cliente), el RPC de
-- rescate at_ensure_my_client (cuando la app se encuentra un cliente sin
-- comercio), y a mano desde el panel. Ninguno creaba la sede.
--
-- Sin sede, el pedido nace con site_id NULL: la migración 0076 lo hace
-- heredarse de quien lo crea, y si esa persona no tiene sede no hay nada que
-- heredar. Un comercio de una sola tienda no nota nada raro hasta que abre la
-- segunda y descubre que sus pedidos históricos no están en ninguna.
--
-- El trigger va sobre at_clients y no sobre at_profiles a propósito: así cubre
-- los tres caminos de una vez, incluido cualquiera que se invente después.
--
-- La sede copia la dirección INICIAL del comercio, que es lo único que se sabe
-- de él en ese momento. Si luego se muda, se corrige la sede desde la pantalla:
-- este trigger no vuelve a tocarla, porque un comercio con varias sedes no
-- quiere que cambiarle la dirección fiscal le mueva la tienda.
--
-- Verificado al aplicarla: un comercio nuevo en «Carrera 43A #1-50, El Poblado»
-- nace con su Sede principal y con la zona MED-SL ya deducida.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_clients_crea_sede_principal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.at_client_sites
    (client_id, name, address, city, zone_id, contact_name, contact_phone, es_principal, active)
  values (
    new.id,
    'Sede principal',
    new.address,
    new.city,
    -- Si el comercio todavía no tiene zona resuelta, se deduce igual que se
    -- deduce la de un pedido: con la misma función que usa el resto.
    coalesce(
      new.zone_id,
      public.at_zone_for_city(coalesce(new.city, '') || ' ' || coalesce(new.address, ''))
    ),
    new.contact_name,
    new.phone,
    true,
    true
  );
  return new;
end $function$;

comment on function public.at_clients_crea_sede_principal() is
  'Le crea la sede principal a todo comercio nuevo, con su dirección inicial. Va sobre at_clients para cubrir los tres caminos por los que se puede crear un comercio.';

drop trigger if exists at_clients_sede_principal on public.at_clients;
create trigger at_clients_sede_principal
  after insert on public.at_clients
  for each row
  execute function public.at_clients_crea_sede_principal();

-- ── Los que ya existían ───────────────────────────────────────────────────
-- Mismo criterio, aplicado a los comercios que se quedaron sin sede porque
-- nacieron antes de que esto existiera. Idempotente: solo toca a los que no
-- tienen ninguna. Al aplicarla, los 9 comercios quedaron con su sede.
insert into public.at_client_sites
  (client_id, name, address, city, zone_id, contact_name, contact_phone, es_principal, active)
select c.id, 'Sede principal', c.address, c.city,
       coalesce(c.zone_id, public.at_zone_for_city(coalesce(c.city,'') || ' ' || coalesce(c.address,''))),
       c.contact_name, c.phone, true, true
from public.at_clients c
where not exists (select 1 from public.at_client_sites s where s.client_id = c.id);
