-- ═══════════════════════════════════════════════════════════════════════════
-- La recogida la cierra quien recibió los paquetes
--
-- Hasta ahora la pantalla del CEDI tenía un botón «Completar» que ponía la
-- recogida en `completada` con un UPDATE directo a la tabla, con un número de
-- paquetes escrito a mano y sin tocar una sola guía. Eso dejaba la operación
-- mintiendo: la recogida figuraba cerrada mientras las guías seguían en
-- `creada`, sin `picked_up_at` y sin evento de quién recibió qué.
--
-- El cierre correcto ya existe y es `at_confirm_pickup`: lo ejecuta el
-- mensajero en el local, con las cajas delante, marcando guía por guía. Eso es
-- lo que pasa cada guía a `recogida`, le pone la hora y deja el rastro.
--
-- Quitar el botón de la pantalla no basta: la política dejaba a cualquier staff
-- escribir cualquier estado con una llamada directa a la tabla. Aquí se cierra
-- esa puerta, que es donde de verdad se cierra.
--
-- Lo que el CEDI sigue pudiendo hacer: crear, asignar, reasignar, corregir la
-- dirección o la fecha, y cancelar. Todo eso pasa por estados que no son
-- `en_curso` ni `completada`.
--
-- Los dos estados que quedan vedados son justamente los que nacen de un acto
-- físico del mensajero:
--   · `en_curso`   — arrancó hacia el comercio (at_start_pickup)
--   · `completada` — recibió y verificó los paquetes (at_confirm_pickup)
--
-- Las dos funciones son `security definer` y las tablas no tienen
-- `force row level security`, así que siguen pudiendo escribir esos estados sin
-- que esta política las estorbe. Verificado antes de escribir la migración.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "staff gestiona recogidas" on public.at_pickups;

create policy "staff gestiona recogidas sin darlas por recibidas"
  on public.at_pickups
  for update to authenticated
  using (public.at_is_staff())
  -- `with check` mira la fila resultante: el staff puede mover la recogida a
  -- cualquier estado menos a los dos que solo produce el mensajero en la calle.
  with check (
    public.at_is_staff()
    and status not in ('en_curso', 'completada')
  );

comment on policy "staff gestiona recogidas sin darlas por recibidas" on public.at_pickups is
  'El CEDI asigna, corrige y cancela. Marcar en_curso o completada es del mensajero, y solo por at_start_pickup / at_confirm_pickup, que verifican guía por guía.';
