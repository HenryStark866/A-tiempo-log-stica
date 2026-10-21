-- ═══════════════════════════════════════════════════════════════════════
-- EL SMS QUE RESPONDE CONSULTAS
--
-- La 0145 dejo que alguien sin internet creara su cuenta por SMS. Esta deja
-- que la USE: preguntar por su pedido, ver el catalogo de un negocio y
-- pedirle algo, desde un telefono de teclas. La conversacion la lleva el
-- motor de canales (src/lib/canales/motor.ts); aqui vive lo que tiene que
-- vivir en la base: lo que se recuerda entre mensajes, la idempotencia, y
-- las reglas de quien puede ver que.
--
-- ── Fase 0: sin dinero ───────────────────────────────────────────────────
-- Nada de esto mueve plata ni crea guias. PEDIR deja una solicitud en
-- `at_canal_pedidos` y le avisa al comercio, igual que el checkout de la
-- vitrina le manda un WhatsApp. Crear la guia sigue siendo del comercio:
-- un SMS de un numero que nadie verifico no puede generarle fletes.
--
-- ── Varios canales desde el principio ────────────────────────────────────
-- Las tablas llevan `canal` aunque hoy solo entre SMS. WhatsApp, USSD y la
-- llamada usan el mismo motor; cuando lleguen, cada uno trae un adaptador y
-- no una migracion nueva.
--
-- ── Quien llama esto ─────────────────────────────────────────────────────
-- Solo la ruta /api/sms/entrante con la llave de servicio. Todas las
-- funciones se le niegan a anon y authenticated.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Lo que entra ─────────────────────────────────────────────────────────
-- Un renglon por mensaje del proveedor. El gateway reintenta si no le
-- contestamos a tiempo; sin esta tabla, el reintento de un PEDIR SI crearia
-- dos pedidos. `procesado_at` en null = se recibio pero algo fallo antes de
-- terminar, y el reintento SI se debe atender.
create table if not exists public.at_canal_entrantes (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null,
  proveedor_id  text not null,
  telefono      text,
  texto         text not null default '',
  recibido_at   timestamptz not null default now(),
  procesado_at  timestamptz,
  constraint at_canal_entrantes_canal_valido
    check (canal in ('sms','whatsapp','ussd','voz','agente')),
  constraint at_canal_entrantes_unico unique (canal, proveedor_id)
);

comment on table public.at_canal_entrantes is
  'Mensajes que entran por canales sin internet. Idempotencia por (canal, proveedor_id). Se borran a los 30 dias.';

create index if not exists at_canal_entrantes_recibido_idx
  on public.at_canal_entrantes (recibido_at);

-- ── Lo que se recuerda entre un mensaje y otro ───────────────────────────
-- La lista de negocios que se le mostro, la pagina del catalogo, el pedido a
-- medio armar. Media hora: quien vuelve al dia siguiente empieza de cero, que
-- es menos confuso que retomar un catalogo que ya no tiene en la pantalla.
create table if not exists public.at_canal_sesiones (
  telefono    text not null,
  canal       text not null,
  estado      jsonb not null,
  updated_at  timestamptz not null default now(),
  expira_at   timestamptz not null default now() + interval '30 minutes',
  primary key (telefono, canal),
  constraint at_canal_sesiones_canal_valido
    check (canal in ('sms','whatsapp','ussd','voz','agente'))
);

comment on table public.at_canal_sesiones is
  'Estado de la conversacion del motor de canales, por numero y canal. Vence a los 30 minutos.';

-- ── Quien escribe ────────────────────────────────────────────────────────
-- Un renglon por numero. Hoy solo guarda la BAJA; en la fase 1 aqui van el
-- nivel de verificacion, el PIN (como hash) y los topes de la billetera.
create table if not exists public.at_canal_identidades (
  telefono    text primary key,
  nivel       smallint not null default 0,
  baja_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint at_canal_identidades_nivel_valido check (nivel between 0 and 2)
);

