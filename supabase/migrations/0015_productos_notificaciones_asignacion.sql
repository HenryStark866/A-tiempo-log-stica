-- A TIEMPO LOGÍSTICA — catálogo de productos del e-commerce, importación
-- completa, notificaciones y asignación de recogidas a mensajeros.

-- ── 1. Toda la información del archivo, no solo las columnas conocidas ──
-- Las columnas que no corresponden a un campo de la app se guardan tal cual en
-- `extra`, para no perder nada de lo que el e-commerce sube.
alter table public.at_recipients
  add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.at_recipients.extra is
  'Columnas del archivo del cliente que no mapean a un campo propio. Se fusionan al reimportar, nunca se reemplazan.';

-- ── 2. Catálogo de productos del e-commerce ────────────────────────────
create table if not exists public.at_products (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.at_clients(id) on delete cascade,
  sku         text,
  name        text not null,
  description text,
  price       numeric(12,2) not null default 0,
  extra       jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.at_products is
  'Productos del e-commerce con su precio y descripción. Sirven para prellenar el valor a recaudar de una guía.';

-- Identidad: el SKU manda; si no hay, el nombre normalizado.
create unique index if not exists at_products_client_sku_idx
  on public.at_products (client_id, sku) where sku is not null;
create unique index if not exists at_products_client_name_idx
  on public.at_products (client_id, public.at_norm(name)) where sku is null;
create index if not exists at_products_client_idx on public.at_products (client_id, active);

drop trigger if exists at_products_touch on public.at_products;
create trigger at_products_touch before update on public.at_products
  for each row execute function public.at_touch_updated_at();

alter table public.at_products enable row level security;

drop policy if exists "cliente administra sus productos" on public.at_products;
create policy "cliente administra sus productos" on public.at_products
  for all to authenticated
  using (client_id = public.at_my_client())
  with check (client_id = public.at_my_client());

drop policy if exists "staff lee productos" on public.at_products;
create policy "staff lee productos" on public.at_products
  for select to authenticated
  using (public.at_is_staff());

-- ── 3. Sincronización de destinatarios: fusiona, nunca pierde datos ────
-- Al reimportar un registro que ya existe solo se AGREGA lo que falta: los
-- campos con valor no se sobreescriben con vacíos y `extra` se fusiona.
create or replace function public.at_sync_recipients(p_rows jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_creados int := 0; v_actualizados int := 0; v_omitidos int := 0;
  r jsonb;
  v_name text; v_addr text; v_city text; v_ext text; v_extra jsonb;
  v_existing uuid;
begin
  if v_role is null or v_client is null then
    raise exception 'Tu cuenta no está enlazada a un comercio.';
  end if;
  if v_role <> 'cliente' and not public.at_is_ops() then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato inválido: se esperaba una lista de destinatarios';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(r->>'full_name'), '');
    v_addr := nullif(trim(r->>'address'), '');
    v_city := coalesce(nullif(trim(r->>'city'), ''), 'Medellín');
    v_ext  := nullif(trim(r->>'external_id'), '');
    v_extra := coalesce(r->'extra', '{}'::jsonb);

    if v_name is null or v_addr is null then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_ext is not null then
      select id into v_existing from public.at_recipients
      where client_id = v_client and external_id = v_ext;
    else
      select id into v_existing from public.at_recipients
      where client_id = v_client and external_id is null
        and public.at_norm(full_name) = public.at_norm(v_name)
        and public.at_norm(address) = public.at_norm(v_addr);
    end if;

    if v_existing is null then
      insert into public.at_recipients (client_id, external_id, full_name, phone, address, city, zone_id, notes, extra)
      values (v_client, v_ext, v_name, nullif(trim(r->>'phone'),''), v_addr, v_city,
              public.at_zone_for_city(v_city || ' ' || v_addr), nullif(trim(r->>'notes'),''), v_extra);
      v_creados := v_creados + 1;
    else
      update public.at_recipients d set
        full_name = v_name,
        address   = v_addr,
        city      = v_city,
        -- Solo se completa lo que falta: un archivo sin teléfono no borra el que ya había.
        phone     = coalesce(nullif(trim(r->>'phone'),''), d.phone),
        notes     = coalesce(nullif(trim(r->>'notes'),''), d.notes),
        zone_id   = coalesce(public.at_zone_for_city(v_city || ' ' || v_addr), d.zone_id),
        extra     = d.extra || v_extra,   -- fusiona, las llaves nuevas se agregan
        active    = true
      where d.id = v_existing;
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  return json_build_object('creados', v_creados, 'actualizados', v_actualizados, 'omitidos', v_omitidos);
end $$;

revoke execute on function public.at_sync_recipients(jsonb) from public, anon;
grant execute on function public.at_sync_recipients(jsonb) to authenticated;

-- ── 4. Lectura de precios como los escribe la gente ────────────────────
-- Tolera "$ 45.000", "45,000.50", "45.000,50" y "45000". Regla: si hay ambos
-- separadores, el ÚLTIMO es el decimal; si solo hay uno y deja grupos de 3
-- dígitos, es separador de miles.
create or replace function public.at_parse_money(p text)
returns numeric
language plpgsql immutable set search_path = public
as $$
declare
  s text := regexp_replace(coalesce(p,''), '[^0-9.,]', '', 'g');
  ult_coma int; ult_punto int;
begin
  if s = '' then return 0; end if;

  ult_coma  := length(s) - position(',' in reverse(s));
  ult_punto := length(s) - position('.' in reverse(s));

  if position(',' in s) > 0 and position('.' in s) > 0 then
    if ult_coma > ult_punto then           -- 45.000,50 → coma decimal
      s := replace(replace(s, '.', ''), ',', '.');
    else                                    -- 45,000.50 → punto decimal
      s := replace(s, ',', '');
    end if;
  elsif position(',' in s) > 0 then
    -- Una sola coma: decimal si deja 1-2 dígitos detrás, si no es de miles.
    if length(s) - position(',' in reverse(s)) - 1 <= 2
       and length(s) - (length(s) - position(',' in reverse(s))) <= 3 then
      s := replace(s, ',', '.');
    else
      s := replace(s, ',', '');
    end if;
  elsif position('.' in s) > 0 then
    if length(split_part(s, '.', 2)) = 3 and position('.' in s) <= 4 then
      s := replace(s, '.', '');            -- 45.000 → miles
    end if;
  end if;

  return coalesce(nullif(s,'')::numeric, 0);
exception when others then
  return 0;
end $$;

revoke execute on function public.at_parse_money(text) from public, anon;
grant execute on function public.at_parse_money(text) to authenticated;

-- ── 5. Sincronización del catálogo de productos ────────────────────────
create or replace function public.at_sync_products(p_rows jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_creados int := 0; v_actualizados int := 0; v_omitidos int := 0;
  r jsonb;
  v_name text; v_sku text; v_precio numeric; v_extra jsonb;
  v_existing uuid;
begin
  if v_role is null or v_client is null then
    raise exception 'Tu cuenta no está enlazada a un comercio.';
  end if;
  if v_role <> 'cliente' and not public.at_is_ops() then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato inválido: se esperaba una lista de productos';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(r->>'name'), '');
    v_sku  := nullif(trim(r->>'sku'), '');
    v_extra := coalesce(r->'extra', '{}'::jsonb);
    v_precio := public.at_parse_money(r->>'price');

    if v_name is null then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_sku is not null then
      select id into v_existing from public.at_products where client_id = v_client and sku = v_sku;
    else
      select id into v_existing from public.at_products
      where client_id = v_client and sku is null and public.at_norm(name) = public.at_norm(v_name);
    end if;

    if v_existing is null then
      insert into public.at_products (client_id, sku, name, description, price, extra)
      values (v_client, v_sku, v_name, nullif(trim(r->>'description'),''), v_precio, v_extra);
      v_creados := v_creados + 1;
    else
      update public.at_products p set
        name        = v_name,
        description = coalesce(nullif(trim(r->>'description'),''), p.description),
        price       = case when v_precio > 0 then v_precio else p.price end,
        extra       = p.extra || v_extra,
        active      = true
      where p.id = v_existing;
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  return json_build_object('creados', v_creados, 'actualizados', v_actualizados, 'omitidos', v_omitidos);
end $$;

revoke execute on function public.at_sync_products(jsonb) from public, anon;
grant execute on function public.at_sync_products(jsonb) to authenticated;

-- ── 5. Notificaciones ──────────────────────────────────────────────────
create table if not exists public.at_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.at_profiles(id) on delete cascade,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists at_notifications_user_idx
  on public.at_notifications (user_id, read_at, created_at desc);

alter table public.at_notifications enable row level security;

-- Cada quien ve y marca como leídas SOLO las suyas. La creación va por RPC.
drop policy if exists "usuario lee sus notificaciones" on public.at_notifications;
create policy "usuario lee sus notificaciones" on public.at_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "usuario marca sus notificaciones" on public.at_notifications;
create policy "usuario marca sus notificaciones" on public.at_notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 6. El admin asigna la recogida a un mensajero, y le notifica ───────
create or replace function public.at_assign_pickup(p_pickup_id uuid, p_courier_id uuid)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup public.at_pickups;
  v_courier public.at_profiles;
  v_comercio text;
  v_guias int;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador asigna recogidas';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;

  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;
  if v_pickup.status in ('completada','cancelada') then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  update public.at_pickups
  set operator_id = p_courier_id, status = 'asignada'
  where id = p_pickup_id
  returning * into v_pickup;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;
  select count(*) into v_guias from public.at_guides where pickup_id = p_pickup_id;

  insert into public.at_notifications (user_id, title, body, link)
  values (
    p_courier_id,
    'Nueva recogida asignada',
    coalesce(v_comercio,'Un comercio') || ' · ' || v_pickup.address
      || case when v_pickup.scheduled_time is not null
              then ' · ' || to_char(v_pickup.scheduled_time,'HH24:MI') else '' end
      || case when v_guias > 0 then ' · ' || v_guias || ' guía(s)' else '' end,
    '/recogidas'
  );

  return v_pickup;
end $$;

revoke execute on function public.at_assign_pickup(uuid, uuid) from public, anon;
grant execute on function public.at_assign_pickup(uuid, uuid) to authenticated;
