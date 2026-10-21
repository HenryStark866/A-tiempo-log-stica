-- ═══════════════════════════════════════════════════════════════════════════
-- CREAR CUENTA POR SMS
--
-- Para quien no tiene internet ni un telefono que aguante la app. Manda un SMS
-- al numero de la empresa, contesta dos o tres preguntas y queda con cuenta.
-- El mismo celular Android que ya despacha los codigos de entrega (ver
-- docs/sms-desde-celular.md) es el que recibe: su webhook entra por
-- /api/sms/entrante, que es quien llama a estas funciones con la llave de
-- servicio.
--
-- ── Por que la conversacion vive en la base y no en memoria ──────────────
-- Un SMS no trae sesion. Lo unico que identifica a quien escribe es el numero
-- desde el que llega, y entre pregunta y respuesta pueden pasar horas. El
-- estado tiene que sobrevivir a reinicios y a que la peticion caiga en otra
-- instancia, asi que vive en una tabla.
--
-- ── Los textos van SIN TILDES, a proposito ──────────────────────────────
-- Un SMS con tilde se sale del alfabeto GSM de 7 bits, el operador lo manda
-- como UCS-2 y el mensaje pasa de 160 a 70 caracteres: se parte en dos o tres
-- y se cobra como dos o tres. La migracion 0142 ya tomo esta decision para los
-- codigos de entrega; aqui se mantiene.
--
-- ── Lo que NO puede hacer un SMS ────────────────────────────────────────
-- Darse a si mismo el rol de mensajero. Quien escribe MENSAJERO queda como
-- `pendiente` y espera a que un admin lo promueva desde la plataforma: si un
-- SMS bastara para ser mensajero, cualquiera con un telefono entraria a ver
-- guias ajenas. Por eso esa opcion tampoco figura en el menu.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La conversacion ──────────────────────────────────────────────────────
create table if not exists public.at_sms_altas (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  paso        text not null default 'menu',
  rol_pedido  public.at_role,
  nombre      text,
  negocio     text,
  direccion   text,
  intentos    int not null default 0,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expira_at   timestamptz not null default now() + interval '24 hours',
  constraint at_sms_altas_paso_valido check (
    paso in ('menu','nombre','negocio','direccion','confirmar','listo','creado','cancelado')
  )
);

comment on table public.at_sms_altas is
  'Conversacion de alta por SMS, un renglon por intento. La limpia at_limpiar_sms_altas.';

-- Una sola conversacion viva por numero: si alguien vuelve a escribir YAM a
-- mitad de camino, se retoma la suya en vez de abrir una paralela.
create unique index if not exists at_sms_altas_viva_idx
  on public.at_sms_altas (phone)
  where paso not in ('creado','cancelado');

create index if not exists at_sms_altas_expira_idx
  on public.at_sms_altas (expira_at) where paso not in ('creado','cancelado');

alter table public.at_sms_altas enable row level security;

-- Lleva nombre y telefono de una persona: solo el personal que atiende.
drop policy if exists "ops ve las altas por sms" on public.at_sms_altas;
create policy "ops ve las altas por sms" on public.at_sms_altas
  for select to authenticated
  using (public.at_my_role() in ('admin','coordinador','operario'));

-- ── El numero, en una sola forma ─────────────────────────────────────────
-- Llega de mil maneras (300 123 4567, +57300..., 0057300...). Sin normalizar,
-- la misma persona abriria una conversacion nueva cada vez que su operador
-- decide escribir el numero distinto.
create or replace function public.at_sms_normalizar_telefono(p_telefono text)
returns text
language plpgsql immutable
as $fn$
declare
  v text := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
begin
  if v = '' then return null; end if;
  v := regexp_replace(v, '^00', '');          -- prefijo internacional marcado
  if length(v) = 10 and left(v, 1) = '3' then -- celular colombiano sin indicativo
    v := '57' || v;
  end if;
  if length(v) < 10 then return null; end if;
  return '+' || v;
end;
$fn$;

-- ── Encolar una respuesta ────────────────────────────────────────────────
-- Reusa el buzon que ya existe: la edge function enviar-mensajes lo vacia por
-- el mismo celular. Asi no hay un segundo camino de salida que mantener.
create or replace function public.at_sms_responder(p_telefono text, p_texto text)
returns void
language sql security definer set search_path = public
as $fn$
  insert into public.at_message_outbox (to_phone, channel, body, status)
  values (p_telefono, 'sms', p_texto, 'pendiente');
$fn$;

revoke execute on function public.at_sms_responder(text, text) from public, anon, authenticated;

