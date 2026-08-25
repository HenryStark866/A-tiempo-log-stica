-- ═══════════════════════════════════════════════════════════════════════════
-- NINGÚN PEDIDO NACE SIN ZONA SI LA DIRECCIÓN YA LA DICE
--
-- Un pedido sin zona no falla: se factura en CERO. La cadena la explica la
-- migración 0089 y es exactamente esta: at_guides.zone_id NULL → el trigger
-- at_guides_set_shipping_fee no encuentra zona → shipping_fee queda NULL →
-- at_cobro_de_guia devuelve coalesce(NULL,0) = 0. Sin error, sin aviso y sin
-- cobro. El domicilio se hace y no se cobra.
--
-- Hasta ahora la zona la resolvía la PANTALLA (zoneForText en src/lib/zones.ts)
-- y la mandaba en el insert. Eso deja fuera todos los demás caminos: la
-- sincronización de Shopify, un script, o cualquier insert directo permitido
-- por la política «el comercio crea sus pedidos».
--
-- Comprobado en producción antes de escribir esto: un insert sin zone_id, hecho
-- como una asesora real, nacía con shipping_fee NULL. Después de este trigger,
-- el mismo insert resuelve MED-CO y calcula $13.500.
--
-- No pisa nada: si el insert YA trae zona, la respeta. Y si la dirección no
-- permite deducirla, la deja en NULL como antes — ese caso es el que el CEDI
-- resuelve al zonificar, y ahí el trigger del precio dispara por
-- UPDATE OF zone_id.
--
-- ── El nombre importa ─────────────────────────────────────────────────────
-- Postgres ejecuta los triggers BEFORE en orden alfabético. Este tiene que
-- correr ANTES de at_guides_set_shipping_fee para que el precio se calcule con
-- la zona ya puesta: «asigna» < «set». Verificado, el orden real es:
--   at_guides_asigna_sede → at_guides_asigna_zona → … → at_guides_set_shipping_fee
-- Si alguien lo renombra, que mire esto.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_guides_asigna_zona()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.zone_id is null then
    new.zone_id := public.at_zone_for_city(
      coalesce(new.recipient_city, '') || ' ' || coalesce(new.recipient_address, '')
    );
  end if;
  return new;
end $function$;

comment on function public.at_guides_asigna_zona() is
  'Rellena zone_id cuando el insert no lo trae, para que ningún pedido llegue a facturarse en cero por no tener zona. Corre antes que at_guides_set_shipping_fee por orden alfabético.';

drop trigger if exists at_guides_asigna_zona on public.at_guides;
create trigger at_guides_asigna_zona
  before insert on public.at_guides
  for each row
  execute function public.at_guides_asigna_zona();
