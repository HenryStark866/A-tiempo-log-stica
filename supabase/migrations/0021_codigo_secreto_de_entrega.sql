-- A TIEMPO LOGÍSTICA — Código secreto de entrega.
--
-- PROBLEMA: hoy el mensajero marca "entregada" por su cuenta. La única prueba
-- es una foto que él mismo toma. Si dice que entregó y no entregó, el CEDI se
-- entera tarde y mal.
--
-- SOLUCIÓN: cuando el mensajero acepta el paquete en el CEDI se genera un
-- código de 6 dígitos y se le manda al comprador por SMS y WhatsApp. Al
-- entregar, el comprador se lo dicta y el mensajero lo escribe. Sin ese código
-- no hay entrega, así que "entregada" pasa a significar que alguien que tenía
-- el teléfono del destinatario estuvo ahí.
--
-- EL CÓDIGO NO SE GUARDA EN CLARO Y EL MENSAJERO NO PUEDE LEERLO.
-- Va como hash bcrypt en at_delivery_codes, una tabla con RLS y sin ninguna
-- política: nadie la consulta directo, solo entran las funciones security
-- definer de aquí. Si el hash viviera en at_guides el mensajero lo leería por
-- API —la política "staff o dueño lee guías" lo incluye— y con 6 dígitos
-- podría sacarlo por fuerza bruta y firmar entregas que nunca hizo.

