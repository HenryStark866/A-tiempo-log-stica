-- ═══════════════════════════════════════════════════════════════════════════
-- A TIEMPO LOGÍSTICA — la vitrina pública: productos y tiendas, sin datos de más
--
-- La portada muestra a cualquiera, sin cuenta, los productos activos y las
-- tiendas que los venden. Para eso NO se abren las tablas a anon: una política
-- «público lee comercios activos» sobre at_clients le daría a cualquiera el NIT,
-- el contacto, el teléfono, la dirección, la tarifa y la comisión de cada
-- comercio, porque RLS filtra filas, no columnas, y anon tiene SELECT sobre la
-- tabla entera por los grants por defecto.
--
-- Se sigue el mismo patrón que at_landing_brands (0032): una función SECURITY
-- DEFINER que devuelve solo lo que la vitrina pinta.
--
--   · Solo comercios activos que aceptaron salir en la portada
--     (show_in_landing). Ese consentimiento ya existía para los logos; subir
--     productos no es lo mismo que aceptar exhibirlos.
--   · Solo productos activos.
--   · Columnas: nombre, SKU, descripción, precio, imagen y categoría del
--     producto; nombre, ciudad y logo de la tienda. Nada de teléfonos,
--     direcciones, NIT, tarifas ni comisiones.
--
-- Es la octava puerta pública (docs/estandares-de-plataforma.md). Como
-- at_landing_brands, es `stable` y sin freno at_limitar: devuelve un catálogo
-- acotado (500 filas) y ponerle freno metería una escritura en cada carga de
-- la portada.
--
-- Esta migración reemplaza a la versión anterior de la 0143, que nunca se
-- aplicó en producción y abría las tablas.
-- ═══════════════════════════════════════════════════════════════════════════

-- Por si la versión anterior llegó a aplicarse en algún entorno de pruebas.
drop policy if exists "publico lee productos activos" on public.at_products;
drop policy if exists "publico lee comercios activos" on public.at_clients;

create or replace function public.at_vitrina_catalogo()
returns table (
  id          uuid,
  nombre      text,
  sku         text,
  descripcion text,
  precio      numeric,
  imagen_url  text,
  categoria   text,
  tienda      text,
  ciudad      text,
  logo_url    text
)
language sql stable security definer set search_path = public
as $$
  select p.id,
         p.name,
         p.sku,
         p.description,
         p.price,
         coalesce(p.extra->>'image_url', p.extra->>'foto'),
         coalesce(nullif(trim(p.extra->>'category'), ''), 'General'),
         c.business_name,
         c.city,
         c.logo_url
  from public.at_products p
  join public.at_clients c on c.id = p.client_id
  where p.active
    and c.active
    and c.show_in_landing
  order by c.business_name, p.name
  limit 500
$$;

comment on function public.at_vitrina_catalogo() is
  'Catálogo público de la portada: productos activos de comercios activos que aceptaron salir en la portada (show_in_landing). Solo columnas de vitrina; nunca contacto, NIT, tarifas ni comisiones.';

revoke all on function public.at_vitrina_catalogo() from public;
grant execute on function public.at_vitrina_catalogo() to anon, authenticated;

notify pgrst, 'reload schema';
