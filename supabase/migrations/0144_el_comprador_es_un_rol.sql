-- ═══════════════════════════════════════════════════════════════════════════
-- EL COMPRADOR ES UN ROL
--
-- Hasta hoy, quien compra en la vitrina es un invitado: deja su teléfono en el
-- checkout y no existe en ninguna parte. Eso basta para una compra suelta y no
-- basta para nada más — ni ver sus pedidos, ni repetir una dirección, ni darle
-- una cuenta a alguien que llegó por SMS desde un teléfono de teclas.
--
-- `comprador` es el rol más pequeño de la plataforma: puede verse a sí mismo y
-- a sus pedidos, y nada más. No es `cliente`: un cliente es un COMERCIO que
-- despacha, con tarifa y facturación. Confundirlos daría a quien compró una
-- camiseta la vista del tarifario de un comercio.
--
-- Va en su propia migración porque un valor nuevo de enum no se puede usar en
-- la misma transacción en que se crea — el mismo motivo que la 0125.
-- ═══════════════════════════════════════════════════════════════════════════

alter type public.at_role add value if not exists 'comprador';
