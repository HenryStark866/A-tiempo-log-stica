-- 0143: vitrina pública de productos (storefront) con lectura anónima MÍNIMA.
-- Solo el rol anon, solo filas activas y solo columnas aptas para el público.
-- NO se expone NIT, correo, contacto, dirección ni tarifas (billing_cycle, delivery_rate, return_rate).
-- Los usuarios autenticados siguen con sus políticas actuales (staff / comercio).

-- 1. Productos activos
drop policy if exists "publico lee productos activos" on public.at_products;
create policy "publico lee productos activos" on public.at_products
  for select to anon
  using (active = true);

revoke select on public.at_products from anon;
grant select (id, client_id, sku, name, description, price, extra, active) on public.at_products to anon;

-- 2. Comercios activos: solo nombre comercial, ciudad, teléfono público y logo
drop policy if exists "publico lee comercios activos" on public.at_clients;
create policy "publico lee comercios activos" on public.at_clients
  for select to anon
  using (active = true);

revoke select on public.at_clients from anon;
grant select (id, business_name, city, phone, logo_url, active) on public.at_clients to anon;

notify pgrst, 'reload schema';
