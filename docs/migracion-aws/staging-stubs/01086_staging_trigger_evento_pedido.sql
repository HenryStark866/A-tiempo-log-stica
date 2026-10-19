-- RECONSTRUCCIÓN: el trigger que llama a at_evento_al_crear_pedido().
-- En producción existe un trigger más que en las migraciones locales (23 contra
-- 22); este es el candidato: lo dice el comentario de pedidos/[id]/page.tsx
-- («el trigger at_evento_al_crear_pedido lo escribe»).
--
-- SUPOSICIÓN: el nombre del trigger (el real se desconoce) y AFTER INSERT FOR EACH
-- ROW. Lo segundo no es del todo libre: at_guide_events.guide_id es clave foránea
-- a at_guides, así que el hito solo puede escribirse con la guía ya insertada.
drop trigger if exists at_guides_evento_al_crear on public.at_guides;
create trigger at_guides_evento_al_crear
  after insert on public.at_guides
  for each row
  execute function public.at_evento_al_crear_pedido();
