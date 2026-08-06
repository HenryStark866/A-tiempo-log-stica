-- Hasta ahora la campana solo sonaba por evento: te asignan una recogida, te
-- habilitan como mensajero. Nadie se enteraba de que algo quedó esperando
-- si no fue una acción de otra persona la que lo dejó ahí — un lote que entró
-- al CEDI hace tres horas y nadie zonificó, una recogida sin mensajero
-- asignado. Esto agrega un resumen periódico: cada rol recibe solo lo que le
-- toca resolver a él.

-- ── Estado de deduplicación ──────────────────────────────────────────────
-- Sin esto, cada corrida del cron insertaría una notificación nueva aunque el
-- pendiente sea el mismo de hace cuatro horas: la campana se llenaría de
-- copias idénticas. Se avisa de nuevo solo si el conteo cambió.
create table if not exists public.at_pending_action_state (
  user_id     uuid not null references public.at_profiles(id) on delete cascade,
  category    text not null,
  last_count  int not null,
  notified_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.at_pending_action_state enable row level security;
-- Sin políticas: es contabilidad interna del cron, no hay pantalla que la
-- lea. Las funciones que la tocan son security definer, propiedad de postgres,
-- y por eso no las alcanza esta RLS vacía.

create or replace function public.at_notify_if_changed(
  p_user_id  uuid,
  p_category text,
  p_count    int,
  p_title    text,
  p_body     text,
  p_link     text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_anterior int;
begin
  select last_count into v_anterior
  from public.at_pending_action_state
  where user_id = p_user_id and category = p_category;

  if p_count <= 0 then
    -- Ya no hay nada pendiente: se borra el estado para que, si vuelve a
    -- aparecer, cuente como novedad y avise de nuevo (no se manda aviso de
    -- "ya no tienes pendientes": eso sería tanto ruido como el problema que
    -- se está resolviendo).
    delete from public.at_pending_action_state
    where user_id = p_user_id and category = p_category;
    return;
  end if;

  if v_anterior is not distinct from p_count then
    return; -- mismo conteo que la última vez: nada que decir
  end if;

  insert into public.at_notifications (user_id, title, body, link)
  values (p_user_id, p_title, p_body, p_link);

  insert into public.at_pending_action_state (user_id, category, last_count, notified_at)
  values (p_user_id, p_category, p_count, now())
  on conflict (user_id, category)
    do update set last_count = excluded.last_count, notified_at = excluded.notified_at;
end $$;

revoke execute on function public.at_notify_if_changed(uuid, text, int, text, text, text) from public, anon, authenticated;

-- ── El resumen en sí ─────────────────────────────────────────────────────
create or replace function public.at_notify_pending_actions()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_zonificar        int;
  v_recogidas        int;
  v_cierres          int;
  v_accesos          int;
  r record;
begin
  -- El CEDI entero: guías que ya entraron pero nadie les puso zona.
  select count(*) into v_zonificar
  from public.at_guides where status = 'en_cedi' and zone_id is null;

  if v_zonificar > 0 then
    for r in
      select id from public.at_profiles
      where role in ('operario','coordinador','admin') and active
    loop
      perform public.at_notify_if_changed(
        r.id, 'zonificar', v_zonificar,
        'Guías por zonificar',
        format('%s guía(s) en el CEDI están esperando zona', v_zonificar),
        '/rutas'
      );
    end loop;
  end if;

  -- Coordinación: recogidas que el comercio pidió y nadie le asignó mensajero.
  select count(*) into v_recogidas
  from public.at_pickups where status = 'pendiente' and operator_id is null;

  if v_recogidas > 0 then
    for r in
      select id from public.at_profiles
      where role in ('coordinador','admin') and active
    loop
      perform public.at_notify_if_changed(
        r.id, 'recogidas_por_asignar', v_recogidas,
        'Recogidas sin asignar',
        format('%s solicitud(es) de recogida están sin mensajero', v_recogidas),
        '/recogidas'
      );
    end loop;
  end if;

  -- Coordinación: consignaciones que el mensajero ya reportó y falta conciliar.
  select count(*) into v_cierres
  from public.at_settlements where status = 'consignado';

  if v_cierres > 0 then
    for r in
      select id from public.at_profiles
      where role in ('coordinador','admin') and active
    loop
      perform public.at_notify_if_changed(
        r.id, 'cierres_por_conciliar', v_cierres,
        'Cierres de caja por conciliar',
        format('%s consignación(es) reportada(s) esperan conciliación', v_cierres),
        '/recaudo?filtro=cierres'
      );
    end loop;
  end if;

  -- Admin: cuentas nuevas esperando que alguien les asigne rol.
  select count(*) into v_accesos
  from public.at_profiles where role = 'pendiente' and requested_role is not null;

  if v_accesos > 0 then
    for r in select id from public.at_profiles where role = 'admin' and active
    loop
      perform public.at_notify_if_changed(
        r.id, 'accesos_pendientes', v_accesos,
        'Solicitudes de acceso pendientes',
        format('%s cuenta(s) nueva(s) esperan que les asignes un rol', v_accesos),
        '/usuarios'
      );
    end loop;
  end if;

  -- Cada mensajero: sus propias guías ya zonificadas, listas para salir.
  for r in
    select courier_id as id, count(*) as n
    from public.at_guides
    where status = 'zonificada' and courier_id is not null
    group by courier_id
  loop
    perform public.at_notify_if_changed(
      r.id, 'guias_para_salir', r.n,
      'Guías listas para salir',
      format('Tienes %s guía(s) zonificada(s) esperando que salgas a ruta', r.n),
      '/entregas'
    );
  end loop;

  -- Cada comercio: sus propias guías con novedad, sin resolver.
  for r in
    select p.id as id, count(g.id) as n
    from public.at_profiles p
    join public.at_guides g on g.client_id = p.client_id
    where p.role = 'cliente' and p.active and g.status = 'novedad'
    group by p.id
  loop
    perform public.at_notify_if_changed(
      r.id, 'novedades_cliente', r.n,
      'Guías con novedad',
      format('%s guía(s) tuya(s) tienen una novedad por resolver', r.n),
      '/guias?estado=novedad'
    );
  end loop;
end $$;

revoke execute on function public.at_notify_pending_actions() from public, anon, authenticated;

-- Cada 4 horas: ni tan seguido que se vuelva ruido, ni tan espaciado que una
-- guía se quede toda la mañana sin zonificar sin que nadie se entere.
select cron.schedule(
  'at-notificar-pendientes',
  '0 */4 * * *',
  $$select public.at_notify_pending_actions()$$
);