comment on table public.at_canal_identidades is
  'Numeros que usan canales sin internet. nivel: 0 sin verificar, 1 KYC simplificado, 2 completo. '
  'baja_at: pidio BAJA; ningun envio por iniciativa propia (recordatorios, avisos) puede escribirle.';

-- ── Los pedidos que llegan por SMS ───────────────────────────────────────
-- El precio y el nombre del producto se copian al crear: si el comercio
-- cambia el precio manana, el pedido sigue diciendo lo que la persona acepto.
create table if not exists public.at_canal_pedidos (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique
                     default ('P-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  canal            text not null default 'sms',
  telefono         text not null,
  nombre           text not null,
  direccion        text not null,
  client_id        uuid not null references public.at_clients(id) on delete cascade,
  product_id       uuid references public.at_products(id) on delete set null,
  producto_nombre  text not null,
  precio           numeric(12,2) not null,
  cantidad         int not null,
  estado           text not null default 'nuevo',
  guide_id         uuid references public.at_guides(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint at_canal_pedidos_canal_valido
    check (canal in ('sms','whatsapp','ussd','voz','agente')),
  constraint at_canal_pedidos_cantidad_valida check (cantidad between 1 and 20),
  constraint at_canal_pedidos_estado_valido check (estado in ('nuevo','confirmado','descartado'))
);

comment on table public.at_canal_pedidos is
  'Solicitudes de pedido hechas por SMS u otro canal sin internet. El comercio las confirma y crea la guia.';

create index if not exists at_canal_pedidos_cliente_idx
  on public.at_canal_pedidos (client_id, created_at desc);

-- ── Quien ve estas tablas ────────────────────────────────────────────────
-- Llevan telefonos y direcciones: el personal que atiende, como at_sms_altas.
-- El comercio ve SUS pedidos, para poder llamar y crear la guia.
alter table public.at_canal_entrantes   enable row level security;
alter table public.at_canal_sesiones    enable row level security;
alter table public.at_canal_identidades enable row level security;
alter table public.at_canal_pedidos     enable row level security;

drop policy if exists "ops ve lo que entra por canales" on public.at_canal_entrantes;
create policy "ops ve lo que entra por canales" on public.at_canal_entrantes
  for select to authenticated
  using (public.at_my_role() in ('admin','coordinador','operario'));

drop policy if exists "ops ve las sesiones de canales" on public.at_canal_sesiones;
create policy "ops ve las sesiones de canales" on public.at_canal_sesiones
  for select to authenticated
  using (public.at_my_role() in ('admin','coordinador','operario'));

drop policy if exists "ops ve las identidades de canales" on public.at_canal_identidades;
create policy "ops ve las identidades de canales" on public.at_canal_identidades
  for select to authenticated
  using (public.at_my_role() in ('admin','coordinador','operario'));

drop policy if exists "ops ve los pedidos por canales" on public.at_canal_pedidos;
create policy "ops ve los pedidos por canales" on public.at_canal_pedidos
  for select to authenticated
  using (public.at_my_role() in ('admin','coordinador','operario'));

drop policy if exists "el comercio ve sus pedidos por canales" on public.at_canal_pedidos;
create policy "el comercio ve sus pedidos por canales" on public.at_canal_pedidos
  for select to authenticated
  using (public.at_my_role() = 'cliente' and client_id = public.at_my_client());

-- ═══════════════════════════════════════════════════════════════════════
-- FUNCIONES. Todas security definer, todas solo para service_role.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Recibir: idempotencia ────────────────────────────────────────────────
-- `atender` en false = ese mismo mensaje ya se contesto. Sin id del
-- proveedor no hay como reconocer un reintento: se atiende siempre.
create or replace function public.at_canal_registrar_entrante(
  p_canal text, p_proveedor_id text, p_telefono text, p_texto text
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_prov text := coalesce(nullif(btrim(p_proveedor_id), ''), 'sin-id:' || gen_random_uuid()::text);
  v_id   uuid;
  v_proc timestamptz;
begin
  insert into public.at_canal_entrantes (canal, proveedor_id, telefono, texto)
  values (p_canal, left(v_prov, 200), public.at_sms_normalizar_telefono(p_telefono),
          left(coalesce(p_texto, ''), 1000))
  on conflict (canal, proveedor_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'atender', true);
  end if;

  select id, procesado_at into v_id, v_proc
    from public.at_canal_entrantes
   where canal = p_canal and proveedor_id = left(v_prov, 200);
  return jsonb_build_object('id', v_id, 'atender', v_proc is null);
end;
$fn$;

-- ── Contexto: quien escribe y en que va ──────────────────────────────────
-- Devuelve null si el remitente no es un celular (un "CLARO" que avisa de una
-- recarga, por ejemplo): a esos no se les contesta.
--
-- El perfil se busca normalizando ambos lados: un comercio creado desde la
-- web pudo guardar "300 123 4567" y el SMS llega como +573001234567.
create or replace function public.at_canal_contexto(p_canal text, p_telefono text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_tel    text := public.at_sms_normalizar_telefono(p_telefono);
  v_perfil jsonb;
  v_sesion jsonb;
begin
  if v_tel is null then return null; end if;

  -- 30 por hora por numero. Aparte del tope de la 0145, que cuenta las altas.
  perform public.at_limitar('canal:' || v_tel, 30, 3000, interval '1 hour');

  select jsonb_build_object('id', p.id, 'nombre', p.full_name, 'rol', p.role)
    into v_perfil
    from public.at_profiles p
   where public.at_sms_normalizar_telefono(p.phone) = v_tel
   order by p.created_at
   limit 1;

  select s.estado into v_sesion
    from public.at_canal_sesiones s
   where s.telefono = v_tel and s.canal = p_canal and s.expira_at > now();

  return jsonb_build_object(
    'telefono',  v_tel,
    'perfil',    v_perfil,
    'alta_viva', exists (
                   select 1 from public.at_sms_altas a
                    where a.phone = v_tel
                      and a.paso not in ('creado','cancelado')
                      and a.expira_at > now()),
    'baja',      exists (
                   select 1 from public.at_canal_identidades i
                    where i.telefono = v_tel and i.baja_at is not null),
    'sesion',    v_sesion
  );
end;
$fn$;

-- ── Aplicar: sesion + respuestas + atendido, en una sola transaccion ─────
-- Si algo falla aqui no queda una respuesta enviada con la sesion vieja, ni
-- un mensaje marcado como atendido sin haberse contestado.
-- p_sesion_accion: 'guardar' | 'borrar' | 'dejar'.
create or replace function public.at_canal_aplicar(
  p_entrante uuid, p_canal text, p_telefono text,
  p_sesion_accion text, p_sesion jsonb, p_mensajes jsonb
)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if p_telefono is not null then
    if p_sesion_accion = 'guardar' and p_sesion is not null then
      insert into public.at_canal_sesiones (telefono, canal, estado)
      values (p_telefono, p_canal, p_sesion)
      on conflict (telefono, canal) do update
        set estado = excluded.estado, updated_at = now(),
            expira_at = now() + interval '30 minutes';
    elsif p_sesion_accion = 'borrar' then
      delete from public.at_canal_sesiones where telefono = p_telefono and canal = p_canal;
    end if;
  end if;

  -- Por el mismo buzon que vacia enviar-mensajes (ver 0145). WhatsApp tiene
  -- canal propio en el buzon; USSD y voz contestan en la misma sesion y no
  -- encolan nada, pero si algun dia lo hacen, salen por SMS.
  insert into public.at_message_outbox (to_phone, channel, body, status)
  select m->>'para',
         (case when p_canal = 'whatsapp' then 'whatsapp' else 'sms' end)::public.at_msg_channel,
         left(m->>'texto', 480),
         'pendiente'
    from jsonb_array_elements(coalesce(p_mensajes, '[]'::jsonb)) as m
   where coalesce(m->>'para', '') <> '' and coalesce(m->>'texto', '') <> '';

  update public.at_canal_entrantes set procesado_at = now() where id = p_entrante;
end;
$fn$;

-- ── BAJA ─────────────────────────────────────────────────────────────────
create or replace function public.at_canal_marcar_baja(p_telefono text, p_baja boolean)
returns void
language sql security definer set search_path = public
as $fn$
  insert into public.at_canal_identidades (telefono, baja_at)
  values (p_telefono, case when p_baja then now() end)
  on conflict (telefono) do update
    set baja_at = case when p_baja then now() end, updated_at = now();
$fn$;

-- ── GUIA: el estado, solo para quien le corresponde ──────────────────────
-- Para el destinatario (por recipient_phone, el mismo vinculo de la 0146) o
-- para el comercio duenio de la guia. A cualquier otro se le responde como si
-- la guia no existiera: confirmar que existe ya es decir algo.
create or replace function public.at_canal_guia(p_telefono text, p_numero text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_tel text := public.at_sms_normalizar_telefono(p_telefono);
  v_num text := upper(regexp_replace(coalesce(p_numero, ''), '\s', '', 'g'));
begin
  if v_tel is null or v_num = '' then return null; end if;
  if v_num ~ '^[0-9]+$' then
    v_num := 'ATL-' || v_num;
  elsif v_num ~ '^ATL[0-9]+$' then
    v_num := 'ATL-' || substr(v_num, 4);
  end if;

  return (
    select jsonb_build_object(
             'numero', g.guide_number, 'estado', g.status, 'comercio', c.business_name,
             'actualizada', g.updated_at, 'entregada', g.delivered_at)
      from public.at_guides g
      join public.at_clients c on c.id = g.client_id
     where g.guide_number = v_num
       and (public.at_sms_normalizar_telefono(g.recipient_phone) = v_tel
            or exists (
                 select 1 from public.at_profiles p
                  where p.role = 'cliente'
                    and p.client_id = g.client_id
                    and public.at_sms_normalizar_telefono(p.phone) = v_tel))
  );
end;
$fn$;

-- ── MIS GUIAS: las tres ultimas que van a este numero ────────────────────
create or replace function public.at_canal_mis_guias(p_telefono text)
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(x.fila order by x.creada desc), '[]'::jsonb)
    from (
      select g.created_at as creada,
             jsonb_build_object(
               'numero', g.guide_number, 'estado', g.status, 'comercio', c.business_name,
               'actualizada', g.updated_at, 'entregada', g.delivered_at) as fila
        from public.at_guides g
        join public.at_clients c on c.id = g.client_id
       where public.at_sms_normalizar_telefono(g.recipient_phone)
             = public.at_sms_normalizar_telefono(p_telefono)
       order by g.created_at desc
       limit 3
    ) x;
$fn$;

-- ── CATALOGO: negocios que tienen algo que vender ────────────────────────
-- Solo nombre e id: lo mismo que ya es publico en la vitrina (0143).
-- El termino se limpia a letras y numeros antes del LIKE, para que un % o un
-- _ escritos por la persona no se vuelvan comodines.
create or replace function public.at_canal_comercios(p_termino text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_t text := btrim(regexp_replace(public.at_norm(p_termino), '[^a-z0-9 ]', '', 'g'));
begin
  if length(v_t) < 3 then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.business_name)
                              order by x.business_name), '[]'::jsonb)
      from (
        select c.id, c.business_name
          from public.at_clients c
         where c.active
           and public.at_norm(c.business_name) like '%' || v_t || '%'
           and exists (select 1 from public.at_products p where p.client_id = c.id and p.active)
         order by c.business_name
         limit 5
      ) x
  );
end;
$fn$;

create or replace function public.at_canal_productos(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.name, 'precio', x.price)
                            order by x.name), '[]'::jsonb)
    from (
      select p.id, p.name, p.price
        from public.at_products p
        join public.at_clients c on c.id = p.client_id and c.active
       where p.client_id = p_client_id and p.active
       order by p.name
       limit 30
    ) x;
