-- A TIEMPO LOGÍSTICA — el código se exige solo si el comprador lo recibió.
--
-- PROBLEMA: 0021 dejó la regla en "sin código no hay entrega", pero el envío
-- todavía no tiene proveedor conectado. Tal como quedó, el comprador nunca
-- recibe nada y el mensajero queda trabado en la puerta: cada entrega habría
-- que destrabarla a mano desde coordinación.
--
-- REGLA: exigir el código solo cuando la app logró mandarlo de verdad, o sea
-- cuando hay al menos un mensaje en estado 'enviado' para esa guía. Hoy, sin
-- proveedor, nada se traba; el día que se conecte, la exigencia se activa
-- sola guía por guía, sin tocar código ni desplegar de nuevo.
--
-- Ojo con lo que NO se relaja: si el mensajero escribe un código, tiene que
-- ser el correcto. Que el comprador no lo haya recibido no vuelve válido un
-- número inventado.

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
  v_guide   public.at_guides;
  v_role    public.at_role := public.at_my_role();
  v_code    public.at_delivery_codes;
  v_nota    text := p_note;
  v_llego   boolean;
  v_escrito text := nullif(trim(coalesce(p_delivery_code, '')), '');
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
    -- ¿El comprador tuvo forma de enterarse del código?
    select exists (
      select 1 from public.at_message_outbox
      where guide_id = p_guide_id and status = 'enviado'
    ) into v_llego;

    if v_code.locked then
      raise exception 'El código se bloqueó por demasiados intentos. Un coordinador debe reenviarlo.';
    end if;

    if v_escrito is not null then
      -- Escribió algo: tiene que ser el correcto, haya llegado o no. Un código
      -- inventado no se acepta solo porque el envío esté sin conectar.
      if extensions.crypt(v_escrito, v_code.code_hash) = v_code.code_hash then
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

    elsif v_llego then
      -- Llegó y no lo escribió: aquí sí se exige.
      if v_role = 'mensajero' then
        raise exception 'Pídele al comprador el código de 6 dígitos de su paquete';
      end if;
      v_nota := coalesce(v_nota || ' · ', '') || 'Entregada SIN código, autorizada por coordinación';

    else
      -- Nunca salió el mensaje. No se le puede exigir al mensajero un código
      -- que el comprador jamás recibió, pero queda dicho en el historial para
      -- que la entrega no aparente una prueba que no tuvo.
      v_nota := coalesce(v_nota || ' · ', '')
             || 'Entregada sin código: el mensaje nunca se le pudo enviar al comprador';
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
