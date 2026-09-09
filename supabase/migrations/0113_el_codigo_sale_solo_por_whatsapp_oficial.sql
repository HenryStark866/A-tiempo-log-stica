-- ═══════════════════════════════════════════════════════════════════════════
-- EL CÓDIGO DE ENTREGA SALE SOLO, POR LA API OFICIAL DE WHATSAPP
--
-- Hasta hoy el código se generaba bien y se encolaba en at_message_outbox, pero
-- NUNCA salía solo: el único canal automático cableado era el puente OpenWA,
-- que necesita un servidor propio que nunca tuvo dónde vivir
-- (docs/LO-QUE-FALTA.md). El envío real era un clic manual en la pantalla de
-- Códigos (migración 0040), operario por operario.
--
-- Ahora el canal `whatsapp` del buzón puede salir por la **Cloud API de Meta**:
-- una llamada HTTPS desde la edge function `enviar-mensajes`, sin servidor
-- intermedio. Es la que sí escala y la que no arriesga el bloqueo del número.
--
-- Meta exige una plantilla aprobada para escribir primero, y una plantilla se
-- rellena con PARÁMETROS, no con un texto ya montado. Por eso esta migración
-- añade `template_params`: el número de pedido y el código, separados, tal como
-- los pide la plantilla `codigo_entrega` (ver docs/whatsapp-cloud-api.md).
--
-- El `body` de texto se queda: lo siguen usando el SMS por Twilio, el botón
-- manual de WhatsApp (0040) y la bandeja de mensajes fallidos que lee el
-- operario. Solo la fila de WhatsApp lleva parámetros.
--
-- ── Lo que se enciende solo cuando esto funcione ──────────────────────────
-- La migración 0022 ya dejó la regla lista: el código se EXIGE al confirmar la
-- entrega solo cuando hay un mensaje en estado 'enviado' para esa guía. Hoy no
-- hay ninguno, así que el mensajero no se traba. En cuanto la Cloud API empiece
-- a mandar, la exigencia se activa sola, guía por guía, sin desplegar de nuevo.
--
-- ── Aceptado a sabiendas ──────────────────────────────────────────────────
-- Una plantilla de utilidad a Colombia cuesta del orden de US$0,01 por mensaje.
-- Al volumen de hoy —decenas al mes— son centavos, y menos que el minuto de un
-- operario abriendo WhatsApp a mano. El comentario de la 0040 («ningún
-- proveedor manda el primer mensaje gratis») sigue siendo cierto en el céntimo,
-- pero el coste real que frenaba esto era el servidor del puente, no el mensaje.
-- El puente OpenWA se queda en el código como respaldo por si algún día se
-- monta: si está configurado y la Cloud API no, sale por ahí.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_message_outbox
  add column if not exists template_params jsonb;

comment on column public.at_message_outbox.template_params is
  'Parámetros de la plantilla de WhatsApp Cloud API: {pedido, codigo}. Null en las filas de SMS, que se mandan con el texto de body.';

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

  -- Si ya tiene código vigente no se toca: reemitirlo dejaría al comprador con
  -- un código viejo en el celular y la entrega se caería en la puerta.
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
      -- Solo la fila de WhatsApp lleva parámetros: es la que sale por plantilla.
      case when v_ch = 'whatsapp'
           then jsonb_build_object('pedido', v_guide.guide_number, 'codigo', v_code)
           end,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'fallido' else 'pendiente' end::public.at_msg_status,
      -- Este texto lo lee el operario en la bandeja de fallidos, no el comprador.
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'El pedido no tiene teléfono del destinatario' end
    );
  end loop;
end $function$;

revoke execute on function public.at_issue_delivery_code(uuid) from public, anon, authenticated;
