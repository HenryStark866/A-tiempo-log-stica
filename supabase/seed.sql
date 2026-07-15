-- A TIEMPO LOGÍSTICA — datos de demostración
-- Crea zonas de Medellín, 3 clientes e-commerce, 4 usuarios (password: Atiempo2026!)
-- y guías en todas las fases del flujo. Ejecutar UNA sola vez sobre una base con
-- las migraciones 0001-0003 aplicadas.
--
-- NOTA: la inserción directa en auth.users es solo para entornos de demo.
-- En producción crea los usuarios desde el Dashboard de Supabase o con la Admin API.

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_courier uuid := gen_random_uuid();
  v_operator uuid := gen_random_uuid();
  v_client_user uuid := gen_random_uuid();
  z_norte uuid; z_sur uuid; z_centro uuid; z_poblado uuid; z_laureles uuid; z_belen uuid;
  c_nova uuid; c_tech uuid; c_bella uuid;
  g uuid;
begin
  insert into public.at_zones (name, description) values
    ('Norte', 'Aranjuez, Manrique, Castilla, Bello'),
    ('Sur', 'Envigado, Sabaneta, Itagüí, La Estrella'),
    ('Centro', 'La Candelaria, Boston, Prado'),
    ('Poblado', 'El Poblado, Provenza, Manila'),
    ('Laureles', 'Laureles, Estadio, Floresta'),
    ('Belén - Occidente', 'Belén, La América, San Javier');
  select id into z_norte from public.at_zones where name = 'Norte';
  select id into z_sur from public.at_zones where name = 'Sur';
  select id into z_centro from public.at_zones where name = 'Centro';
  select id into z_poblado from public.at_zones where name = 'Poblado';
  select id into z_laureles from public.at_zones where name = 'Laureles';
  select id into z_belen from public.at_zones where name = 'Belén - Occidente';

  insert into public.at_clients (business_name, nit, contact_name, email, phone, address, billing_cycle, delivery_rate, return_rate)
  values ('Nova Moda', '901234567-1', 'Laura Restrepo', 'ventas@novamoda.co', '3001112233', 'Cra 43A #18-50, El Poblado', 'quincenal', 6500, 3200)
  returning id into c_nova;
  insert into public.at_clients (business_name, nit, contact_name, email, phone, address, billing_cycle, delivery_rate, return_rate)
  values ('TechCell Medellín', '901765432-8', 'Andrés Zapata', 'pedidos@techcell.co', '3014445566', 'Cl 50 #46-36, Centro', 'mensual', 7000, 3500)
  returning id into c_tech;
  insert into public.at_clients (business_name, nit, contact_name, email, phone, address, billing_cycle, delivery_rate, return_rate)
  values ('Bella Piel Cosméticos', '900112233-4', 'Carolina Mesa', 'hola@bellapiel.co', '3027778899', 'Circular 74B #39-21, Laureles', 'quincenal', 6000, 3000)
  returning id into c_bella;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin@atiempo.co',
     extensions.crypt('Atiempo2026!', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Henry Taborda"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_courier, 'authenticated', 'authenticated', 'mensajero@atiempo.co',
     extensions.crypt('Atiempo2026!', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Julián Ríos"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_operator, 'authenticated', 'authenticated', 'operario@atiempo.co',
     extensions.crypt('Atiempo2026!', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Sandra Álvarez"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_client_user, 'authenticated', 'authenticated', 'cliente@novamoda.co',
     extensions.crypt('Atiempo2026!', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Laura Restrepo"}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u, u::text,
         jsonb_build_object('sub', u::text, 'email', e, 'email_verified', true),
         'email', now(), now(), now()
  from (values (v_admin,'admin@atiempo.co'), (v_courier,'mensajero@atiempo.co'),
               (v_operator,'operario@atiempo.co'), (v_client_user,'cliente@novamoda.co')) t(u, e);

  update public.at_profiles set role = 'admin', full_name = 'Henry Taborda', phone = '3000000001' where id = v_admin;
  update public.at_profiles set role = 'mensajero', full_name = 'Julián Ríos', phone = '3000000002', zone_id = z_poblado where id = v_courier;
  update public.at_profiles set role = 'operario', full_name = 'Sandra Álvarez', phone = '3000000003' where id = v_operator;
  update public.at_profiles set role = 'cliente', full_name = 'Laura Restrepo', phone = '3001112233', client_id = c_nova where id = v_client_user;

  insert into public.at_pickups (client_id, scheduled_date, address, contact_name, contact_phone, status, operator_id, completed_at, notes)
  values
    (c_nova, current_date, 'Cra 43A #18-50, El Poblado', 'Laura Restrepo', '3001112233', 'pendiente', null, null, '12 paquetes aprox.'),
    (c_tech, current_date - 1, 'Cl 50 #46-36, Centro', 'Andrés Zapata', '3014445566', 'completada', v_operator, now() - interval '26 hours', null),
    (c_bella, current_date, 'Circular 74B #39-21, Laureles', 'Carolina Mesa', '3027778899', 'asignada', v_operator, null, 'Recoger después de las 2pm');

  -- Guías en todas las fases (extracto representativo del flujo completo)
  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, created_at)
  values (c_nova, 'Camilo Torres', '3105551234', 'Cl 10 #43E-31, El Poblado', z_poblado, true, 189000, 189000, 'creada', now() - interval '3 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values (g, 'creada', 'Guía generada por el e-commerce', v_client_user);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, picked_up_at, created_at)
  values (c_bella, 'Mariana López', '3128884567', 'Cra 80 #32-15, Laureles', z_laureles, false, 0, 95000, 'recogida', now() - interval '2 hours', now() - interval '5 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator),
    (g, 'recogida', 'Digitalizada en punto de recogida', v_operator);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, picked_up_at, received_cedi_at, created_at)
  values (c_tech, 'Jorge Mejía', '3156667890', 'Cl 30 #65-40, Belén', z_belen, true, 850000, 850000, 'en_cedi', now() - interval '20 hours', now() - interval '16 hours', now() - interval '26 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator),
    (g, 'en_cedi', 'Escaneo de recepción en bodega', v_operator);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, picked_up_at, received_cedi_at, created_at)
  values (c_nova, 'Valentina Ruiz', '3187771122', 'Cra 65 #98-20, Castilla', z_norte, true, 132000, 132000, 'en_cedi', now() - interval '19 hours', now() - interval '15 hours', now() - interval '24 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, picked_up_at, received_cedi_at, created_at)
  values (c_tech, 'Esteban Cardona', '3163334455', 'Cl 5 Sur #43A-200, El Poblado', z_poblado, false, 0, 420000, 'zonificada', v_courier, now() - interval '22 hours', now() - interval '18 hours', now() - interval '28 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', 'Asignada a Julián Ríos', v_admin);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, picked_up_at, received_cedi_at, created_at)
  values (c_nova, 'Daniela Gómez', '3199990011', 'Cra 35 #7-40, Provenza', z_poblado, true, 245000, 245000, 'en_ruta', v_courier, now() - interval '23 hours', now() - interval '19 hours', now() - interval '29 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', 'Mensajero inició recorrido', v_courier);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, picked_up_at, received_cedi_at, created_at)
  values (c_bella, 'Sara Betancur', '3141112233', 'Cl 33 #78-25, Laureles', z_laureles, true, 78000, 78000, 'en_ruta', v_courier, now() - interval '23 hours', now() - interval '19 hours', now() - interval '30 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, picked_up_at, received_cedi_at, delivered_at, created_at)
  values (c_nova, 'Felipe Arango', '3172223344', 'Cl 44 #80-15, Estadio', z_laureles, true, 156000, 156000, 'entregada', v_courier, now() - interval '26 hours', now() - interval '22 hours', now() - interval '3 hours', now() - interval '30 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier),
    (g, 'entregada', 'Recaudo contraentrega: $156.000 en efectivo', v_courier);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, picked_up_at, received_cedi_at, delivered_at, created_at)
  values (c_tech, 'Luisa Fernanda Ortiz', '3183334455', 'Cra 48 #10-45, El Poblado', z_poblado, true, 320000, 320000, 'entregada', v_courier, now() - interval '27 hours', now() - interval '23 hours', now() - interval '2 hours', now() - interval '31 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier),
    (g, 'entregada', 'Recaudo contraentrega: $320.000 digital', v_courier);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, picked_up_at, received_cedi_at, delivered_at, created_at)
  values
    (c_nova, 'Andrea Quintero', '3104445566', 'Cl 20 #55-10, Centro', z_centro, false, 0, 88000, 'entregada', v_courier, now() - interval '8 days', now() - interval '8 days' + interval '4 hours', now() - interval '7 days', now() - interval '9 days'),
    (c_nova, 'Ricardo Palacio', '3115556677', 'Cra 70 #45-30, Estadio', z_laureles, false, 0, 134000, 'entregada', v_courier, now() - interval '6 days', now() - interval '6 days' + interval '4 hours', now() - interval '5 days', now() - interval '7 days'),
    (c_tech, 'Manuela Sierra', '3126667788', 'Cl 79 #45-11, Manrique', z_norte, false, 0, 560000, 'entregada', v_courier, now() - interval '5 days', now() - interval '5 days' + interval '5 hours', now() - interval '4 days', now() - interval '6 days');

  insert into public.at_guide_events (guide_id, status, actor_id)
  select id, 'creada', v_operator from public.at_guides where status = 'entregada' and delivered_at < now() - interval '1 day';
  insert into public.at_guide_events (guide_id, status, actor_id)
  select id, 'entregada', v_courier from public.at_guides where status = 'entregada' and delivered_at < now() - interval '1 day';

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, courier_id, delivery_attempts, picked_up_at, received_cedi_at, created_at)
  values (c_bella, 'Pedro Nel Gómez', '3137778899', 'Cl 92 #70-12, Castilla', z_norte, true, 67000, 67000, 'novedad', v_courier, 1, now() - interval '28 hours', now() - interval '24 hours', now() - interval '32 hours')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier),
    (g, 'novedad', 'Destinatario ausente, no contesta el teléfono', v_courier);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, delivery_attempts, picked_up_at, received_cedi_at, created_at)
  values (c_nova, 'Gloria Inés Vélez', '3148889900', 'Cra 52 #73-20, Aranjuez', z_norte, false, 0, 110000, 'reprogramada', 1, now() - interval '2 days', now() - interval '2 days' + interval '4 hours', now() - interval '3 days')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier),
    (g, 'novedad', 'Dirección errada', v_courier),
    (g, 'reprogramada', '1er intento fallido: reprogramada para nuevo despacho', v_operator);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, delivery_attempts, picked_up_at, received_cedi_at, created_at)
  values (c_tech, 'Óscar Duque', '3159990011', 'Cl 65 #45-80, Prado', z_centro, true, 480000, 480000, 'en_devolucion', 2, now() - interval '4 days', now() - interval '4 days' + interval '4 hours', now() - interval '5 days')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'recogida', null, v_operator), (g, 'en_cedi', null, v_operator),
    (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier), (g, 'novedad', 'Rechazado por el destinatario', v_courier),
    (g, 'reprogramada', null, v_operator), (g, 'zonificada', null, v_admin), (g, 'en_ruta', null, v_courier),
    (g, 'novedad', '2do intento: rechazo definitivo', v_courier),
    (g, 'en_devolucion', '2do intento fallido: pasa a logística inversa', v_operator);

  insert into public.at_guides (client_id, recipient_name, recipient_phone, recipient_address, zone_id, is_cod, cod_amount, declared_value, status, delivery_attempts, picked_up_at, received_cedi_at, returned_at, created_at)
  values (c_bella, 'Marta Cecilia Ossa', '3160001122', 'Cra 43 #30-15, Buenos Aires', z_centro, true, 54000, 54000, 'devuelta', 2, now() - interval '9 days', now() - interval '9 days' + interval '4 hours', now() - interval '6 days', now() - interval '10 days')
  returning id into g;
  insert into public.at_guide_events (guide_id, status, note, actor_id) values
    (g, 'creada', null, v_operator), (g, 'novedad', '1er intento fallido', v_courier),
    (g, 'novedad', '2do intento fallido', v_courier),
    (g, 'devuelta', 'Entregada de vuelta al e-commerce Bella Piel', v_operator);

end $$;
