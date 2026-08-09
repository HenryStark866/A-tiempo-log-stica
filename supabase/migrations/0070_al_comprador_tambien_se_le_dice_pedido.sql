-- A TIEMPO LOGÍSTICA — al comprador también se le habla de «pedido».
--
-- En la app y en el rastreo la palabra pasó de «guía» a «pedido», porque es la
-- que entiende quien compró algo. Pero el mensaje que le llega al celular
-- seguía diciendo:
--
--     «…No lo compartas hasta tener tu pedido en manos. Guía ATL-100011…»
--
-- O sea que en la misma frase le decíamos las dos cosas, y después abría el
-- enlace y encontraba una tercera pantalla que ya decía «Pedido». Quien recibe
-- un paquete no tiene por qué saber que «guía» y «pedido» son lo mismo aquí.
--
-- El NÚMERO no cambia: sigue siendo ATL-100011, el mismo que va impreso en el
-- rótulo y con el que rastrea. Lo único que cambia es cómo lo llamamos.
--
-- Los mensajes ya encolados se quedan como están: ya se enviaron o están por
-- salir, y reescribir un texto que alguien ya leyó no arregla nada.

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
    insert into public.at_message_outbox (guide_id, to_phone, channel, body, status, error)
    values (
      p_guide_id, v_guide.recipient_phone, v_ch, v_body,
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'fallido' else 'pendiente' end::public.at_msg_status,
      -- Este texto lo lee el operario en la bandeja de mensajes fallidos, no
      -- el comprador. Ahí «pedido» también es lo que se ve en pantalla.
      case when coalesce(trim(v_guide.recipient_phone),'') = ''
           then 'El pedido no tiene teléfono del destinatario' end
    );
  end loop;
end $function$;
