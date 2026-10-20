-- Dos cosas que producción tenía y las migraciones no.
--
-- 1) El bucket `evidencias` (privado, 50 MB, imágenes y PDF). Estaba vacío y
--    sin políticas en producción: solo lo usa la llave de servicio. Los demás
--    buckets (at-delivery-evidence, etc.) ya los crean sus migraciones.
-- 2) at_facilities.lat/lng, las coordenadas de la sede (columnas del panel).
--    Idempotente: la instancia de AWS ya las tiene desde 01088.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 52428800,
        array['image/png','image/jpeg','image/jpg','image/webp','application/pdf'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

alter table public.at_facilities
  add column if not exists lat double precision,
  add column if not exists lng double precision;
