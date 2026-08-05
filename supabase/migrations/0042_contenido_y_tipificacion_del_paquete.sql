-- ═══════════════════════════════════════════════════════════════════════════
-- A TIEMPO LOGÍSTICA — qué va dentro del paquete y de qué paquete se trata
--
-- Hasta ahora una guía sabía a dónde va y cuánto cobrar, pero no qué lleva.
-- Los productos que el comercio elegía en el formulario terminaban pegados
-- como texto dentro de `notes`, mezclados con las instrucciones para el
-- mensajero («timbre dañado, llamar»). Eso tenía tres consecuencias:
--
--   · No se podía mandar más de un producto: elegir el segundo REEMPLAZABA el
--     valor a recaudar por el precio de ese, en vez de sumarlo.
--   · Nadie podía quitar un producto agregado por error sin editar el texto.
--   · El CEDI no tenía forma de saber qué contiene una caja sin leer una nota
--     en prosa, y en una devolución o un reclamo eso es justamente el dato.
--
-- `items` guarda el contenido congelado en el momento de crear la guía —no una
-- referencia a at_products— a propósito: una guía es un documento de
-- transporte. Si mañana el comercio le sube el precio al vestido o lo borra
-- del catálogo, lo que viajó en esa caja no cambia.
--
-- La tipificación (tipo, tamaño, peso, frágil) es lo que el CEDI necesita para
-- zonificar y para saber quién puede cargarlo: no es lo mismo un sobre que una
-- caja de 15 kg, ni da igual si adentro va vidrio.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_guides
  add column if not exists package_type       text,
  add column if not exists package_size       text,
  add column if not exists package_weight_kg  numeric(6,2),
  add column if not exists is_fragile         boolean not null default false,
  add column if not exists content_description text,
  add column if not exists items              jsonb not null default '[]'::jsonb;

comment on column public.at_guides.items is
  'Contenido del paquete congelado al crear la guía: [{product_id, name, sku, qty, unit_price}]. No es una referencia viva a at_products.';
comment on column public.at_guides.content_description is
  'Qué va adentro, en palabras. Distinto de notes, que son instrucciones para quien entrega.';

-- Los valores se validan aquí y no solo en la pantalla: la tabla la escriben
-- también la sincronización de Shopify y cualquier script futuro.
alter table public.at_guides
  drop constraint if exists at_guides_package_type_check;
alter table public.at_guides
  add constraint at_guides_package_type_check
  check (package_type is null or package_type in ('sobre','caja','bolsa','tubo','otro'));

alter table public.at_guides
  drop constraint if exists at_guides_package_size_check;
alter table public.at_guides
  add constraint at_guides_package_size_check
  check (package_size is null or package_size in ('pequeno','mediano','grande'));

alter table public.at_guides
  drop constraint if exists at_guides_weight_check;
alter table public.at_guides
  add constraint at_guides_weight_check
  check (package_weight_kg is null or package_weight_kg > 0);

-- `items` es una lista o no es nada. Sin esto, un objeto suelto o una cadena
-- pasarían y reventarían al pintarlos.
alter table public.at_guides
  drop constraint if exists at_guides_items_check;
alter table public.at_guides
  add constraint at_guides_items_check
  check (jsonb_typeof(items) = 'array');
