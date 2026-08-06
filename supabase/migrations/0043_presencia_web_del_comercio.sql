-- El comercio ya podía conectar su tienda de Shopify. Lo que no tenía era un
-- lugar para dejar su sitio web o sus redes: hoy ese dato vive suelto en un
-- chat de WhatsApp con el CEDI, si es que alguien lo pidió. Esto le da un
-- sitio fijo, igual de simple que el logo: cuatro campos, todos opcionales,
-- que el comercio edita él mismo.

alter table public.at_clients
  add column if not exists website_url   text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url  text,
  add column if not exists tiktok_url    text;

-- ── El cliente edita su propia presencia en línea ────────────────────────
-- Separado de at_update_my_business a propósito: son datos de marketing, no
-- de facturación, y agregarlos aquí habría obligado a tocar ese formulario
-- (y sus llamadas ya existentes) por algo que no tiene nada que ver.
create or replace function public.at_update_my_links(
  p_website_url   text default null,
  p_instagram_url text default null,
  p_facebook_url  text default null,
  p_tiktok_url    text default null
)
returns public.at_clients
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_out public.at_clients;

  -- Vacío es "bórralo", no "no lo toques": a diferencia de
  -- at_update_my_business, aquí cada campo se guarda tal cual llega. Un
  -- comercio que cerró su Instagram tiene que poder dejar el campo en blanco,
  -- y coalesce-con-nullif se lo habría impedido.
  v_website text := nullif(trim(p_website_url), '');
  v_instagram text := nullif(trim(p_instagram_url), '');
  v_facebook text := nullif(trim(p_facebook_url), '');
  v_tiktok text := nullif(trim(p_tiktok_url), '');
begin
  if v_role is null or v_role <> 'cliente' then raise exception 'No autorizado'; end if;
  if v_client is null then raise exception 'Tu cuenta todavía no tiene comercio'; end if;

  if v_website is not null and v_website !~* '^https?://' then
    raise exception 'El link de tu página web debe empezar por http:// o https://';
  end if;
  if v_instagram is not null and v_instagram !~* '^https?://' then
    raise exception 'El link de Instagram debe empezar por http:// o https://';
  end if;
  if v_facebook is not null and v_facebook !~* '^https?://' then
    raise exception 'El link de Facebook debe empezar por http:// o https://';
  end if;
  if v_tiktok is not null and v_tiktok !~* '^https?://' then
    raise exception 'El link de TikTok debe empezar por http:// o https://';
  end if;

  update public.at_clients set
    website_url   = v_website,
    instagram_url = v_instagram,
    facebook_url  = v_facebook,
    tiktok_url    = v_tiktok
  where id = v_client
  returning * into v_out;

  return v_out;
end $$;

revoke execute on function public.at_update_my_links(text, text, text, text) from public, anon;
grant execute on function public.at_update_my_links(text, text, text, text) to authenticated;
