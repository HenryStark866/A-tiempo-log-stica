-- ═══════════════════════════════════════════════════════════════════════════
-- EL COMPRADOR VE LO SUYO, Y NADA MAS
--
-- La 0144 creó el rol. Un rol sin políticas no ve nada —RLS niega por
-- omisión— así que hasta aquí un comprador con sesión abría la app y se
-- encontraba una lista vacía. Esto le da exactamente dos cosas: su perfil y
-- los pedidos que van a su nombre.
--
-- ── Cómo se sabe que un pedido es suyo ──────────────────────────────────
-- Por el teléfono. Es el único vínculo que existe hoy entre una guía y la
-- persona que espera el paquete: el comercio escribe `recipient_phone` al
-- crear el pedido, y ese mismo número es el que la persona verificó para
-- entrar (código por SMS). No hay `buyer_id` en `at_guides` y no se inventa
-- uno aquí: añadir una columna que el comercio tendría que llenar bien desde
-- el primer día sería construir sobre un dato que nadie está llenando todavía.
--
-- El precio de esta decisión hay que decirlo: si un comercio escribe mal el
-- teléfono, ese pedido no le aparece a nadie. Y si dos personas comparten
-- teléfono —el de la tienda de la esquina, por ejemplo—, ven los pedidos de
-- ambas. Es el mismo supuesto con el que ya funciona el código de entrega por
-- SMS, que se manda a ese número y a nadie más.
--
-- ── Por qué el teléfono se lee con una función y no en línea ────────────
-- La política necesita el teléfono del perfil de quien consulta, y leer
-- `at_profiles` dentro de una política de `at_guides` dispararía las políticas
-- de `at_profiles`: o recursión, o un plan de consulta carísimo repetido por
-- fila. `at_mi_telefono()` es `security definer` y `stable`: lee una vez, por
-- fuera de RLS, y Postgres la cachea dentro de la consulta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_mi_telefono()
returns text
language sql stable security definer set search_path = public
as $fn$
  select phone from public.at_profiles where id = auth.uid();
$fn$;

comment on function public.at_mi_telefono() is
  'El telefono verificado de quien consulta. La usan las politicas del rol comprador.';

revoke execute on function public.at_mi_telefono() from public, anon;
grant  execute on function public.at_mi_telefono() to authenticated;

-- ── Sus pedidos ──────────────────────────────────────────────────────────
-- `at_my_role()` devuelve NULL sin sesión, y `NULL = 'comprador'` no es cierto
-- ni falso: RLS lo trata como negación. Es justo lo que queremos, pero se deja
-- escrito porque en PL/pgSQL ese mismo NULL es una trampa conocida (ver la
-- nota de `at_guard_profile_role`) y alguien podría "arreglarlo" sin saberlo.
drop policy if exists "el comprador ve sus pedidos" on public.at_guides;
create policy "el comprador ve sus pedidos" on public.at_guides
  for select to authenticated
  using (
    public.at_my_role() = 'comprador'
    and recipient_phone is not null
    and recipient_phone = public.at_mi_telefono()
  );

-- Y el rastro de esos pedidos, que es lo que pinta la línea de tiempo.
drop policy if exists "el comprador ve el rastro de sus pedidos" on public.at_guide_events;
create policy "el comprador ve el rastro de sus pedidos" on public.at_guide_events
  for select to authenticated
  using (
    public.at_my_role() = 'comprador'
    and exists (
      select 1 from public.at_guides g
       where g.id = at_guide_events.guide_id
         and g.recipient_phone = public.at_mi_telefono()
    )
  );

-- ── Su perfil ────────────────────────────────────────────────────────────
-- Leer y corregir su nombre. El teléfono NO se toca desde aquí: es la
-- identidad de la cuenta, y cambiarlo sin volver a verificarlo dejaría a
-- cualquiera leyendo los pedidos de otro con solo escribir su número.
drop policy if exists "el comprador edita su nombre" on public.at_profiles;
create policy "el comprador edita su nombre" on public.at_profiles
  for update to authenticated
  using (id = auth.uid() and public.at_my_role() = 'comprador')
  with check (
    id = auth.uid()
    and public.at_my_role() = 'comprador'
    and phone is not distinct from public.at_mi_telefono()
    and role = 'comprador'
    and client_id is null
  );

notify pgrst, 'reload schema';
