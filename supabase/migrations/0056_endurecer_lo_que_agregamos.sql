-- A TIEMPO LOGÍSTICA — cerrar los cabos sueltos de las últimas entregas.
--
-- Salió de auditar la base con los advisors de Supabase y de revisar a mano lo
-- que agregué en las migraciones 0046–0053. Nada de esto rompía nada todavía,
-- pero son las tres formas típicas en que un esquema nuevo se degrada: un
-- permiso que sobra, una función sin search_path fijo, y una columna que
-- apunta a otra tabla sin decirlo.

-- ── 1. Integridad de la remesa ────────────────────────────────────────────
-- at_guides.remittance_id se agregó como uuid suelto: la base no sabía que
-- apunta a at_cod_remittances, así que nada impedía dejar ahí un id que no
-- existe, ni avisaba si se borraba la remesa. Con la FK, borrar una remesa
-- libera sus guías (vuelven a quedar por girar) en vez de dejarlas apuntando
-- al vacío.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name
    where tc.table_name = 'at_guides' and tc.constraint_type = 'FOREIGN KEY'
      and k.column_name = 'remittance_id'
  ) then
    alter table public.at_guides
      add constraint at_guides_remittance_fk
      foreign key (remittance_id) references public.at_cod_remittances(id) on delete set null;
  end if;
end $$;

-- ── 2. Índices que faltaban ───────────────────────────────────────────────
-- Todas son columnas por las que SÍ se filtra en caliente: el corte por CEDI
-- entra en casi toda consulta de guías, y la remesa recorre las guías del
-- comercio cada vez que se gira.
create index if not exists at_guides_facility_idx    on public.at_guides (facility_id);
create index if not exists at_guides_remittance_idx  on public.at_guides (remittance_id);
create index if not exists at_clients_zone_idx       on public.at_clients (zone_id);
create index if not exists at_facility_settlements_facility_idx
  on public.at_facility_settlements (facility_id, status);

-- ── 3. search_path fijo ───────────────────────────────────────────────────
-- Tres funciones mías quedaron sin `set search_path`. En una función que
-- corre con los privilegios de quien la invoca el riesgo es menor, pero es
-- exactamente el descuido que convierte un esquema temporal en una vía para
-- suplantar una tabla. Se fijan, y de paso quedan iguales al resto del
-- esquema, que ya lo hacía.
create or replace function public.at_set_guide_facility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facility_id is null then
    select facility_id into new.facility_id
    from public.at_clients where id = new.client_id;
  end if;
  return new;
end $$;

create or replace function public.at_set_pickup_facility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facility_id is null then
    select facility_id into new.facility_id
    from public.at_clients where id = new.client_id;
  end if;
  return new;
end $$;

create or replace function public.at_required_facility_docs()
returns public.at_facility_doc_type[]
language sql immutable
set search_path = public
as $$
  select array[
    'cedula_frente', 'cedula_reverso',
    'documento_local', 'recibo_servicio_publico', 'foto_local'
  ]::public.at_facility_doc_type[]
$$;

grant execute on function public.at_required_facility_docs() to authenticated;

-- ── 4. Permisos que sobraban ──────────────────────────────────────────────
-- Postgres le da EXECUTE a `public` por omisión a cada función nueva, y de
-- ahí lo hereda `anon` —o sea, cualquiera sin cuenta—. En las funciones de
-- disparador ni siquiera hace falta el permiso: el trigger corre por su
-- cuenta, no porque alguien la llame. Y at_generar_zonas_por_defecto solo la
-- usa at_aprobar_solicitud_cedi por dentro.
--
-- Se dejan intactas a propósito las que SÍ son públicas por diseño:
-- at_track_guide, at_track_guide_by_token y at_payment_info (el destinatario
-- rastrea y paga sin cuenta), at_landing_brands (la portada) y
-- at_log_security_event (registra intentos de quien todavía no entró).
revoke all on function public.at_facturar_guia()          from public, anon, authenticated;
revoke all on function public.at_set_guide_shipping_fee()  from public, anon, authenticated;
revoke all on function public.at_set_guide_facility()      from public, anon, authenticated;
revoke all on function public.at_set_pickup_facility()     from public, anon, authenticated;
revoke all on function public.at_generar_zonas_por_defecto(uuid, text) from public, anon, authenticated;

-- ── 5. Un comercio sin zona de origen no puede cobrarse bien ──────────────
-- No es un error del código: las direcciones registradas no traen barrio y
-- at_zone_for_city no puede deducir la zona. Queda esta vista para que el
-- CEDI vea de un vistazo a quién le falta, en vez de descubrirlo cuando
-- llegue una factura con la tarifa completa.
create or replace view public.at_comercios_sin_zona as
  select c.id, c.business_name, c.address, c.phone,
         (select count(*) from public.at_guides g
          where g.client_id = c.id and g.status not in ('entregada','devuelta','cancelada')) as guias_en_vuelo
  from public.at_clients c
  where c.active and c.zone_id is null;

comment on view public.at_comercios_sin_zona is
  'Comercios a los que todavía se les cobra la tarifa completa desde el CEDI porque nadie les fijó su zona de origen.';
