-- A TIEMPO LOGÍSTICA — el almacenamiento deja de aceptar cualquier cosa.
--
-- Las políticas de los buckets estaban bien: cada quien solo toca su carpeta y
-- ops tiene salida. Lo que faltaba era lo otro — ninguno limitaba el TAMAÑO ni
-- el TIPO de archivo. Dos consecuencias reales:
--
--  1. at-brand-logos es PÚBLICO y aceptaba cualquier formato. Un comercio podía
--     subir un .svg o un .html como "logo" y quedarse con una URL pública en
--     nuestro dominio de Supabase sirviendo el archivo. Un SVG puede llevar
--     <script> dentro, así que eso es ejecutar código ajeno en el mismo origen
--     donde vive TODO el almacenamiento: los comprobantes de pago, las cédulas
--     de los mensajeros y las fotos de entrega. Por eso aquí NO se admite SVG,
--     aunque sea un formato de imagen perfectamente normal en otro contexto.
--
--  2. Sin tope de tamaño, cualquier mensajero o comercio con cuenta podía subir
--     archivos de gigas. No hace falta mala fe para que duela —una factura de
--     almacenamiento se infla sola— y con mala fe es la forma más barata de
--     tumbar la operación.
--
-- Los topes salen de lo que hay subido hoy: 33 archivos, todos imágenes
-- legítimas, y el mayor es una foto de evidencia de 4,6 MB. 10 MB deja aire de
-- sobra para una foto de celular moderna sin dejar pasar un vídeo.

update storage.buckets set
  file_size_limit = 2 * 1024 * 1024,
  allowed_mime_types = array['image/png','image/jpeg','image/webp']
where id = 'at-brand-logos';

-- Documentos: cédula, licencia, papeles del vehículo, escritura del local.
-- Aquí sí entra el PDF, que es como llega la mitad de esos papeles.
update storage.buckets set
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf']
where id in ('at-courier-docs', 'at-facility-docs', 'at-payment-receipts');

-- Evidencia de entrega: siempre es una foto tomada en la puerta.
update storage.buckets set
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array['image/png','image/jpeg','image/webp']
where id = 'at-delivery-evidence';
