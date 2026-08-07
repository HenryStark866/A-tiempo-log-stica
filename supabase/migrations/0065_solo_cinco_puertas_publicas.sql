-- A TIEMPO LOGÍSTICA — que la puerta pública sean cinco funciones y nada más.
--
-- Al revisar qué puede llamar alguien sin cuenta aparecieron once funciones
-- nuestras, no cinco. Las seis de más no son un agujero —son SECURITY INVOKER,
-- o sea que corren con los permisos de quien llama, y RLS las frena igual— pero
-- están expuestas sin que nadie lo decidiera: en Postgres una función nace con
-- EXECUTE para todo el mundo, y si la migración que la creó no lo revocó, ahí
-- se queda.
--
-- Dos son de esta misma semana y una es una función de trigger, que llamada a
-- mano ni siquiera tiene sentido. Ninguna de las seis la usa la aplicación: se
-- comprobó en el código antes de tocarlas.
--
-- La superficie pública queda en exactamente cinco, todas con motivo:
--   at_track_guide          rastreo por número de guía
--   at_track_guide_by_token rastreo por el enlace del paquete
--   at_payment_info         datos de pago del contraentrega
--   at_landing_brands       los logos de la portada
--   at_log_security_event   anotar un login fallido, que ocurre sin sesión
--
-- Hay que revocar a PUBLIC, no solo a anon: el permiso que tiene anon no se lo
-- dio nadie a él, lo hereda del EXECUTE a PUBLIC con el que nace toda función
-- en Postgres. Un `revoke ... from anon` a secas parece funcionar y no hace
-- nada — se comprobó llamando al endpoint, que seguía respondiendo 200 después
-- de revocar. Por eso después hay que devolverle el permiso a authenticated:
-- al quitárselo a PUBLIC, se lo quitamos también a los usuarios con sesión.

revoke execute on function public.at_ciclo_cobro() from public, anon;
revoke execute on function public.at_cobro_de_guia(public.at_guides) from public, anon;
revoke execute on function public.at_norm(text) from public, anon;
revoke execute on function public.at_required_courier_docs(public.at_courier_type) from public, anon;
revoke execute on function public.at_required_facility_docs() from public, anon;
revoke execute on function public.at_zona_del_comercio() from public, anon;

grant execute on function public.at_ciclo_cobro() to authenticated;
grant execute on function public.at_cobro_de_guia(public.at_guides) to authenticated;
grant execute on function public.at_norm(text) to authenticated;
grant execute on function public.at_required_courier_docs(public.at_courier_type) to authenticated;
grant execute on function public.at_required_facility_docs() to authenticated;
-- at_zona_del_comercio es función de TRIGGER: se dispara sola con la fila, no
-- la llama nadie. No se le devuelve permiso a nadie.
