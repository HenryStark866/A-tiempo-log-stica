-- A TIEMPO LOGÍSTICA — el comercio conecta su tienda Shopify.
--
-- HOY: para despachar, el comercio exporta un CSV de Shopify, lo sube al
-- importador y le acomoda las columnas a mano. Es el paso donde más se
-- equivoca (de ahí salieron los productos llamados "MARTHA") y hay que
-- repetirlo cada día.
--
-- AHORA: conecta la tienda una vez y los pedidos entran solos como guías, con
-- destinatario, dirección, teléfono y valor a recaudar ya cargados.
--
-- EL TOKEN NO PUEDE LLEGAR AL NAVEGADOR. Un Admin API token de Shopify lee
-- pedidos, clientes y datos personales de toda la tienda. Por eso vive en una
-- tabla con RLS y SIN políticas: nadie la consulta directo, ni siquiera el
-- dueño del comercio. Solo lo lee la Edge Function shopify-sync, que corre en
-- el servidor con la clave de servicio. Ninguna función de aquí lo devuelve.

-- ── 1. La conexión ─────────────────────────────────────────────────────
create table if not exists public.at_shopify_connections (
  client_id        uuid primary key references public.at_clients(id) on delete cascade,
  shop_domain      text not null,
  access_token     text not null,
  active           boolean not null default true,
  connected_at     timestamptz not null default now(),
  connected_by     uuid references public.at_profiles(id),
  last_sync_at     timestamptz,
  last_sync_error  text,
  imported_total   int not null default 0
);

comment on table public.at_shopify_connections is
  'Credencial de la tienda Shopify del comercio. RLS activo y SIN políticas a propósito: el token da acceso a los pedidos y datos personales de toda la tienda, así que no se expone ni al propio dueño. Solo lo lee la Edge Function shopify-sync con la clave de servicio.';

alter table public.at_shopify_connections enable row level security;

-- ── 2. Guías con origen externo ────────────────────────────────────────
-- Sin esto, cada sincronización volvería a crear las mismas guías. El índice
-- único es lo que hace que importar dos veces sea inofensivo.
alter table public.at_guides
  add column if not exists external_source text,
  add column if not exists external_id     text;

create unique index if not exists at_guides_external_idx
  on public.at_guides (client_id, external_source, external_id)
  where external_id is not null;

comment on column public.at_guides.external_id is
  'Id del pedido en el sistema de origen (por ahora Shopify). Junto con external_source y client_id evita duplicar la guía al re-sincronizar.';