$fn$;

-- ── PEDIR: la solicitud y el telefono del comercio para avisarle ─────────
-- El precio sale de at_products, no de lo que traiga la sesion: entre que la
-- persona vio el catalogo y dijo SI pudo cambiar. Cinco pedidos por numero al
-- dia: mas que eso desde un telefono de teclas no es una persona comprando.
create or replace function public.at_canal_pedir(p_telefono text, p_canal text, p_pedido jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_tel     text := public.at_sms_normalizar_telefono(p_telefono);
  v_cant    int;
  v_nombre  text := left(btrim(coalesce(p_pedido->>'nombre', '')), 80);
  v_dir     text := left(btrim(coalesce(p_pedido->>'direccion', '')), 160);
  v_prod    public.at_products%rowtype;
  v_cli     public.at_clients%rowtype;
  v_codigo  text;
begin
  if v_tel is null then
    return jsonb_build_object('ok', false, 'motivo', 'telefono');
  end if;

  if coalesce(p_pedido->>'cantidad', '') !~ '^[0-9]{1,2}$' then
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;
  v_cant := (p_pedido->>'cantidad')::int;
  if v_cant not between 1 and 20 or length(v_nombre) < 3 or length(v_dir) < 5 then
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  begin
    select * into v_prod
      from public.at_products
     where id = (p_pedido->>'producto_id')::uuid
       and client_id = (p_pedido->>'comercio_id')::uuid
       and active;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'motivo', 'producto');
  end;
  if v_prod.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'producto');
  end if;

  select * into v_cli from public.at_clients where id = v_prod.client_id and active;
  if v_cli.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'producto');
  end if;

  -- El tope va despues de validar: un pedido mal armado no gasta cupo.
  begin
    perform public.at_limitar('canal_pedido:' || v_tel, 5, 500, interval '1 day');
  exception when sqlstate 'PT429' then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end;

  insert into public.at_canal_pedidos
    (canal, telefono, nombre, direccion, client_id, product_id, producto_nombre, precio, cantidad)
  values
    (p_canal, v_tel, v_nombre, v_dir, v_cli.id, v_prod.id, v_prod.name, v_prod.price, v_cant)
  returning codigo into v_codigo;

  return jsonb_build_object(
    'ok', true,
    'codigo', v_codigo,
    'comercio', v_cli.business_name,
    'producto', v_prod.name,
    'total', v_prod.price * v_cant,
    'telefono_comercio', public.at_sms_normalizar_telefono(v_cli.phone)
  );
end;
$fn$;

-- ── Limpieza ─────────────────────────────────────────────────────────────
-- Los textos que entran son de personas: no se guardan para siempre.
create or replace function public.at_limpiar_canales()
returns void
language sql security definer set search_path = public
as $fn$
  delete from public.at_canal_entrantes where recibido_at < now() - interval '30 days';
  delete from public.at_canal_sesiones  where expira_at < now();
$fn$;

-- ── Permisos ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.at_canal_registrar_entrante(text, text, text, text)',
    'public.at_canal_contexto(text, text)',
    'public.at_canal_aplicar(uuid, text, text, text, jsonb, jsonb)',
    'public.at_canal_marcar_baja(text, boolean)',
    'public.at_canal_guia(text, text)',
    'public.at_canal_mis_guias(text)',
    'public.at_canal_comercios(text)',
    'public.at_canal_productos(uuid)',
    'public.at_canal_pedir(text, text, jsonb)',
    'public.at_limpiar_canales()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
