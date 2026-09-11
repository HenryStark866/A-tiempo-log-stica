-- ═══════════════════════════════════════════════════════════════════════════
-- AL ORIENTE SE LE PAGA DISTINTO: $6.000 POR ENTREGA, NO LOS $4.000 DE FÁBRICA
--
-- La 0123 sembró el tarifario del oriente heredando el pago al mensajero de
-- las demás zonas ($4.000) para no decidir dos cosas a la vez, y dejó dicho
-- que ir a Rionegro no es ir a Envigado: el viaje es otro y merecía su propia
-- conversación con la operación.
--
-- Esa conversación ya pasó. La tabla completa, para que quede el porqué:
--
--   Zona                        Tarifa    Mensajero   % que le llega
--   Sur Inmediato Plano         $11.000    $4.000        36,4%
--   Medellín Centro-Oriente     $14.000    $4.000        28,6%
--   Medellín Norte Lomas        $18.000    $4.000        22,2%
--   Norte Extendido             $21.000    $4.000        19,0%
--   Sur Extendido               $15.000    $4.000        26,7%
--   Rionegro / Oriente Cercano  $25.000    $4.000 → $6.000   16,0% → 24,0%
--
-- El pago al mensajero siempre fue plano en toda la operación: entre más lejos
-- la zona, menor la proporción que le queda, y eso ya se había aceptado para
-- Norte y Sur Extendido. Pero Rionegro quedaba por debajo de todas —peor
-- proporción que Norte Extendido, siendo un viaje bastante más largo (Sabaneta
-- → Rionegro por Las Palmas o el Túnel de Oriente, 40-55 min por trayecto,
-- fuera del Valle de Aburrá)—. Decidido: $6.000, un plano distinto para un
-- viaje distinto, no la simple igualación a un porcentaje de otra zona.
--
-- Solo toca el costo del mensajero. La tarifa que paga el comercio ($25.000,
-- 0123) no cambia: esto es un ajuste de reparto interno, no de precio de venta.
-- ═══════════════════════════════════════════════════════════════════════════

update public.at_zone_costs zc
   set courier_fee = 6000
  from public.at_zones z
 where z.id = zc.zone_id
   and z.code in ('EXT-RIO', 'EXT-ORI');

do $$
declare v_faltan int;
begin
  select 2 - count(*) into v_faltan
  from public.at_zone_costs zc
  join public.at_zones z on z.id = zc.zone_id
  where z.code in ('EXT-RIO', 'EXT-ORI') and zc.courier_fee = 6000;

  if v_faltan <> 0 then
    raise exception 'No se actualizó el pago al mensajero en % zona(s) del oriente. Revisa at_zone_costs.', v_faltan;
  end if;
end $$;

-- ── Cómo se comprueba ─────────────────────────────────────────────────────
--   select z.code, z.name, z.delivery_rate, zc.courier_fee
--   from public.at_zones z join public.at_zone_costs zc on zc.zone_id = z.id
--   where z.code in ('EXT-RIO','EXT-ORI');
