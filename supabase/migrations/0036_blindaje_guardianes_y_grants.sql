-- A TIEMPO LOGÍSTICA — blindaje de guardianes de rol y de permisos

-- ═══════════════════════════════════════════════════════════════════════
-- 1) VULNERABILIDAD VIVA: at_report_deposit
--
-- `if not (at_is_ops() or v_s.courier_id = auth.uid())` se evalúa a NULL
-- cuando no hay sesión: at_is_ops() da `false` (real, por el coalesce en su
-- definición), pero `v_s.courier_id = auth.uid()` da NULL porque auth.uid()
-- es NULL. `false or NULL` es NULL, y `not NULL` sigue siendo NULL — un
-- `if NULL` en PL/pgSQL no entra a la rama, así que la excepción nunca se
-- lanza. Como esta función SÍ tenía EXECUTE otorgado a anon (ver punto 3),
-- cualquiera sin sesión podía marcar como consignado cualquier cierre de
-- caja con el monto y la referencia que quisiera, con solo conocer su id.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.at_report_deposit(p_settlement_id uuid, p_amount numeric, p_reference text)
returns public.at_settlements
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_s public.at_settlements;
begin
  select * into v_s from public.at_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Cierre no encontrado'; end if;
  if not (public.at_is_ops() or coalesce(v_s.courier_id = auth.uid(), false)) then
    raise exception 'No autorizado';
  end if;
  if v_s.status not in ('pendiente') then
    raise exception 'Este cierre ya fue consignado o conciliado';
  end if;

  update public.at_settlements set
    deposited_amount = p_amount,
    bank_reference = p_reference,
    status = 'consignado'
  where id = p_settlement_id
  returning * into v_s;
  return v_s;
end $function$;

