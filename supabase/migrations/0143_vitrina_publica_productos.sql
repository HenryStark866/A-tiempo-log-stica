-- ═══════════════════════════════════════════════════════════════════════════
-- 0143: VITRINA PÚBLICA DE PRODUCTOS (STOREFRONT) Y LECTURA ANÓNIMA
--
-- Habilita la consulta pública de productos activos del catálogo para visitantes
-- y compradores no autenticados en la vitrina web (Storefront).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Políticas RLS para at_products
drop policy if exists "publico lee productos activos" on public.at_products;
create policy "publico lee productos activos" on public.at_products
  for select to anon, authenticated
  using (active = true);

grant select on public.at_products to anon, authenticated;

-- 2. Lectura pública de nombres y metadatos básicos de comercios activos
-- Permite que la vitrina resuelva el nombre comercial (`business_name`),
-- ciudad y datos de contacto de la tienda que publica el producto.
drop policy if exists "publico lee comercios activos" on public.at_clients;
create policy "publico lee comercios activos" on public.at_clients
  for select to anon, authenticated
  using (active = true);

grant select on public.at_clients to anon, authenticated;

notify pgrst, 'reload schema';
