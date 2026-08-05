-- ═══════════════════════════════════════════════════════════════════════════
-- A TIEMPO LOGÍSTICA — que la base cuente los días como los cuenta Medellín
--
-- La base corre en UTC (`show timezone` → UTC). Todo lo que guarda es
-- `timestamptz`, así que los instantes están bien: lo que estaba mal era
-- CUÁNDO empieza un día. Para Postgres el día cambiaba a la medianoche UTC,
-- que en Medellín son las 7:00 p. m. En la práctica:
--
--   · «Guías creadas hoy» y «Entregadas hoy» del dashboard se reiniciaban a
--     cero a las 7 p. m., con la operación todavía en la calle.
--   · «Entregadas hoy» de cada mensajero en el mapa, lo mismo.
--   · Una recogida solicitada después de las 7 p. m. sin fecha explícita se
--     programaba para el día siguiente.
--   · Un cierre de caja o una factura del día X incluían las entregas hechas
--     entre las 7 p. m. y la medianoche del día ANTERIOR.
--
-- El arreglo es fijar la zona horaria de la operación en cada función que
-- hable de días, con `ALTER FUNCTION ... SET timezone`. Dentro de esas
-- funciones, `current_date` y cualquier `timestamptz::date` pasan a resolverse
-- en hora de Medellín; el cuerpo no se toca, así que no hay forma de que se
-- cuele un cambio de lógica junto con el de zona.
--
-- Se hace función por función y NO con `alter database ... set timezone`: esta
-- base está compartida con otro producto, y cambiarle la zona a todo el motor
-- movería también lo que no es de A Tiempo. Aquí solo se toca lo que empieza
-- por `at_`.
-- ═══════════════════════════════════════════════════════════════════════════

-- Dashboard: «creadas hoy» y «entregadas hoy».
alter function public.at_dashboard_kpis()
  set timezone to 'America/Bogota';

-- Mapa de flota: «entregadas hoy» por mensajero.
alter function public.at_live_couriers()
  set timezone to 'America/Bogota';

-- Cierre de caja: qué recaudos entran en la consignación de una fecha.
alter function public.at_create_settlement(p_courier_id uuid, p_date date)
  set timezone to 'America/Bogota';

-- Facturación: qué entregas y devoluciones caen dentro del período.
alter function public.at_generate_invoice(p_client_id uuid, p_period_start date, p_period_end date)
  set timezone to 'America/Bogota';

-- Recogidas: la fecha por defecto cuando el comercio no elige una, y la
-- validación de «esa fecha ya pasó» al corregir una solicitud.
alter function public.at_request_pickup(
  p_client_id uuid, p_scheduled_date date, p_scheduled_time time,
  p_address text, p_contact_name text, p_contact_phone text,
  p_notes text, p_guide_ids uuid[]
) set timezone to 'America/Bogota';

alter function public.at_update_pickup(
  p_pickup_id uuid, p_scheduled_date date, p_scheduled_time time,
  p_address text, p_contact_name text, p_contact_phone text,
  p_notes text, p_guide_ids uuid[]
) set timezone to 'America/Bogota';

-- Y los dos valores por defecto de columna, que se evalúan fuera de cualquier
-- función y por lo tanto no los alcanza lo anterior.
alter table public.at_pickups
  alter column scheduled_date set default (now() at time zone 'America/Bogota')::date;

alter table public.at_settlements
  alter column settlement_date set default (now() at time zone 'America/Bogota')::date;
