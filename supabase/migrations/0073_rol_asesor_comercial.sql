-- A TIEMPO LOGÍSTICA — nace el rol de asesor comercial.
--
-- Un comercio deja de ser una sola persona. El dueño sigue siendo quien manda
-- —ve la plata, cambia los datos del negocio, aprueba a quién entra— y el
-- asesor es quien mueve el día: registra pedidos y pide recogidas.
--
-- Esta migración hace UNA sola cosa: agregar el valor al enum. Va sola a
-- propósito. Postgres no permite usar un valor de enum recién creado dentro de
-- la misma transacción en la que se creó ("unsafe use of new value of enum
-- type"), y las migraciones corren en una transacción. Meterlo junto con las
-- funciones que lo comparan haría fallar la migración entera.
--
-- Lo que el asesor puede y no puede hacer llega en 0074.

alter type public.at_role add value if not exists 'asesor';