-- ── El SMS que entra ─────────────────────────────────────────────────────
-- Devuelve jsonb: { respuesta, crear, alta_id, rol }. `crear` en true es la
-- senal para que la ruta /api cree el usuario en auth con la llave de
-- servicio: crear usuarios no se hace desde SQL porque el hash de la clave lo
-- gobierna GoTrue, no nosotros.
create or replace function public.at_sms_recibir(p_telefono text, p_texto text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_tel    text := public.at_sms_normalizar_telefono(p_telefono);
  v_txt    text := upper(btrim(coalesce(p_texto, '')));
  v_alta   public.at_sms_altas%rowtype;
  v_resp   text;
  v_crear  boolean := false;
  v_perfil uuid;
begin
  if v_tel is null then
    return jsonb_build_object('respuesta', null, 'crear', false);
  end if;

  -- Tope por numero: 20 mensajes por hora. Un telefono que manda mas que eso
  -- no esta creando una cuenta, esta probando algo.
  perform public.at_limitar('sms_entrante:' || v_tel, 20, 2000, interval '1 hour');

  select * into v_alta
    from public.at_sms_altas
   where phone = v_tel and paso not in ('creado','cancelado')
     and expira_at > now()
   limit 1;

  -- SALIR corta en cualquier punto.
  if v_txt in ('SALIR','NO MAS','BAJA','STOP') then
    if v_alta.id is not null then
      update public.at_sms_altas set paso = 'cancelado', updated_at = now()
       where id = v_alta.id;
    end if;
    v_resp := 'Listo, no creamos nada. Escribe YAM cuando quieras volver.';
    perform public.at_sms_responder(v_tel, v_resp);
    return jsonb_build_object('respuesta', v_resp, 'crear', false);
  end if;

  if v_alta.id is null then
    -- Quien ya tiene cuenta con este numero no la crea dos veces.
    select id into v_perfil from public.at_profiles where phone = v_tel limit 1;
    if v_perfil is not null then
      v_resp := 'Este numero ya tiene cuenta en YAM. Escribe AYUDA si necesitas algo.';
      perform public.at_sms_responder(v_tel, v_resp);
      return jsonb_build_object('respuesta', v_resp, 'crear', false);
    end if;

    if v_txt = 'MENSAJERO' then
      insert into public.at_sms_altas (phone, paso, rol_pedido)
      values (v_tel, 'nombre', 'pendiente') returning * into v_alta;
      v_resp := 'Quieres trabajar como mensajero en YAM. Como te llamas? Responde nombre y apellido.';
    elsif v_txt in ('1','COMPRAR','COMPRADOR') then
      insert into public.at_sms_altas (phone, paso, rol_pedido)
      values (v_tel, 'nombre', 'comprador') returning * into v_alta;
      v_resp := 'Vas a crear tu cuenta para comprar. Como te llamas? Responde nombre y apellido.';
    elsif v_txt in ('2','VENDER','NEGOCIO','COMERCIO') then
      insert into public.at_sms_altas (phone, paso, rol_pedido)
      values (v_tel, 'nombre', 'cliente') returning * into v_alta;
      v_resp := 'Vas a registrar tu negocio en YAM. Como te llamas? Responde nombre y apellido.';
    else
      v_resp := 'YAM: crea tu cuenta por SMS. Responde 1 para COMPRAR, 2 si tienes un NEGOCIO y quieres vender. Responde SALIR para dejarlo.';
    end if;

    perform public.at_sms_responder(v_tel, v_resp);
    return jsonb_build_object('respuesta', v_resp, 'crear', false,
                              'alta_id', v_alta.id, 'rol', v_alta.rol_pedido);
  end if;

  -- ── Conversacion en curso ──────────────────────────────────────────────
  if v_alta.paso = 'nombre' then
    if length(btrim(p_texto)) < 3 then
      v_resp := 'No entendi el nombre. Responde con tu nombre y apellido.';
    elsif v_alta.rol_pedido = 'cliente' then
      update public.at_sms_altas
         set nombre = btrim(p_texto), paso = 'negocio', updated_at = now()
       where id = v_alta.id;
      v_resp := 'Gracias. Como se llama tu negocio?';
    else
      update public.at_sms_altas
         set nombre = btrim(p_texto), paso = 'confirmar', updated_at = now()
       where id = v_alta.id;
      v_resp := 'Confirmas tu cuenta en YAM a nombre de ' || btrim(p_texto)
                || '? Responde SI o NO.';
    end if;

  elsif v_alta.paso = 'negocio' then
    if length(btrim(p_texto)) < 2 then
      v_resp := 'No entendi. Como se llama tu negocio?';
    else
      update public.at_sms_altas
         set negocio = btrim(p_texto), paso = 'direccion', updated_at = now()
       where id = v_alta.id;
      v_resp := 'En que direccion recogemos los pedidos? Escribe direccion y barrio.';
    end if;

  elsif v_alta.paso = 'direccion' then
    if length(btrim(p_texto)) < 5 then
      v_resp := 'No entendi la direccion. Escribe direccion y barrio.';
    else
      update public.at_sms_altas
         set direccion = btrim(p_texto), paso = 'confirmar', updated_at = now()
       where id = v_alta.id;
      v_resp := 'Confirmas el registro de ' || coalesce(v_alta.negocio, 'tu negocio')
                || '? Responde SI o NO.';
    end if;

  elsif v_alta.paso = 'confirmar' then
    if v_txt in ('SI','S','CONFIRMO','OK') then
      update public.at_sms_altas set paso = 'listo', updated_at = now()
       where id = v_alta.id;
      -- La respuesta la manda at_sms_confirmar_alta, cuando el usuario exista.
      v_crear := true;
    elsif v_txt in ('NO','N') then
      update public.at_sms_altas
         set paso = 'nombre', nombre = null, negocio = null, direccion = null,
             intentos = v_alta.intentos + 1, updated_at = now()
       where id = v_alta.id;
      v_resp := 'Sin problema, empezamos de nuevo. Como te llamas?';
    else
      v_resp := 'Responde SI para confirmar o NO para corregir.';
    end if;
  end if;

  if v_resp is not null then
    perform public.at_sms_responder(v_tel, v_resp);
  end if;

  return jsonb_build_object('respuesta', v_resp, 'crear', v_crear,
                            'alta_id', v_alta.id, 'rol', v_alta.rol_pedido);
end;
$fn$;

revoke execute on function public.at_sms_recibir(text, text) from public, anon, authenticated;
grant  execute on function public.at_sms_recibir(text, text) to service_role;

-- ── Rematar el alta, ya con el usuario creado ────────────────────────────
create or replace function public.at_sms_confirmar_alta(p_alta_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_alta public.at_sms_altas%rowtype;
  v_cli  uuid;
  v_resp text;
begin
  select * into v_alta from public.at_sms_altas where id = p_alta_id for update;
  if not found or v_alta.paso <> 'listo' then
    return jsonb_build_object('ok', false, 'motivo', 'El alta no esta lista');
  end if;

  if v_alta.rol_pedido = 'cliente' then
    insert into public.at_clients (business_name, contact_name, phone, address)
    values (coalesce(v_alta.negocio, v_alta.nombre), v_alta.nombre, v_alta.phone, v_alta.direccion)
    returning id into v_cli;

    insert into public.at_profiles (id, full_name, phone, role, client_id)
    values (p_user_id, coalesce(v_alta.nombre, ''), v_alta.phone, 'cliente', v_cli)
    on conflict (id) do update
      set full_name = excluded.full_name, phone = excluded.phone,
          role = excluded.role, client_id = excluded.client_id;

    v_resp := 'Listo. ' || coalesce(v_alta.negocio, 'Tu negocio')
              || ' quedo registrado en YAM. Te buscamos para activarlo.';

  elsif v_alta.rol_pedido = 'pendiente' then
    -- Mensajero: queda en revision. El rol de verdad lo da un admin.
    insert into public.at_profiles (id, full_name, phone, role)
    values (p_user_id, coalesce(v_alta.nombre, ''), v_alta.phone, 'pendiente')
    on conflict (id) do update
      set full_name = excluded.full_name, phone = excluded.phone;
    v_resp := 'Recibimos tu solicitud para trabajar en YAM. Queda en revision y te avisamos por aqui.';

  else
    insert into public.at_profiles (id, full_name, phone, role)
    values (p_user_id, coalesce(v_alta.nombre, ''), v_alta.phone, 'comprador')
    on conflict (id) do update
      set full_name = excluded.full_name, phone = excluded.phone, role = excluded.role;
    v_resp := 'Listo ' || coalesce(v_alta.nombre, '')
              || '. Tu cuenta de comprador en YAM quedo creada con este numero.';
  end if;

  update public.at_sms_altas
     set paso = 'creado', user_id = p_user_id, updated_at = now()
   where id = p_alta_id;

  perform public.at_sms_responder(v_alta.phone, v_resp);
  return jsonb_build_object('ok', true, 'respuesta', v_resp, 'rol', v_alta.rol_pedido);
end;
$fn$;

revoke execute on function public.at_sms_confirmar_alta(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.at_sms_confirmar_alta(uuid, uuid) to service_role;

-- ── Limpieza ─────────────────────────────────────────────────────────────
-- Las conversaciones a medias guardan un nombre y un telefono: no se quedan
-- ahi para siempre. Las creadas tambien se borran al mes; el dato que importa
-- ya vive en at_profiles.
create or replace function public.at_limpiar_sms_altas()
returns void
language sql security definer set search_path = public
as $fn$
  delete from public.at_sms_altas
   where (paso <> 'creado' and expira_at < now())
      or created_at < now() - interval '30 days';
$fn$;

revoke execute on function public.at_limpiar_sms_altas() from public, anon, authenticated;