-- El mismo patrón `not (A or B)` con una comparación contra auth.uid() que
-- puede ser NULL aparecía en estas dos. No estaban expuestas a anon (punto 3
-- las protegía por permisos), pero cualquier mensajero u operario —cuyo
-- client_id propio es NULL— podía tocar la vitrina o el logo de un comercio
-- ajeno, porque `p_client_id = NULL` también da NULL.
create or replace function public.at_set_client_landing(p_client_id uuid, p_show boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_logo text;
begin
  if not (public.at_is_ops() or coalesce(p_client_id = public.at_my_client(), false)) then
    raise exception 'No puedes cambiar la vitrina de otro comercio';
  end if;

  select logo_url into v_logo from public.at_clients where id = p_client_id;
  if not found then
    raise exception 'Ese comercio no existe';
  end if;

  if p_show and v_logo is null then
    raise exception 'Primero sube el logo del comercio';
  end if;

  update public.at_clients
  set show_in_landing = p_show
  where id = p_client_id;
end $function$;

create or replace function public.at_set_client_logo(p_client_id uuid, p_logo_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (public.at_is_ops() or coalesce(p_client_id = public.at_my_client(), false)) then
    raise exception 'No puedes cambiar el logo de otro comercio';
  end if;

  update public.at_clients
  set logo_url = p_logo_url
  where id = p_client_id;

  if not found then
    raise exception 'Ese comercio no existe';
  end if;
end $function$;

-- Idem: `at_my_role() = 'cliente'` da NULL sin sesión.
create or replace function public.at_dashboard_kpis()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client uuid := public.at_my_client();
  v_es_cliente boolean := public.at_my_role() = 'cliente';
  result json;
begin
  if not (public.at_is_staff() or coalesce(public.at_my_role() = 'cliente', false)) then
    raise exception 'No autorizado';
  end if;

  select json_build_object(
    'by_status', (
      select coalesce(json_object_agg(status, n), '{}'::json)
      from (select status, count(*) n from public.at_guides
            where v_client is null or client_id = v_client group by status) s
    ),
    'guides_today', (
      select count(*) from public.at_guides
      where created_at::date = current_date and (v_client is null or client_id = v_client)
    ),
    'delivered_today', (
      select count(*) from public.at_guides
      where delivered_at::date = current_date and (v_client is null or client_id = v_client)
    ),
    'ltr_hours', (
      select round(avg(extract(epoch from (picked_up_at - created_at)) / 3600)::numeric, 1)
      from public.at_guides
      where picked_up_at is not null and created_at > now() - interval '30 days'
        and (v_client is null or client_id = v_client)
    ),
    'tli_pct', (
      select round(100.0 * count(*) filter (where status = 'devuelta')
             / nullif(count(*) filter (where status in ('entregada','devuelta')), 0), 1)
      from public.at_guides
      where created_at > now() - interval '30 days' and (v_client is null or client_id = v_client)
    ),
    'cod_pending', (
      select coalesce(sum(cod_amount),0) from public.at_guides
      where is_cod and status = 'entregada' and settlement_id is null
        and (v_client is null or client_id = v_client)
    ),
    'settlements_pending', case when v_es_cliente then 0 else (
      select count(*) from public.at_settlements where status in ('pendiente','consignado')
    ) end,
    'active_couriers', (
      select count(distinct courier_id) from public.at_guides
      where status in ('zonificada','en_ruta') and courier_id is not null
        and (v_client is null or client_id = v_client)
    )
  ) into result;

  return result;
end $function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) Caída al vacío: el bloque `if v_role = 'mensajero' then ... elsif
-- v_role not in (...) then raise` no cubre v_role NULL — ambas condiciones
-- dan NULL, ninguna rama corre, y la función sigue de largo sin haber
-- validado nada. No estaba explotable hoy (anon no tiene EXECUTE aquí y un
-- perfil autenticado siempre trae rol), pero es el mismo patrón fragilizado
-- que sí costó una brecha real arriba: se cierra igual.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.at_confirm_pickup(p_pickup_id uuid, p_guide_ids uuid[], p_note text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pickup    public.at_pickups;
  v_role      public.at_role := public.at_my_role();
  v_recogidas int := 0;
  v_faltantes int := 0;
  v_comercio  text;
  v_ops       record;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;

  if v_role is null then
    raise exception 'No autorizado';
  elsif v_role = 'mensajero' then
    if v_pickup.operator_id is distinct from auth.uid() then
      raise exception 'Esta recogida no está asignada a tu perfil';
    end if;
  elsif v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  if v_pickup.status not in ('asignada','en_curso') then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  if coalesce(array_length(p_guide_ids, 1), 0) = 0 then
    raise exception 'Marca al menos un paquete, o reporta la recogida como fallida';
  end if;

  update public.at_guides g
  set status = 'recogida', picked_up_at = now()
  where g.pickup_id = p_pickup_id
    and g.id = any(p_guide_ids)
    and g.status = 'creada';
  get diagnostics v_recogidas = row_count;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  select g.id, 'recogida',
         coalesce(nullif(trim(p_note),'') || ' · ', '') || 'Recogida verificada en el comercio',
         auth.uid()
  from public.at_guides g
  where g.pickup_id = p_pickup_id and g.id = any(p_guide_ids) and g.status = 'recogida';

  update public.at_guides g
  set pickup_id = null
  where g.pickup_id = p_pickup_id
    and g.status = 'creada'
    and not (g.id = any(p_guide_ids));
  get diagnostics v_faltantes = row_count;

  update public.at_pickups
  set status = 'completada',
      completed_at = now(),
      package_count = v_recogidas,
      notes = case
        when v_faltantes > 0
        then coalesce(notes || ' · ', '') || v_faltantes || ' paquete(s) no estaban listos'
        else notes end
  where id = p_pickup_id;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;

  for v_ops in
    select id from public.at_profiles
    where role in ('operario','coordinador','admin') and active
  loop
    insert into public.at_notifications (user_id, title, body, link)
    values (
      v_ops.id,
      'Recogida en camino al CEDI',
      coalesce(v_comercio,'Un comercio') || ' · ' || v_recogidas || ' paquete(s)'
        || case when v_faltantes > 0
                then ' · ' || v_faltantes || ' no estaban listos' else '' end,
      '/mapa'
    );
  end loop;

  return json_build_object(
    'recogidas', v_recogidas,
    'faltantes', v_faltantes,
    'comercio',  v_comercio
  );
end $function$;

create or replace function public.at_start_pickup(p_pickup_id uuid)
returns public.at_pickups
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pickup   public.at_pickups;
  v_role     public.at_role := public.at_my_role();
  v_comercio text;
  v_ops      record;
  v_nombre   text;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;

  if v_role is null then
    raise exception 'No autorizado';
  elsif v_role = 'mensajero' then
    if v_pickup.operator_id is distinct from auth.uid() then
      raise exception 'Esta recogida no está asignada a tu perfil';
    end if;
  elsif v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  if v_pickup.status = 'en_curso' then
    return v_pickup;
  end if;
  if v_pickup.status <> 'asignada' then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  update public.at_pickups
  set status = 'en_curso', started_at = now()
  where id = p_pickup_id
  returning * into v_pickup;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;
  select full_name    into v_nombre    from public.at_profiles where id = v_pickup.operator_id;

  for v_ops in
    select id from public.at_profiles
    where role in ('operario','coordinador','admin') and active
  loop
    insert into public.at_notifications (user_id, title, body, link)
    values (v_ops.id, 'Mensajero en camino al comercio',
            coalesce(v_nombre,'Un mensajero') || ' salió hacia ' ||
            coalesce(v_comercio,'un comercio') || ' · ' || v_pickup.address,
            '/mapa');
  end loop;

  return v_pickup;
end $function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Por qué la 0004 no bastó: `revoke execute ... from anon` no le quita
-- nada a anon si el privilegio le llega por PUBLIC (todo rol es miembro
-- implícito de PUBLIC), y PostgreSQL otorga EXECUTE a PUBLIC al crear una
-- función salvo que se revoque explícitamente en el mismo aliento. Esa
-- migración revocó de anon y de authenticated, pero nunca de public — el
-- hueco quedó abierto para las ocho funciones de abajo. Se revoca de los
-- tres (public, anon, authenticated) y se vuelve a otorgar solo lo que hace
-- falta.
-- ═══════════════════════════════════════════════════════════════════════

-- Funciones-trigger: no se invocan por RPC (Postgres ya lo impide para
-- funciones RETURNS trigger), pero no necesitan ningún grant explícito.
revoke all on function public.at_touch_updated_at() from public, anon, authenticated;
revoke all on function public.at_handle_new_user() from public, anon, authenticated;
revoke all on function public.at_guard_profile_role() from public, anon, authenticated;
revoke all on function public.at_activate_on_confirm() from public, anon, authenticated;

-- Helpers de sesión: los usan las políticas RLS `to authenticated`, que sí
-- necesitan poder invocarlos. Sin acceso anónimo.
revoke all on function public.at_my_role() from public, anon, authenticated;
revoke all on function public.at_my_client() from public, anon, authenticated;
revoke all on function public.at_is_ops() from public, anon, authenticated;
revoke all on function public.at_is_staff() from public, anon, authenticated;
revoke all on function public.at_valid_transition(public.at_guide_status, public.at_guide_status) from public, anon, authenticated;
grant execute on function public.at_my_role() to authenticated;
grant execute on function public.at_my_client() to authenticated;
grant execute on function public.at_is_ops() to authenticated;
grant execute on function public.at_is_staff() to authenticated;
grant execute on function public.at_valid_transition(public.at_guide_status, public.at_guide_status) to authenticated;

-- RPC de negocio que quedaban abiertas a anon pese a que cada una valida rol
-- por dentro (el guardián de at_report_deposit ya no dependía solo de esto,
-- pero el resto sí vivía únicamente de la validación interna: doble candado).
revoke all on function public.at_change_guide_status(uuid, public.at_guide_status, text) from public, anon, authenticated;
revoke all on function public.at_create_settlement(uuid, date) from public, anon, authenticated;
revoke all on function public.at_generate_invoice(uuid, date, date) from public, anon, authenticated;
revoke all on function public.at_process_return(uuid, text) from public, anon, authenticated;
revoke all on function public.at_reconcile_settlement(uuid, text) from public, anon, authenticated;
revoke all on function public.at_report_deposit(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.at_change_guide_status(uuid, public.at_guide_status, text) to authenticated;
grant execute on function public.at_create_settlement(uuid, date) to authenticated;
grant execute on function public.at_generate_invoice(uuid, date, date) to authenticated;
grant execute on function public.at_process_return(uuid, text) to authenticated;
grant execute on function public.at_reconcile_settlement(uuid, text) to authenticated;
grant execute on function public.at_report_deposit(uuid, numeric, text) to authenticated;

-- Las de lectura pública se quedan igual a propósito: at_track_guide,
-- at_track_guide_by_token, at_payment_info y at_landing_brands SÍ deben
-- responder sin sesión — es todo su propósito.

-- ═══════════════════════════════════════════════════════════════════════
-- 4) Bucket 'evidencias': quedó de una versión anterior del proyecto. El
-- código vigente sube evidencia de entrega a 'at-delivery-evidence', con RLS
-- por guía (ver src/lib/evidence.ts). Este otro bucket seguía marcado
-- público y con políticas `roles={public}` en SELECT/UPDATE/DELETE: cualquiera
-- sin sesión podía leer, sobrescribir o borrar lo que hubiera ahí. Está
-- vacío (0 archivos) y ninguna fila de at_guides le apunta, así que se
-- cierra en vez de borrarlo.
-- ═══════════════════════════════════════════════════════════════════════
drop policy if exists "Permitir lectura pública de evidencias" on storage.objects;
drop policy if exists "Permitir actualización de evidencias" on storage.objects;
drop policy if exists "Permitir eliminación de evidencias" on storage.objects;
drop policy if exists "Permitir subida a usuarios autenticados" on storage.objects;
drop policy if exists "Permitir subida desde backend" on storage.objects;

update storage.buckets set public = false where id = 'evidencias';

create policy "solo staff usa el bucket evidencias" on storage.objects
  for all to authenticated
  using (bucket_id = 'evidencias' and public.at_is_staff())
  with check (bucket_id = 'evidencias' and public.at_is_staff());
