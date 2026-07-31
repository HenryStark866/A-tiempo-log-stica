-- ═══════════════════════════════════════════════════════════════════════════
-- 0032 — Logos de marca y vitrina de la portada
--
-- La portada muestra las marcas que confían en nosotros dentro de la animación
-- de fondo. Eso significa publicar la marca de un tercero en internet, así que
-- no basta con tener el archivo: hace falta que el comercio lo autorice. De ahí
-- las dos columnas y no una.
--
--   logo_url         → dónde está la imagen (bucket público)
--   show_in_landing  → si el comercio aceptó salir en la portada. Arranca en
--                      false a propósito: subir el logo es para sus rótulos y
--                      su seguimiento; salir en la portada es otra decisión.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_clients
  add column if not exists logo_url text,
  add column if not exists show_in_landing boolean not null default false;

comment on column public.at_clients.show_in_landing is
  'El comercio autorizó que su marca aparezca en la portada pública.';

-- ── Storage ────────────────────────────────────────────────────────────────
-- Público porque la portada lo lee sin sesión: una URL firmada caducaría y
-- dejaría la animación con huecos. Aquí solo van logos, que son material que la
-- marca ya publica.
insert into storage.buckets (id, name, public)
values ('at-brand-logos', 'at-brand-logos', true)
on conflict (id) do nothing;

-- Cada comercio escribe solo dentro de la carpeta de su propio id. Operaciones
-- puede hacerlo por cualquiera, porque muchas veces el logo lo manda el
-- comercio por WhatsApp y lo carga el CEDI.
drop policy if exists "at comercio sube su logo" on storage.objects;
create policy "at comercio sube su logo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'at-brand-logos'
  and (
    (storage.foldername(name))[1] = public.at_my_client()::text
    or public.at_is_ops()
  )
);

drop policy if exists "at comercio reemplaza su logo" on storage.objects;
create policy "at comercio reemplaza su logo"
on storage.objects for update to authenticated
using (
  bucket_id = 'at-brand-logos'
  and (
    (storage.foldername(name))[1] = public.at_my_client()::text
    or public.at_is_ops()
  )
);

drop policy if exists "at comercio borra su logo" on storage.objects;
create policy "at comercio borra su logo"
on storage.objects for delete to authenticated
using (
  bucket_id = 'at-brand-logos'
  and (
    (storage.foldername(name))[1] = public.at_my_client()::text
    or public.at_is_ops()
  )
);

-- ── Guardar el logo ────────────────────────────────────────────────────────
-- Pasar null borra la referencia: es como el comercio quita su logo.
create or replace function public.at_set_client_logo(
  p_client_id uuid,
  p_logo_url  text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.at_is_ops() or p_client_id = public.at_my_client()) then
    raise exception 'No puedes cambiar el logo de otro comercio';
  end if;

  update public.at_clients
  set logo_url = p_logo_url
  where id = p_client_id;

  if not found then
    raise exception 'Ese comercio no existe';
  end if;
end $$;

-- ── Autorizar la portada ───────────────────────────────────────────────────
-- Sin logo no hay nada que mostrar, así que se bloquea aquí en vez de dejar que
-- la vitrina lo filtre en silencio: el comercio merece saber por qué no sale.
create or replace function public.at_set_client_landing(
  p_client_id uuid,
  p_show      boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_logo text;
begin
  if not (public.at_is_ops() or p_client_id = public.at_my_client()) then
    raise exception 'No puedes cambiar la vitrina de otro comercio';
  end if;

  select logo_url into v_logo from public.at_clients where id = p_client_id;
  if not found then
    raise exception 'Ese comercio no existe';
  end if;

  if p_show and v_logo is null then
    raise exception 'Primero sube el logo del comercio';
  end if;

  update public.at_clients
  set show_in_landing = p_show
  where id = p_client_id;
end $$;

-- ── La vitrina ─────────────────────────────────────────────────────────────
-- La lee la portada sin sesión, así que devuelve lo mínimo: nombre y logo. Ni
-- NIT, ni contacto, ni tarifas. El tope evita que la animación se ahogue el día
-- que haya cien comercios.
create or replace function public.at_landing_brands()
returns table (business_name text, logo_url text)
language sql stable security definer set search_path = public
as $$
  select c.business_name, c.logo_url
  from public.at_clients c
  where c.active
    and c.show_in_landing
    and c.logo_url is not null
  order by c.business_name
  limit 24
$$;

revoke all on function public.at_landing_brands() from public;
grant execute on function public.at_landing_brands() to anon, authenticated;

revoke all on function public.at_set_client_logo(uuid, text) from public;
grant execute on function public.at_set_client_logo(uuid, text) to authenticated;

revoke all on function public.at_set_client_landing(uuid, boolean) from public;
grant execute on function public.at_set_client_landing(uuid, boolean) to authenticated;
