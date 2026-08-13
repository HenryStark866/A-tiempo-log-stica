-- A TIEMPO LOGÍSTICA — un pedido nace en la sede de quien lo registra.
--
-- Sin esto, las sedes serían un directorio bonito y nada más. El precio del
-- domicilio sale del par (zona de origen → zona de destino), y la zona de
-- origen la pone la SEDE. Si el pedido no dice de qué sede sale, cae en la del
-- comercio, y un asesor que despacha desde la bodega de Girardota estaría
-- cobrando como si saliera de la sede principal en Sabaneta.
--
-- Se resuelve en la base y no en el formulario a propósito: así vale para los
-- pedidos que entran por la app, los que entran por la sincronización de
-- Shopify y los que cree un operario desde el CEDI. Un campo en una pantalla
-- solo habría cubierto el primero.
--
-- El nombre del trigger empieza por «asigna» para que ordene ANTES de
-- at_guides_set_shipping_fee: Postgres los dispara en orden alfabético, y si
-- corriera después, el precio ya estaría congelado con la sede equivocada.

create or replace function public.at_asigna_sede_al_pedido()
returns trigger
language plpgsql security definer set search_path = public
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      -- La sede de quien lo está creando: el asesor tiene la suya.
      (select p.site_id from public.at_profiles p where p.id = auth.uid()),
      -- El dueño no tiene sede asignada —las ve todas—, así que va la principal.
      (select s.id from public.at_client_sites s
        where s.client_id = new.client_id and s.es_principal and s.active limit 1)
    );
  end if;
  return new;
end $function$;

comment on function public.at_asigna_sede_al_pedido() is
  'Un pedido nace en la sede de quien lo registra. De esa sede sale la zona de origen, y de ahí el precio.';

drop trigger if exists at_guides_asigna_sede on public.at_guides;
create trigger at_guides_asigna_sede
  before insert on public.at_guides
  for each row execute function public.at_asigna_sede_al_pedido();

-- Las funciones de TRIGGER no son superficie invocable. Se revocan a PUBLIC y
-- no solo a anon: en Postgres una función nace con EXECUTE para todo el mundo,
-- y anon lo hereda de ahí — revocarle a él a secas parece funcionar y no hace
-- nada. Ya pasó antes en este repo, y se detectó porque el endpoint seguía
-- respondiendo 200 después de "revocar". Un trigger llamado a mano falla igual,
-- pero no tiene por qué estar al alcance de nadie.
revoke execute on function public.at_asigna_sede_al_pedido() from public, anon, authenticated;
revoke execute on function public.at_zona_de_la_sede() from public, anon, authenticated;
