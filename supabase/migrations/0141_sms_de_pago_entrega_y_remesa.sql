-- ═══════════════════════════════════════════════════════════════════════════
-- SMS DE CONFIRMACIÓN: PAGO, REMESA, ENTREGA E INTENTO FALLIDO
--
-- Contrato de integración, sección «Mensajes SMS». Todo sale por el buzón que
-- ya existe (at_message_outbox) y lo despacha `enviar-mensajes` por el celular
-- con SMS Gateway for Android (docs/sms-desde-celular.md). Aquí solo se ENCOLA.
--
-- ── Plantillas ────────────────────────────────────────────────────────────
-- Cortas y en ASCII puro: una «ó» o una «í» saca el SMS del alfabeto GSM-7 y
-- lo pasa a UCS-2, que cabe a 70 caracteres por segmento en vez de 160. Con
-- tildes, una confirmación de pago son dos mensajes. Sin tildes, uno.
--
--   pago_recibido     A Tiempo: recibimos tu pago de $20.000 del pedido ATL-123. Ref 8f3a2c1b
--   pago_enviado      A Tiempo: te enviamos un pago de $20.000. Ref 8f3a2c1b
--   remesa_liquidada  A Tiempo: liquidamos tu remesa REM-45 por $120.000. Ref 8f3a2c1b
--   guia_entregada    A Tiempo: tu pedido ATL-123 fue entregado. Ref ATL-123
--   intento_fallido   A Tiempo: no pudimos entregar tu pedido ATL-123 (intento 1). Te contactamos. Ref ATL-123
--   (la de «guía recogida con código» es la de at_issue_delivery_code, 0142)
--
-- Cada fila lleva su referencia: guide_id (pedido) o intent_id (Intención de
-- Pago del contrato), y `ref_key` + `plantilla` impiden mandar dos veces el
-- mismo aviso si un trigger se repite.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_message_outbox
  add column if not exists intent_id uuid,
  add column if not exists plantilla text,
  add column if not exists ref_key   text;

comment on column public.at_message_outbox.intent_id is
  'Intención de Pago (contrato YAM↔SolV) a la que se refiere el mensaje, si es de plata.';
comment on column public.at_message_outbox.plantilla is
  'Nombre de la plantilla de confirmación (pago_recibido, remesa_liquidada…). Null en los códigos de entrega.';

create unique index if not exists at_message_outbox_aviso_unico
  on public.at_message_outbox (plantilla, ref_key, channel)
  where plantilla is not null and ref_key is not null;

-- ── Pesos con puntos de miles, sin depender del locale de la base ──────────
create or replace function public.at_sms_pesos(p_monto numeric)
returns text
language sql immutable
as $$ select '$' || replace(to_char(round(coalesce(p_monto,0)), 'FM999,999,999,999'), ',', '.') $$;