-- ── 3. Conectar ────────────────────────────────────────────────────────
create or replace function public.at_connect_shopify(
  p_shop_domain  text,
  p_access_token text
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_dom    text := lower(trim(p_shop_domain));
begin
  if public.at_my_role() <> 'cliente' or v_client is null then
    raise exception 'Solo un comercio conecta su propia tienda';
  end if;

  -- Se acepta pegar la URL completa; queda solo el dominio.
  v_dom := regexp_replace(v_dom, '^https?://', '');
  v_dom := regexp_replace(v_dom, '/.*$', '');

  -- Solo dominios de Shopify: evita que un enlace equivocado mande el token
  -- a un servidor cualquiera cuando la Edge Function haga la llamada.
  if v_dom !~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$' then
    raise exception 'El dominio debe verse así: tu-tienda.myshopify.com';
  end if;

  if length(trim(p_access_token)) < 20 then
    raise exception 'Ese token no parece válido: revísalo y vuelve a pegarlo';
  end if;

  insert into public.at_shopify_connections (
    client_id, shop_domain, access_token, connected_by, active, last_sync_error
  )
  values (v_client, v_dom, trim(p_access_token), auth.uid(), true, null)
  on conflict (client_id) do update set
    shop_domain     = excluded.shop_domain,
    access_token    = excluded.access_token,
    connected_by    = excluded.connected_by,
    connected_at    = now(),
    active          = true,
    last_sync_error = null;

  return json_build_object('shop_domain', v_dom, 'connected', true);
end $$;

revoke execute on function public.at_connect_shopify(text, text) from public, anon;
grant execute on function public.at_connect_shopify(text, text) to authenticated;

-- ── 4. Desconectar ─────────────────────────────────────────────────────
create or replace function public.at_disconnect_shopify()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_client uuid := public.at_my_client();
begin
  if public.at_my_role() <> 'cliente' or v_client is null then
    raise exception 'No autorizado';
  end if;
  -- Se borra la fila entera, no solo active=false: dejar el token guardado en
  -- una tienda que el comercio ya desconectó no tiene ninguna razón de ser.
  delete from public.at_shopify_connections where client_id = v_client;
end $$;

revoke execute on function public.at_disconnect_shopify() from public, anon;
grant execute on function public.at_disconnect_shopify() to authenticated;

-- ── 5. Estado, nunca el token ──────────────────────────────────────────
create or replace function public.at_shopify_status()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_row    public.at_shopify_connections;
  v_guias  int;
begin
  if v_client is null then return null; end if;

  select * into v_row from public.at_shopify_connections where client_id = v_client;
  if not found then return null; end if;

  select count(*) into v_guias from public.at_guides
  where client_id = v_client and external_source = 'shopify';

  -- Se devuelve todo menos access_token. A propósito y explícito: un
  -- select * aquí sería la fuga.
  return json_build_object(
    'shop_domain',     v_row.shop_domain,
    'active',          v_row.active,
    'connected_at',    v_row.connected_at,
    'last_sync_at',    v_row.last_sync_at,
    'last_sync_error', v_row.last_sync_error,
    'imported_total',  v_guias
  );
end $$;

revoke execute on function public.at_shopify_status() from public, anon;
grant execute on function public.at_shopify_status() to authenticated;

-- ── 6. Un pedido de Shopify se vuelve guía ─────────────────────────────
-- La llama la Edge Function con la clave de servicio, una vez por pedido.
-- Devuelve qué pasó para que la función pueda contar creadas vs repetidas.
create or replace function public.at_shopify_upsert_order(
  p_client_id uuid,
  p_order_id  text,
  p_name      text,
  p_phone     text,
  p_address   text,
  p_city      text,
  p_is_cod    boolean,
  p_amount    numeric,
  p_notes     text
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id   uuid;
  v_zona uuid;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_address),'') = '' then
    return 'incompleto';
  end if;

  select id into v_id from public.at_guides
  where client_id = p_client_id and external_source = 'shopify' and external_id = p_order_id;

  if found then
    return 'repetido';
  end if;

  -- Misma zonificación que usa el comercio al crear a mano y el CEDI al
  -- recibir: una sola forma de decidir la zona en toda la plataforma.
  v_zona := public.at_zone_for_city(coalesce(p_city,'') || ' ' || coalesce(p_address,''));

  insert into public.at_guides (
    client_id, recipient_name, recipient_phone, recipient_address, recipient_city,
    zone_id, is_cod, cod_amount, notes, external_source, external_id
  ) values (
    p_client_id, trim(p_name), nullif(trim(coalesce(p_phone,'')),''),
    trim(p_address), trim(coalesce(p_city,'')),
    v_zona, coalesce(p_is_cod,false),
    case when coalesce(p_is_cod,false) then greatest(coalesce(p_amount,0),0) else 0 end,
    nullif(trim(coalesce(p_notes,'')),''), 'shopify', p_order_id
  );

  return 'creado';
end $$;

revoke execute on function public.at_shopify_upsert_order(uuid, text, text, text, text, text, boolean, numeric, text)
  from public, anon, authenticated;

-- ── 7. Resultado de la sincronización ──────────────────────────────────
create or replace function public.at_shopify_mark_sync(
  p_client_id uuid,
  p_error     text default null,
  p_creadas   int  default 0
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.at_shopify_connections set
    last_sync_at    = now(),
    last_sync_error = nullif(trim(coalesce(p_error,'')), ''),
    imported_total  = imported_total + greatest(coalesce(p_creadas,0), 0)
  where client_id = p_client_id;
end $$;

revoke execute on function public.at_shopify_mark_sync(uuid, text, int)
  from public, anon, authenticated;
