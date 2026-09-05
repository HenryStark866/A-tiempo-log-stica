-- ═══════════════════════════════════════════════════════════════════════════
-- QUITAR EL PERMISO «A TODO EL MUNDO» DE DOCE FUNCIONES
--
-- En Postgres, una función creada sin más nace con EXECUTE para PUBLIC, y en
-- Supabase `anon` —el rol de la llave pública, la que va en el navegador de
-- cualquiera— hereda de PUBLIC. Doce de nuestras funciones quedaron así por
-- omisión, no por decisión.
--
-- Son tres grupos y cada uno se arregla distinto:
--
-- ── 1. Cuatro funciones de trigger ─────────────────────────────────────────
-- No son RPC de nadie: son el cuerpo de un trigger. Se les quita el permiso a
-- todos. Los triggers siguen disparando igual: Postgres comprueba EXECUTE al
-- CREAR el trigger, no cada vez que corre. La prueba está en esta misma base,
-- donde once triggers más —at_facturar_guia, at_handle_new_user,
-- at_set_guide_shipping_fee…— nunca tuvieron permiso para authenticated y la
-- operación lleva meses funcionando.
--
-- ── 2. Cuatro auxiliares internas ──────────────────────────────────────────
-- Las llama otra función SQL, nunca el navegador (comprobado: no aparecen en
-- `src/`). Se les quita PUBLIC y conservan `authenticated`.
--
-- ── 3. Cuatro que SÍ son públicas a propósito ──────────────────────────────
-- Rastrear un paquete y pagar un contraentrega tienen que funcionar sin
-- cuenta, y en el registro hay que poder buscar el comercio antes de tenerla.
-- Ya tienen permiso explícito para `anon`, así que quitarles el de PUBLIC no
-- les cambia nada: solo deja escrito a quién se le abrió la puerta, en vez de
-- dejarla abierta y confiar en que nadie más pase.
--
-- Las tres están además limitadas por `at_limitar` y devuelven lo justo
-- (at_track_guide no da ni nombre ni dirección ni teléfono), así que aquí no
-- se cierra un agujero: se ordena el llavero.
--
-- ── Lo que este archivo NO toca, y por qué ─────────────────────────────────
-- `pg_net` sigue registrada en el esquema public. Sus funciones viven en el
-- esquema `net`, que PostgREST no expone, así que desde la llave pública no
-- hay forma de llamarlas. Moverla o cambiarle permisos exige ser
-- `supabase_admin` —no lo somos— y rompería el cron `at-shopify`, que llama a
-- `net.http_post` cada quince minutos. El aviso del linter se queda; el riesgo
-- de tocarlo es mayor que el de dejarlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Triggers: de nadie ──────────────────────────────────────────────────
revoke execute on function public.at_clients_crea_sede_principal() from public, anon, authenticated;
revoke execute on function public.at_evento_al_crear_pedido()      from public, anon, authenticated;
revoke execute on function public.at_guides_asigna_zona()          from public, anon, authenticated;
revoke execute on function public.at_sede_de_la_guia()             from public, anon, authenticated;
revoke execute on function public.at_valida_momento_recogida()     from public, anon, authenticated;
revoke execute on function public.at_zona_del_comercio()           from public, anon, authenticated;

-- ── 2. Auxiliares: con sesión ──────────────────────────────────────────────
revoke execute on function public.at_ciclo_cobro_plataforma() from public;
revoke execute on function public.at_estoy_activo()           from public;
revoke execute on function public.at_franja_de_recogida()     from public;
revoke execute on function public.at_valida_hora_recogida(time without time zone) from public;

grant execute on function public.at_ciclo_cobro_plataforma() to authenticated;
grant execute on function public.at_estoy_activo()           to authenticated;
grant execute on function public.at_franja_de_recogida()     to authenticated;
grant execute on function public.at_valida_hora_recogida(time without time zone) to authenticated;

-- ── 3. Públicas a propósito: dicho con nombre y apellido ───────────────────
revoke execute on function public.at_comercios_para_registro(text) from public;
revoke execute on function public.at_payment_info(text)            from public;
revoke execute on function public.at_track_guide(text)             from public;
revoke execute on function public.at_track_guide_by_token(text)    from public;

grant execute on function public.at_comercios_para_registro(text) to anon, authenticated;
grant execute on function public.at_payment_info(text)            to anon, authenticated;
grant execute on function public.at_track_guide(text)             to anon, authenticated;
grant execute on function public.at_track_guide_by_token(text)    to anon, authenticated;
