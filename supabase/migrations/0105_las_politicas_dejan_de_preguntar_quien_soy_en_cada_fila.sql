-- A TIEMPO LOGÍSTICA — que RLS pregunte «quién eres» una vez, no una por fila.
--
-- ── El problema, en una frase ─────────────────────────────────────────────
-- Una política escrita `user_id = auth.uid()` hace que Postgres llame a
-- auth.uid() UNA VEZ POR CADA FILA que mira. Escrita `user_id = (select
-- auth.uid())`, el planificador la resuelve una sola vez y compara contra un
-- valor ya calculado (InitPlan).
--
-- ── Por qué se hace ahora, con la base vacía ──────────────────────────────
-- Hoy no se nota: at_recipients tiene 2.802 filas y las demás menos de 200.
-- Se hace justamente por eso. Cuando at_guides pase de 3 a 30.000 —que es el
-- negocio funcionando— esto deja de ser una línea de más y se vuelve un
-- listado que tarda segundos, y para entonces el arreglo hay que hacerlo con
-- la operación encima. Cuesta lo mismo hoy y no cuesta nada.
--
-- ── Que quede claro que NO cambia quién ve qué ────────────────────────────
-- `auth.uid()` es STABLE: dentro de una misma consulta devuelve siempre lo
-- mismo. Envolverla en un subselect no puede cambiar el resultado de la
-- condición, solo cuántas veces se calcula. Lo mismo vale para at_is_ops(),
-- at_is_staff() y at_my_role(), que son STABLE y no miran la fila.
--
-- La única que NO se envuelve está en at_settlements: el subselect que busca
-- el facility_id del mensajero SÍ depende de la fila (`p.id =
-- at_settlements.courier_id`). Envolver eso lo congelaría en el primer valor
-- y le enseñaría a un coordinador los cierres de mensajeros de otra sede.
-- Se deja tal cual a propósito.
--
-- Se usa `alter policy` y no `drop`+`create`: el nombre, el rol y el comando
-- quedan intactos, y no hay ni un instante en que la tabla esté sin política.

-- ── at_courier_documents ──────────────────────────────────────────────────
alter policy "mensajero ve sus documentos" on public.at_courier_documents
  using (
    courier_id = (select auth.uid())
    or (select public.at_is_ops())
  );

-- ── at_facility_documents ─────────────────────────────────────────────────
alter policy "solicitante ve sus documentos" on public.at_facility_documents
  using (
    applicant_id = (select auth.uid())
    or (select public.at_my_role()) = 'admin'::public.at_role
  );

-- ── at_notifications ──────────────────────────────────────────────────────
alter policy "usuario lee sus notificaciones" on public.at_notifications
  using (user_id = (select auth.uid()));

alter policy "usuario marca sus notificaciones" on public.at_notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── at_profiles ───────────────────────────────────────────────────────────
-- La tabla más leída de la app: cada pantalla empieza preguntando quién eres.
alter policy "perfil propio o staff lee" on public.at_profiles
  using (
    id = (select auth.uid())
    or (select public.at_is_staff())
  );

alter policy "usuario edita su perfil (trigger evita escalar rol)" on public.at_profiles
  using (
    id = (select auth.uid())
    or (select public.at_my_role()) = 'admin'::public.at_role
  )
  with check (
    id = (select auth.uid())
    or (select public.at_my_role()) = 'admin'::public.at_role
  );

-- ── at_settlements ────────────────────────────────────────────────────────
-- Ojo con esta: at_puede_ver_facility recibe un subselect CORRELACIONADO con
-- la fila. Se envuelve at_is_ops() y auth.uid(), que no dependen de la fila;
-- el subselect de dentro se deja exactamente como estaba.
alter policy "ops o mensajero dueño lee cierres" on public.at_settlements
  using (
    (
      (select public.at_is_ops())
      and public.at_puede_ver_facility((
        select p.facility_id from public.at_profiles p
        where p.id = at_settlements.courier_id
      ))
    )
    or courier_id = (select auth.uid())
  );

-- ── at_survey_responses ───────────────────────────────────────────────────
alter policy "cada quien ve lo suyo, ops ve todo" on public.at_survey_responses
  using (
    user_id = (select auth.uid())
    or (select public.at_is_ops())
  );
