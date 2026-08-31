-- A TIEMPO LOGÍSTICA — los índices que hoy no hacen falta y mañana sí.
--
-- ── De dónde sale esta lista, y por qué NO son las 32 ─────────────────────
-- El linter de Supabase señala 32 claves foráneas sin índice. Ponerlas todas
-- sería obedecer al linter en vez de mirar la app: un índice no es gratis
-- —cada inserción lo mantiene— y un índice que nadie consulta es solo peso.
--
-- El criterio con el que se filtró, y con el que hay que filtrar el día que el
-- linter vuelva a quejarse:
--
--   SE PONE si la tabla CRECE con la operación y alguien FILTRA por esa
--   columna en una pantalla de verdad.
--
--   NO SE PONE en las columnas de auditoría (`created_by`, `verified_by`,
--   `reviewed_by`, `paid_by`, `reconciled_by`, `connected_by`): existen para
--   dejar constancia de quién hizo qué, y nadie abre nunca una pantalla que
--   diga «todo lo que aprobó Fulano». Su único beneficio sería acelerar el
--   borrado de un perfil, que es una operación de administrador y rarísima.
--
--   NO SE PONE en las tablas de configuración (at_zones 15 filas,
--   at_clients 10, at_client_sites 10, at_facilities 1, at_saas_config 1):
--   Postgres las lee enteras más rápido de lo que consultaría un índice.
--
-- ── Por qué ahora ─────────────────────────────────────────────────────────
-- Porque ahora es gratis. at_guides tiene 3 filas: crear estos índices tarda
-- milisegundos y no bloquea a nadie. Con 50.000 guías y la operación encima,
-- lo mismo es una ventana de mantenimiento.

-- ── La que ya duele hoy ───────────────────────────────────────────────────
-- 2.802 destinatarios, y la zona es por donde se reparten las rutas. Es el
-- único de esta lista que el planificador va a usar desde el primer día.
create index if not exists at_recipients_zone_idx
  on public.at_recipients (zone_id) where zone_id is not null;

-- ── Las que van a doler cuando el negocio ande ────────────────────────────

-- «Qué pedidos trae esta recogida»: lo pregunta el mensajero en la puerta del
-- comercio y el CEDI al recibir el lote.
create index if not exists at_guides_pickup_idx
  on public.at_guides (pickup_id) where pickup_id is not null;

-- «El código de este pedido»: at_delivery_code_whatsapp busca por guía en un
-- buzón que crece con cada entrega y no se vacía nunca (los enviados quedan).
create index if not exists at_message_outbox_guide_idx
  on public.at_message_outbox (guide_id) where guide_id is not null;

-- «Las recogidas de mi sede» y «las que atendí yo». Las dos son pantallas.
create index if not exists at_pickups_facility_idx
  on public.at_pickups (facility_id) where facility_id is not null;

create index if not exists at_pickups_operator_idx
  on public.at_pickups (operator_id) where operator_id is not null;

-- at_profiles es la tabla más leída de la app: cada pantalla empieza
-- preguntando quién eres. «Los mensajeros de mi sede» y «quién cubre esta
-- zona» son las dos consultas que hoy la recorren entera.
create index if not exists at_profiles_facility_idx
  on public.at_profiles (facility_id) where facility_id is not null;

create index if not exists at_profiles_zone_idx
  on public.at_profiles (zone_id) where zone_id is not null;

-- Las encuestas se agrupan por comercio para leer los resultados.
create index if not exists at_survey_responses_client_idx
  on public.at_survey_responses (client_id) where client_id is not null;

-- El cobro mensual de la plataforma cruza cargos con facturas.
create index if not exists at_saas_charges_invoice_idx
  on public.at_saas_charges (invoice_id) where invoice_id is not null;

-- ── Nota sobre los índices que el linter llama «sin usar» ─────────────────
-- Marca cinco (at_profiles_role_idx, at_clients_zone_idx, at_pickups_site_idx,
-- at_rate_limit_ventana_idx, at_courier_positions_updated_idx) y NO se borran.
-- «Sin usar» aquí significa «la operación todavía no tiene volumen», no «no
-- sirve»: con 17 perfiles y 8 recogidas, Postgres lee la tabla entera antes que
-- abrir un índice, y eso es lo correcto. Volver a mirarlo cuando haya meses de
-- operación de verdad; borrarlos hoy es tomar la decisión con los datos de una
-- base vacía.
