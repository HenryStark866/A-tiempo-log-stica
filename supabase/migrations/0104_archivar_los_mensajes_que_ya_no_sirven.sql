-- ═══════════════════════════════════════════════════════════════════════════
-- ARCHIVAR LOS MENSAJES QUE YA NO SIRVEN
--
-- La cola llevaba desde siempre acumulando sin que nadie la vaciara (ver 0102).
-- Lo acumulado son cuatro códigos de entrega de DOS paquetes que ya están
-- `entregada`: uno de hace siete días y otro de hace día y medio.
--
-- El día que se configure el puente de WhatsApp, esos cuatro salen de golpe y
-- dos personas reciben «este es el código de tu paquete» por algo que ya
-- tienen en casa. No es solo ruido: un código de entrega es lo que prueba
-- quién recibe, y mandarlo cuando ya no hace falta lo convierte en un dato
-- suelto por ahí sin motivo.
--
-- Se archivan como fallidos con el motivo escrito, en vez de borrarlos: el
-- historial de qué se intentó mandar y por qué no salió vale más que una tabla
-- limpia.
--
-- La regla que evita que vuelva a pasar vive en la Edge Function
-- (CADUCA_TRAS_HORAS = 12); esto solo limpia lo que ya estaba.
-- ═══════════════════════════════════════════════════════════════════════════

update public.at_message_outbox
set status = 'fallido',
    error  = 'Caducado: se encoló hace más de 12 h y el paquete ya se entregó'
where status = 'pendiente'
  and created_at < now() - interval '12 hours';
