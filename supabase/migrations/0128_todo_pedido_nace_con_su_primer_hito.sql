-- El primer hito de cada pedido, como lo hacía producción.
--
-- La función y el trigger no estaban en ninguna migración (se crearon desde el
-- panel). El respaldo del 2026-09-23 trae la función y el trigger
-- at_evento_al_crear_pedido_trg. El staging tenía una reconstrucción con otro
-- nombre de trigger (at_guides_evento_al_crear) y otro texto de hito: se retira.

drop trigger if exists at_guides_evento_al_crear on public.at_guides;
drop trigger if exists at_evento_al_crear_pedido_trg on public.at_guides;

create or replace function public.at_evento_al_crear_pedido() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (new.id, 'creada', 'Pedido registrado por el comercio', new.created_by);
  return new;
end $$;

comment on function public.at_evento_al_crear_pedido() is
  'Deja el primer hito en la historia del pedido. Sin él, la línea de tiempo de un pedido recién creado sale vacía y parece que la pantalla falló.';

create trigger at_evento_al_crear_pedido_trg
  after insert on public.at_guides
  for each row execute function public.at_evento_al_crear_pedido();

-- Función de trigger: de nadie (como dejó la 0100 al resto de triggers).
revoke execute on function public.at_evento_al_crear_pedido() from public, anon, authenticated;
grant  execute on function public.at_evento_al_crear_pedido() to service_role;
