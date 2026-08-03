-- A TIEMPO LOGÍSTICA — mandar el código por el WhatsApp de la casa.
--
-- Ningún proveedor manda el primer mensaje gratis: ni Twilio, ni la Cloud API
-- de Meta, donde la ventana de servicio gratuita solo se abre si el cliente
-- escribe primero. Aquí siempre escribimos nosotros.
--
-- Así que el envío pasa a ser un clic: la pantalla de Códigos abre WhatsApp con
-- el chat del comprador y el mensaje ya redactado, y sale desde el número que
-- la empresa ya usa. Cuesta cero y le llega igual.
--
-- El código está en at_delivery_codes como hash bcrypt y no se puede
-- recuperar; el texto en claro solo existe en el cuerpo que quedó encolado en
-- at_message_outbox. De ahí sale, y por eso hay que pedirlo de a una guía y no
-- en el listado: que ver un código sea un acto deliberado, no algo que pasa
-- por tener la pantalla abierta.
--
-- Al mensajero no se le da acceso a ninguna de las dos funciones. Es el único
-- que no puede ver el código: su trabajo es pedírselo a quien recibe.

create or replace function public.at_delivery_code_whatsapp(p_guide_id uuid)
returns json
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_msg  record;
begin
  if v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  -- El de WhatsApp primero: es el canal por el que se va a mandar. Si solo
  -- quedara el de SMS sirve igual, porque el cuerpo es el mismo texto.
  select o.id, o.to_phone, o.body
    into v_msg
    from public.at_message_outbox o
   where o.guide_id = p_guide_id
     and o.status = 'pendiente'
   order by (o.channel = 'whatsapp') desc, o.created_at desc
   limit 1;

  if v_msg.id is null then
    raise exception 'No hay ningún código en cola para esta guía. Usa Reenviar para generar uno nuevo.';
  end if;

  if v_msg.to_phone is null or btrim(v_msg.to_phone) = '' then
    raise exception 'La guía no tiene teléfono del destinatario. Pídeselo al comercio y edita la guía.';
  end if;

  return json_build_object(
    'message_id', v_msg.id,
    'phone', v_msg.to_phone,
    'body', v_msg.body
  );
end $function$;

-- Confirmar que salió va aparte, y a propósito.
--
-- Marcarlo al abrir WhatsApp sería mentir: quedaría como enviado aunque quien
-- lo abrió cerrara la ventana sin mandar nada. Y esa mentira no es gratis,
-- porque en cuanto un mensaje figura como enviado el código pasa a ser
-- exigible (ver 0022) y el mensajero se queda en la puerta pidiendo algo que
-- el comprador nunca recibió.
create or replace function public.at_delivery_code_marcar_enviado(p_message_id uuid)
returns void
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  v_role public.at_role := public.at_my_role();
begin
  if v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  update public.at_message_outbox
     set status = 'enviado',
         sent_at = now(),
         attempts = attempts + 1,
         provider_id = 'whatsapp-manual',
         error = null
   where id = p_message_id
     and status = 'pendiente';

  if not found then
    raise exception 'Ese mensaje ya no estaba en cola';
  end if;
end $function$;

revoke all on function public.at_delivery_code_whatsapp(uuid) from public, anon;
revoke all on function public.at_delivery_code_marcar_enviado(uuid) from public, anon;
grant execute on function public.at_delivery_code_whatsapp(uuid) to authenticated;
grant execute on function public.at_delivery_code_marcar_enviado(uuid) to authenticated;
