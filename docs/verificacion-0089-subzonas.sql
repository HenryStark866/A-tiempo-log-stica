-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN DE LA 0089 — las 10 sub-zonas
--
-- Bloques 1 a 6: solo lectura, se pueden correr antes y después.
-- Bloque 7: la marcha atrás, comentada.
--
-- Proyecto: uhbtivaepyhwfdvtpfjq  ⚠ es el de PRODUCCIÓN (ver
-- docs/despliegue-supabase.md). Los bloques 1-6 no escriben nada; el 7 sí, y
-- por eso va comentado y dentro de una transacción.
-- https://supabase.com/dashboard/project/uhbtivaepyhwfdvtpfjq/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ANTES DE APLICAR ─────────────────────────────────────────────────────

-- 1. La foto de cómo está hoy. Guárdala: es contra esto que vas a comparar,
--    y es lo que necesitarías para reconstruir a mano si algo saliera raro.
select z.sort_order, z.name, z.delivery_rate, z.active,
       (select count(*) from public.at_guides g where g.zone_id = z.id)  as guias,
       (select count(*) from public.at_clients c where c.zone_id = z.id) as comercios
from public.at_zones z
order by z.active desc, z.sort_order;

-- 2. ¿Cuánto se está cobrando hoy? Compáralo con el mismo query después.
select coalesce(z.code, z.name) as zona,
       count(*) as guias, sum(g.shipping_fee) as total_congelado
from public.at_guides g
left join public.at_zones z on z.id = g.zone_id
where g.status not in ('entregada','devuelta','cancelada')
group by 1 order by 1;

-- ── DESPUÉS DE APLICAR ───────────────────────────────────────────────────

-- 3. Las 10 llegaron, las 5 se jubilaron. Se esperan 10 activas con código y
--    5 inactivas sin él.
select count(*) filter (where code is not null and active)     as "sub-zonas nuevas activas",
       count(*) filter (where code is null and not active)     as "zonas viejas jubiladas",
       count(*) filter (where code is null and active)         as "viejas todavía activas ⚠",
       count(*) filter (where facility_id is null)             as "sin CEDI ⚠ (serían invisibles)"
from public.at_zones;

-- 4. Las tarifas, como quedaron.
select code, name, delivery_rate, sort_order
from public.at_zones where code is not null order by sort_order;

-- 5. ⚠ EL CHEQUEO QUE MÁS IMPORTA: nada se quedó sin zona.
--    Una guía sin zona no da error — se factura en CERO (at_cobro_de_guia,
--    migración 0062). Se esperan CERO filas en las tres consultas.
select 'guía sin zona' as que, guide_number as cual, recipient_city || ' ' || recipient_address as dato
from public.at_guides
where zone_id is null and status not in ('entregada','devuelta','cancelada')
union all
select 'comercio sin zona', business_name, coalesce(city,'') || ' ' || coalesce(address,'')
from public.at_clients where zone_id is null and active
union all
select 'guía con zona jubilada', g.guide_number, z.name
from public.at_guides g join public.at_zones z on z.id = g.zone_id
where not z.active and g.status not in ('entregada','devuelta','cancelada');

-- 6. La prueba real: direcciones conocidas y a qué sub-zona caen ahora.
--    Cambia las direcciones por las que use tu operación de verdad.
select d.dir,
       coalesce(z.code, '⚠ SIN ZONA') as subzona,
       z.name,
       to_char(z.delivery_rate, 'FM$999G999') as tarifa
from (values
  ('Medellín Cra 68 #87-56'),
  ('Medellín Castilla, Cra 68'),
  ('Medellín Robledo, Cll 65'),
  ('Medellín Aranjuez, Cra 50A'),
  ('Medellín El Poblado, Cra 43A'),
  ('Medellín Laureles, Cll 33'),
  ('Medellín Centro, Cll 50'),
  ('Medellín Popular, sector alto'),
  ('Itagüí Cra 50'),
  ('Envigado El Esmeraldal'),
  ('Girardota parque principal'),
  ('Caldas La Miel')
) as d(dir)
left join public.at_zones z on z.id = public.at_zone_for_city(d.dir);

-- ── 7. MARCHA ATRÁS ──────────────────────────────────────────────────────
-- Solo si algo salió mal. Funciona porque la 0089 no borró nada: las cinco
-- zonas viejas siguen en la tabla con su cobertura intacta.
--
-- Lo que NO deshace: el shipping_fee de las guías que se recalcularon vuelve a
-- calcularse con las tarifas viejas, así que las guías quedan como estaban;
-- pero si alguna se entregó entre medias, su precio ya está congelado con la
-- tarifa nueva y este bloque no lo toca (ni debe).
--
-- Descomenta el bloque entero y córrelo de una sola vez.
/*
begin;
  update public.at_zones set active = true,  sort_order = sort_order - 90 where code is null and not active;
  update public.at_zones set active = false where code is not null;

  update public.at_clients      set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''));
  update public.at_client_sites set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''));
  update public.at_recipients   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''));
  update public.at_guides       set zone_id = public.at_zone_for_city(coalesce(recipient_city,'') || ' ' || coalesce(recipient_address,''));

  -- Revisa que el conteo por zona se parezca al del bloque 1 ANTES de confirmar.
  select coalesce(z.code, z.name) as zona, count(*)
  from public.at_guides g left join public.at_zones z on z.id = g.zone_id
  group by 1 order by 1;
commit;   -- o `rollback;` si el conteo no cuadra
*/
