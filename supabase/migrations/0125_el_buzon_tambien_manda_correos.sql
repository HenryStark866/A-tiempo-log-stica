-- A TIEMPO LOGÍSTICA — el buzón de mensajes aprende un tercer canal: correo.
--
-- Va sola en su archivo a propósito: Postgres no deja usar un valor nuevo de
-- un enum dentro de la misma transacción que lo crea, y la 0126 lo usa.

alter type public.at_msg_channel add value if not exists 'email';
