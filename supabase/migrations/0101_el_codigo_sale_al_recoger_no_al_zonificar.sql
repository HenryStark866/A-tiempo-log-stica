-- ═══════════════════════════════════════════════════════════════════════════
-- EL CÓDIGO DE ENTREGA SALE AL RECOGER, NO AL ZONIFICAR
--
-- Hasta ahora el código del destinatario se emitía en `at_assign_courier`, o
-- sea cuando el CEDI ya había recibido el paquete y le asignaba mensajero y
-- zona. Entre que el comercio entrega el paquete y eso ocurre pueden pasar
-- horas, y en todas esas horas el destinatario no sabe nada.
--
-- Ahora sale en el momento en que el mensajero marca el paquete como recogido,
-- que es el primer instante en que existe una certeza que contarle: su pedido
-- salió del comercio y va en camino.
--
-- ── Por qué aquí dentro y no desde la app del mensajero ────────────────────
-- Porque el mensajero trabaja sin señal la mitad del turno. Si el aviso lo
-- disparara su teléfono, se perdería justo en los casos en que se recoge en un
-- sótano o en una bodega. Al hacerlo la base, el mensaje queda encolado en
-- `at_message_outbox` en la misma transacción que marca la recogida: o pasan
-- las dos cosas o no pasa ninguna, y el despachador lo envía cuando pueda.
--
-- `at_issue_delivery_code` ya es idempotente —se sale sola si la guía ya tiene
-- código—, así que:
--
--   · no duplica nada si la recogida se confirma dos veces;
--   · la llamada que sigue habiendo en `at_assign_courier` NO se quita: es la
--     red que cubre a las guías que nunca pasaron por una recogida, como las
--     que el comercio deja directamente en el CEDI.
--
-- El resto del cuerpo es idéntico al que había. Se repite entero porque
-- create or replace reemplaza la función completa: lo que no se reescriba, se
-- pierde.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_confirm_pickup(
  p_pickup_id uuid,
  p_guide_ids uuid[],
  p_note text default null::text
)
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
  v_guia      record;
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

  -- ── Lo nuevo: avisar al destinatario ────────────────────────────────────
  -- Una por una y no en lote porque `at_issue_delivery_code` genera un código
  -- distinto para cada guía: es el que el destinatario le dirá al mensajero
  -- para probar que el paquete llegó a quien debía.
  for v_guia in
    select g.id from public.at_guides g
    where g.pickup_id = p_pickup_id
      and g.id = any(p_guide_ids)
      and g.status = 'recogida'
  loop
    perform public.at_issue_delivery_code(v_guia.id);
  end loop;

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

revoke execute on function public.at_confirm_pickup(uuid, uuid[], text) from public, anon;
grant execute on function public.at_confirm_pickup(uuid, uuid[], text) to authenticated;