-- ── 1. Tipos del buzón de salida ───────────────────────────────────────
do $$ begin
  create type public.at_msg_channel as enum ('sms', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.at_msg_status as enum ('pendiente', 'enviado', 'fallido');
exception when duplicate_object then null; end $$;

-- ── 2. El código ───────────────────────────────────────────────────────
create table if not exists public.at_delivery_codes (
  guide_id    uuid primary key references public.at_guides(id) on delete cascade,
  code_hash   text not null,
  attempts    int  not null default 0,
  locked      boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.at_delivery_codes is
  'Hash del código que el comprador le dicta al mensajero. RLS activo y SIN políticas a propósito: solo las funciones security definer lo tocan, para que el mensajero no pueda leerlo ni siquiera en hash.';

alter table public.at_delivery_codes enable row level security;

-- ── 3. Buzón de salida de mensajes ─────────────────────────────────────
-- Los mensajes se encolan aquí y un proceso aparte los envía. Va desacoplado
-- para que una caída del proveedor de SMS no tumbe la operación del CEDI:
-- el paquete sale igual y el mensaje se reintenta.
create table if not exists public.at_message_outbox (
  id           uuid primary key default gen_random_uuid(),
  guide_id     uuid references public.at_guides(id) on delete cascade,
  to_phone     text,
  channel      public.at_msg_channel not null,
  body         text not null,
  status       public.at_msg_status not null default 'pendiente',
  error        text,
  provider_id  text,
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists at_message_outbox_pendientes_idx
  on public.at_message_outbox (status, created_at) where status = 'pendiente';

alter table public.at_message_outbox enable row level security;

-- El cuerpo del mensaje LLEVA el código, así que verlo es verlo. Se limita al
-- personal del CEDI; el mensajero queda fuera, que es de quien hay que
-- guardarlo. Va con la lista explícita porque at_is_staff() lo incluiría.
drop policy if exists "ops ve el buzon" on public.at_message_outbox;
create policy "ops ve el buzon" on public.at_message_outbox
  for select to authenticated
  using (public.at_my_role() in ('admin','coordinador','operario'));

-- ── 4. Generar y encolar ───────────────────────────────────────────────
-- Interna: no se concede a nadie. La llama at_assign_courier.
create or replace function public.at_issue_delivery_code(p_guide_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_code  text;
  v_body  text;
  v_ch    public.at_msg_channel;
begin
  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then return; end if;

  -- Si ya tiene código vigente no se toca: reemitirlo dejaría al comprador con
  -- un código viejo en el celular y la entrega se caería en la puerta.
  if exists (select 1 from public.at_delivery_codes where guide_id = p_guide_id) then
    return;
  end if;

  -- 6 dígitos, con ceros a la izquierda para que 000042 sea válido y el
  -- espacio real sea el millón completo.
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.at_delivery_codes (guide_id, code_hash)
  values (p_guide_id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)));

  v_body := 'Este es el código ID de tu paquete: ' || v_code
    || '. No lo compartas hasta tener tu pedido en manos. Guía '
    || v_guide.guide_number || ' · A Tiempo Logística.';

  -- Sin teléfono no hay a dónde mandarlo. Se deja anotado como fallido para
  -- que ops lo vea y le pida el dato al comercio, en vez de descubrirlo en la
  -- puerta del comprador.
  foreach v_ch in array array['sms','whatsapp']::public.at_msg_channel[] loop
    insert into public.at_message_outbox (guide_id, to_phone, channel, body, status, error)
    values (
      p_guide_id, v_guide.recipient_phone, v_ch, v_body,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'fallido' else 'pendiente' end::public.at_msg_status,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'La guía no tiene teléfono del destinatario' end
    );
  end loop;
end $$;

revoke execute on function public.at_issue_delivery_code(uuid) from public, anon, authenticated;

-- ── 5. Se emite al aceptar el paquete en el CEDI ───────────────────────
create or replace function public.at_assign_courier(
  p_guide_id uuid, p_courier_id uuid, p_zone_id uuid default null
)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_courier public.at_profiles;
  v_role public.at_role := public.at_my_role();
begin
  if v_role is null or v_role not in ('admin','coordinador','operario','mensajero') then
    raise exception 'No autorizado';
  end if;

  select * into v_courier from public.at_profiles where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;
  if v_courier.verified_at is null then
    raise exception 'El mensajero % todavía no está habilitado: sus documentos no han sido aprobados', v_courier.full_name;
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;
  if v_guide.status not in ('en_cedi','reprogramada') then
    raise exception 'Solo guías en CEDI o reprogramadas se pueden zonificar (estado actual: %)', v_guide.status;
  end if;

  update public.at_guides g set
    courier_id = p_courier_id,
    zone_id = coalesce(p_zone_id, g.zone_id, v_courier.zone_id),
    status = 'zonificada'
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, 'zonificada', 'Asignada a ' || v_courier.full_name, auth.uid());

  -- El paquete queda en manos del mensajero: aquí nace el código, antes de
  -- que salga a ruta.
  perform public.at_issue_delivery_code(p_guide_id);

  return v_guide;
end $$;

-- ── 6. Reenviar (genera uno nuevo) ─────────────────────────────────────
-- No existe "ver el código": si el comprador lo perdió se emite otro. Una
-- función que lo revelara sería la puerta trasera que todo esto evita.
create or replace function public.at_resend_delivery_code(p_guide_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
begin
  if public.at_my_role() not in ('admin','coordinador','operario') then
    raise exception 'Solo el personal del CEDI reenvía el código';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then raise exception 'Guía no encontrada'; end if;
  if v_guide.status = 'entregada' then
    raise exception 'Esta guía ya fue entregada';
  end if;

  delete from public.at_delivery_codes where guide_id = p_guide_id;
  perform public.at_issue_delivery_code(p_guide_id);
end $$;

revoke execute on function public.at_resend_delivery_code(uuid) from public, anon;
grant execute on function public.at_resend_delivery_code(uuid) to authenticated;

-- ── 7. Sin código no hay entrega ───────────────────────────────────────
-- Se BORRA la versión de 4 argumentos en vez de dejarla: crear la de 5 con un
-- valor por defecto la dejaría viva como sobrecarga, y el mensajero podría
-- seguir llamando la vieja y saltarse el código por completo.
drop function if exists public.at_confirm_delivery(uuid, text, text, text);

create or replace function public.at_confirm_delivery(
  p_guide_id       uuid,
  p_evidence_url   text default null,
  p_signature_name text default null,
  p_note           text default null,
  p_delivery_code  text default null
)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_role  public.at_role := public.at_my_role();
  v_code  public.at_delivery_codes;
  v_nota  text := p_note;
begin
  if v_role is null or v_role in ('pendiente','cliente') then
    raise exception 'No autorizado';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;

  if v_guide.status <> 'en_ruta' then
    raise exception 'Solo guías en ruta pueden marcarse como entregadas (estado actual: %)', v_guide.status;
  end if;

  if v_role = 'mensajero' and v_guide.courier_id is distinct from auth.uid() then
    raise exception 'Esta guía no está asignada a tu perfil';
  end if;

  if v_role not in ('mensajero','admin','coordinador') then
    raise exception 'Rol % no puede confirmar entregas', v_role;
  end if;

  if v_guide.is_cod and coalesce(length(trim(p_evidence_url)), 0) = 0 then
    raise exception 'Esta guía es contraentrega: la evidencia de entrega (foto) es obligatoria';
  end if;

  select * into v_code from public.at_delivery_codes where guide_id = p_guide_id for update;

  if found and v_code.verified_at is null then
    if v_code.locked then
      raise exception 'El código se bloqueó por demasiados intentos. Un coordinador debe reenviarlo.';
    end if;

    if coalesce(trim(p_delivery_code), '') = '' then
      -- Salida de emergencia para ops (el comprador perdió el celular), pero
      -- queda escrita en el historial. El mensajero nunca puede saltárselo.
      if v_role = 'mensajero' then
        raise exception 'Pídele al comprador el código de 6 dígitos de su paquete';
      end if;
      v_nota := coalesce(v_nota || ' · ', '') || 'Entregada SIN código, autorizada por coordinación';
    elsif extensions.crypt(trim(p_delivery_code), v_code.code_hash) = v_code.code_hash then
      update public.at_delivery_codes
      set verified_at = now(), attempts = attempts + 1
      where guide_id = p_guide_id;
    else
      update public.at_delivery_codes set
        attempts = attempts + 1,
        locked   = (attempts + 1) >= 5
      where guide_id = p_guide_id
      returning * into v_code;

      if v_code.locked then
        raise exception 'Código incorrecto. Se bloqueó por 5 intentos fallidos: un coordinador debe reenviarlo.';
      end if;
      raise exception 'Código incorrecto. Te quedan % intento(s).', 5 - v_code.attempts;
    end if;
  end if;

  update public.at_guides g set
    status = 'entregada',
    delivered_at = now(),
    delivery_evidence_url = coalesce(p_evidence_url, g.delivery_evidence_url),
    delivery_signature_name = coalesce(p_signature_name, g.delivery_signature_name)
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, 'entregada', v_nota, auth.uid());

  return v_guide;
end $$;

revoke execute on function public.at_confirm_delivery(uuid, text, text, text, text) from public, anon;
grant execute on function public.at_confirm_delivery(uuid, text, text, text, text) to authenticated;

-- ── 8. Estado del código, sin revelarlo ────────────────────────────────
-- Lo que el CEDI necesita saber: si salió, si llegó, cuántos intentos lleva y
-- si ya se validó. Nunca el código.
create or replace function public.at_delivery_code_report()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
  from (
    select g.id            as guide_id,
           g.guide_number,
           g.status,
           g.recipient_name,
           g.recipient_phone,
           dc.attempts,
           dc.locked,
           dc.verified_at is not null as verificado,
           dc.created_at,
           coalesce(bool_or(o.status = 'enviado'), false)   as algun_envio_ok,
           coalesce(bool_and(o.status = 'fallido'), false)  as todos_fallaron,
           max(o.error)                                     as ultimo_error
    from public.at_delivery_codes dc
    join public.at_guides g on g.id = dc.guide_id
    left join public.at_message_outbox o on o.guide_id = dc.guide_id
    where public.at_my_role() in ('admin','coordinador','operario')
    group by g.id, g.guide_number, g.status, g.recipient_name,
             g.recipient_phone, dc.attempts, dc.locked, dc.verified_at, dc.created_at
    limit 300
  ) t
$$;

revoke execute on function public.at_delivery_code_report() from public, anon;
grant execute on function public.at_delivery_code_report() to authenticated;

-- ── 9. Códigos para las guías que ya van en ruta ───────────────────────
-- Sin esto, lo que salió del CEDI antes del despliegue se quedaría sin código
-- y el mensajero no podría entregarlo.
do $$
declare v_id uuid;
begin
  for v_id in
    select id from public.at_guides
    where status in ('zonificada','en_ruta')
      and not exists (select 1 from public.at_delivery_codes dc where dc.guide_id = id)
  loop
    perform public.at_issue_delivery_code(v_id);
  end loop;
end $$;