-- ── La única puerta para encolar un aviso ──────────────────────────────────
-- Sin teléfono no se encola nada: una fila «fallida por falta de teléfono» por
-- cada aviso sería ruido en la bandeja del operario.
create or replace function public.at_sms_encolar(
  p_plantilla text,
  p_ref_key   text,
  p_telefono  text,
  p_cuerpo    text,
  p_guide_id  uuid default null,
  p_intent_id uuid default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if coalesce(trim(p_telefono),'') = '' then
    return false;
  end if;

  insert into public.at_message_outbox
    (guide_id, intent_id, to_phone, channel, body, plantilla, ref_key, status)
  values
    (p_guide_id, p_intent_id, trim(p_telefono), 'sms', p_cuerpo, p_plantilla, p_ref_key, 'pendiente')
  on conflict (plantilla, ref_key, channel) where plantilla is not null and ref_key is not null
  do nothing;

  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke execute on function public.at_sms_encolar(text, text, text, text, uuid, uuid) from public, anon, authenticated;

-- ── Guía: entregada (+ pago recibido si fue contraentrega) o intento fallido ─
create or replace function public.at_guides_sms_estado_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_intent uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'entregada' then
    perform public.at_sms_encolar(
      'guia_entregada', new.id::text, new.recipient_phone,
      'A Tiempo: tu pedido ' || new.guide_number || ' fue entregado. Ref ' || new.guide_number,
      new.id, null);

    if new.is_cod and coalesce(new.cod_amount,0) > 0 then
      v_intent := public.at_solv_uuid('intent:guia:' || new.id::text);
      perform public.at_sms_encolar(
        'pago_recibido', new.id::text, new.recipient_phone,
        'A Tiempo: recibimos tu pago de ' || public.at_sms_pesos(new.cod_amount)
          || ' del pedido ' || new.guide_number || '. Ref ' || left(v_intent::text, 8),
        new.id, v_intent);
    end if;

  elsif new.status in ('novedad','reprogramada','en_devolucion') then
    -- Una falla puede pasar por varios estados seguidos: la llave por número de
    -- intento deja un solo aviso por intento.
    perform public.at_sms_encolar(
      'intento_fallido', new.id::text || ':' || new.delivery_attempts::text, new.recipient_phone,
      'A Tiempo: no pudimos entregar tu pedido ' || new.guide_number
        || ' (intento ' || greatest(new.delivery_attempts,1)::text
        || '). Te contactamos. Ref ' || new.guide_number,
      new.id, null);
  end if;

  return new;
end $$;

revoke execute on function public.at_guides_sms_estado_fn() from public, anon, authenticated;

drop trigger if exists at_guides_sms_estado on public.at_guides;
create trigger at_guides_sms_estado
  after update of status on public.at_guides
  for each row execute function public.at_guides_sms_estado_fn();

-- ── Remesa liquidada: al comercio, por el teléfono de su ficha ─────────────
create or replace function public.at_remesas_sms_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tel    text;
  v_intent uuid;
begin
  if new.status = 'pagada' and old.status is distinct from 'pagada' then
    select phone into v_tel from public.at_clients where id = new.client_id;
    v_intent := public.at_solv_uuid('intent:remesa:' || new.id::text);
    perform public.at_sms_encolar(
      'remesa_liquidada', new.id::text, v_tel,
      'A Tiempo: liquidamos tu remesa ' || new.remittance_number
        || ' por ' || public.at_sms_pesos(new.net_amount) || '. Ref ' || left(v_intent::text, 8),
      null, v_intent);
  end if;
  return new;
end $$;

revoke execute on function public.at_remesas_sms_fn() from public, anon, authenticated;

drop trigger if exists at_remesas_sms on public.at_cod_remittances;
create trigger at_remesas_sms
  after update of status on public.at_cod_remittances
  for each row execute function public.at_remesas_sms_fn();

-- ── Pago enviado: lo confirma el orquestador cuando la plata ya llegó ──────
-- A diferencia de «remesa liquidada» (YAM marcó el giro), este aviso es la
-- confirmación de que el pago de salida se COMPLETÓ en la red de pagos. El
-- orquestador lo llama al recibir outgoing_payment.completed. Resuelve el
-- teléfono del receptor desde el alias de la propia intención.
create or replace function public.at_solv_confirmar_pago_enviado(p_intent_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_int   jsonb;
  v_alias text;
  v_id    uuid;
  v_tel   text;
begin
  select intencion into v_int
  from public.at_solv_eventos
  where intent_id = p_intent_id and tipo_evento like '%payment.completed'
  order by created_at limit 1;

  if v_int is null then
    raise exception 'No hay intención con id %', p_intent_id;
  end if;

  v_alias := v_int->>'receptor_wallet';
  begin
    v_id := nullif(split_part(v_alias, ':', 3), '')::uuid;
  exception when others then
    return false;
  end;

  if v_alias like 'yam:comercio:%' then
    select phone into v_tel from public.at_clients where id = v_id;
  elsif v_alias like 'yam:mensajero:%' then
    select phone into v_tel from public.at_profiles where id = v_id;
  else
    return false;
  end if;

  return public.at_sms_encolar(
    'pago_enviado', p_intent_id::text, v_tel,
    'A Tiempo: te enviamos un pago de '
      || public.at_sms_pesos((v_int->>'monto')::numeric / 100)
      || '. Ref ' || left(p_intent_id::text, 8),
    null, p_intent_id);
end $$;

revoke execute on function public.at_solv_confirmar_pago_enviado(uuid) from public, anon, authenticated;
grant execute on function public.at_solv_confirmar_pago_enviado(uuid) to service_role;

notify pgrst, 'reload schema';
