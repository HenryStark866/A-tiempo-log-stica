-- ═══════════════════════════════════════════════════════════════════════════
-- EL CÓDIGO DE ENTREGA TAMBIÉN LLEGA POR CORREO
--
-- Hasta hoy el código solo podía salir por SMS o WhatsApp, y ninguno de los dos
-- tenía proveedor: nunca salió solo (los mensajes del buzón viejo dicen «Sin
-- canal de envío configurado»). El correo sí tiene por dónde salir —Amazon SES,
-- el mismo que ya manda la confirmación de cuenta— y cuesta del orden de
-- US$0,10 por cada mil.
--
-- Lo que faltaba era el dato: ningún pedido guardaba el correo del comprador.
-- Esta migración lo añade a la guía y a la libreta de compradores, y lo trae de
-- Shopify, que sí lo tiene. Es OPCIONAL: un pedido sin correo sigue igual.
--
-- ── Lo que se enciende solo ────────────────────────────────────────────────
-- La regla de la 0022 exige el código al entregar solo si hay un mensaje
-- 'enviado' para la guía. Un correo enviado cuenta: desde que salga el primero,
-- ese pedido pide su código en la puerta.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El dato ─────────────────────────────────────────────────────────────
-- La validación es la mínima que separa un correo de un error de dedo (algo,
-- arroba, algo, punto, algo). La de verdad la hace SES: si rebota, el rebote
-- llega a yam-alertas y el mensaje queda fallido.
alter table public.at_guides
  add column if not exists recipient_email text;

alter table public.at_guides
  drop constraint if exists at_guides_recipient_email_valido;
alter table public.at_guides
  add constraint at_guides_recipient_email_valido check (
    recipient_email is null
    or (length(recipient_email) <= 254 and recipient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  );

comment on column public.at_guides.recipient_email is
  'Correo del comprador. Opcional. Si está, el código de entrega también se le manda por correo (migración 0126).';

alter table public.at_recipients
  add column if not exists email text;

alter table public.at_recipients
  drop constraint if exists at_recipients_email_valido;
alter table public.at_recipients
  add constraint at_recipients_email_valido check (
    email is null
    or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  );

alter table public.at_message_outbox
  add column if not exists to_email text;

comment on column public.at_message_outbox.to_email is
  'Destino de las filas del canal email. Las de sms y whatsapp usan to_phone.';

-- ── 2. El código se encola también por correo ──────────────────────────────
-- Igual que la 0113, más una fila de canal 'email' cuando la guía trae correo.
create or replace function public.at_issue_delivery_code(p_guide_id uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide public.at_guides;
  v_code  text;
  v_body  text;
  v_ch    public.at_msg_channel;
begin
  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then return; end if;

  if exists (select 1 from public.at_delivery_codes where guide_id = p_guide_id) then
    return;
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.at_delivery_codes (guide_id, code_hash)
  values (p_guide_id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)));

  v_body := 'Este es el código ID de tu paquete: ' || v_code
    || '. No lo compartas hasta tener tu pedido en manos. Pedido '
    || v_guide.guide_number || ' · A Tiempo Logística.';

  foreach v_ch in array array['sms','whatsapp']::public.at_msg_channel[] loop
    insert into public.at_message_outbox
      (guide_id, to_phone, channel, body, template_params, status, error)
    values (
      p_guide_id, v_guide.recipient_phone, v_ch, v_body,
      case when v_ch = 'whatsapp'
           then jsonb_build_object('pedido', v_guide.guide_number, 'codigo', v_code)
           end,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'fallido' else 'pendiente' end::public.at_msg_status,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'El pedido no tiene teléfono del destinatario' end
    );
  end loop;

  -- El correo solo se encola si hay a quién: una fila «fallida por falta de
  -- correo» en cada pedido sin correo sería ruido en la bandeja del operario.
  if coalesce(trim(v_guide.recipient_email),'') <> '' then
    insert into public.at_message_outbox
      (guide_id, to_email, channel, body, template_params, status)
    values (
      p_guide_id, trim(v_guide.recipient_email), 'email', v_body,
      jsonb_build_object('pedido', v_guide.guide_number, 'codigo', v_code),
      'pendiente'
    );
  end if;
end $function$;

revoke execute on function public.at_issue_delivery_code(uuid) from public, anon, authenticated;

-- ── 3. Shopify trae el correo del comprador ────────────────────────────────
-- Misma función de la 0025 con un parámetro más, opcional. Se borra la firma
-- vieja: con las dos, una llamada con nombres sin p_email sería ambigua.
drop function if exists public.at_shopify_upsert_order(uuid, text, text, text, text, text, boolean, numeric, text);

create or replace function public.at_shopify_upsert_order(
  p_client_id uuid,
  p_order_id  text,
  p_name      text,
  p_phone     text,
  p_address   text,
  p_city      text,
  p_is_cod    boolean,
  p_amount    numeric,
  p_notes     text,
  p_email     text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_zona  uuid;
  v_email text := nullif(lower(trim(coalesce(p_email,''))),'');
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_address),'') = '' then
    return 'incompleto';
  end if;

  select id into v_id from public.at_guides
  where client_id = p_client_id and external_source = 'shopify' and external_id = p_order_id;

  if found then
    return 'repetido';
  end if;

  -- Un correo que no pasa la validación no debe tumbar la guía: se descarta y
  -- el pedido entra sin él, como entraba antes de esta migración.
  if v_email is not null and not (length(v_email) <= 254 and v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    v_email := null;
  end if;

  v_zona := public.at_zone_for_city(coalesce(p_city,'') || ' ' || coalesce(p_address,''));

  insert into public.at_guides (
    client_id, recipient_name, recipient_phone, recipient_email, recipient_address, recipient_city,
    zone_id, is_cod, cod_amount, notes, external_source, external_id
  ) values (
    p_client_id, trim(p_name), nullif(trim(coalesce(p_phone,'')),''), v_email,
    trim(p_address), trim(coalesce(p_city,'')),
    v_zona, coalesce(p_is_cod,false),
    case when coalesce(p_is_cod,false) then greatest(coalesce(p_amount,0),0) else 0 end,
    nullif(trim(coalesce(p_notes,'')),''), 'shopify', p_order_id
  );

  return 'creado';
end $$;

revoke execute on function public.at_shopify_upsert_order(uuid, text, text, text, text, text, boolean, numeric, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
