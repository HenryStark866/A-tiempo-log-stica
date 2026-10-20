-- ═══════════════════════════════════════════════════════════════════════════
-- EL SMS CON EL CÓDIGO DE ENTREGA, EN UN SOLO SEGMENTO
--
-- «Guía recogida con código» del contrato YAM↔SolV. El texto de la 0126 lleva
-- «ó», «í» y «·», que sacan el SMS del alfabeto GSM-7: pasa a UCS-2 (70
-- caracteres por segmento) y el aviso viaja en dos mensajes. Aquí el SMS sale
-- en ASCII y corto; WhatsApp y correo conservan el texto de siempre. Todo lo
-- demás es idéntico a la 0126. La fila lleva guide_id, la referencia del
-- contrato.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_issue_delivery_code(p_guide_id uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide public.at_guides;
  v_code  text;
  v_body  text;
  v_sms   text;
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

  v_sms := 'A Tiempo: codigo de entrega ' || v_code || ' del pedido '
    || v_guide.guide_number || '. Dalo solo cuando tengas tu pedido en las manos.';

  foreach v_ch in array array['sms','whatsapp']::public.at_msg_channel[] loop
    insert into public.at_message_outbox
      (guide_id, to_phone, channel, body, template_params, status, error)
    values (
      p_guide_id, v_guide.recipient_phone, v_ch,
      case when v_ch = 'sms' then v_sms else v_body end,
      case when v_ch = 'whatsapp'
           then jsonb_build_object('pedido', v_guide.guide_number, 'codigo', v_code)
           end,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'fallido' else 'pendiente' end::public.at_msg_status,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'El pedido no tiene teléfono del destinatario' end
    );
  end loop;

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

notify pgrst, 'reload schema';
