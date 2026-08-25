-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIR LA MISMA RECOGIDA DOS VECES DEVUELVE LA MISMA, NO DOS
--
-- Segunda mitad de la 0098. Allí se creó la columna; aquí se usa.
--
-- Si la llamada trae un identificador de petición y ya existe una recogida con
-- ese identificador, se devuelve ESA en vez de crear otra. Para el teléfono el
-- resultado es idéntico —recibe la recogida— pero el comercio no acaba con dos
-- solicitudes para el mismo día porque la señal se cayó en el momento justo.
--
-- Se borra antes la versión de ocho argumentos: dejar las dos haría ambigua
-- cualquier llamada que no nombre todos los parámetros.
--
-- El resto del cuerpo es idéntico al que había. Se repite entero porque
-- create or replace reemplaza la función completa: lo que no se reescriba, se
-- pierde.
--
-- Verificado al aplicarlo: dos llamadas con el mismo identificador devuelven la
-- misma recogida y en la tabla queda UNA.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.at_request_pickup(uuid, date, time, text, text, text, text, uuid[]);

create or replace function public.at_request_pickup(
  p_client_id uuid default null,
  p_scheduled_date date default null,
  p_scheduled_time time without time zone default null,
  p_address text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_guide_ids uuid[] default '{}'::uuid[],
  p_request_id uuid default null
)
returns at_pickups
language plpgsql
security definer
set search_path to 'public'
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_client uuid;
  v_pickup public.at_pickups;
  v_address text;
  v_site uuid;
  v_ajenas int;
  v_num text;
  v_saldo numeric;
begin
  if v_role is null or v_role in ('pendiente','mensajero') then
    raise exception 'No autorizado';
  end if;

  -- Lo primero: si esta petición ya se atendió, devolver lo que se creó
  -- entonces. Sin esto, un reintento tras perderse la respuesta crea otra.
  if p_request_id is not null then
    select * into v_pickup from public.at_pickups where client_request_id = p_request_id;
    if found then
      return v_pickup;
    end if;
  end if;

  perform public.at_valida_hora_recogida(p_scheduled_time);

  if v_role in ('cliente','asesor') then
    v_client := public.at_my_client();
    if v_client is null then
      raise exception 'Tu cuenta todavía no tiene comercio';
    end if;

    select i.invoice_number,
           i.total - coalesce((
             select sum(p.amount) from public.at_invoice_payments p
             where p.invoice_id = i.id and p.status = 'verificado'), 0)
      into v_num, v_saldo
    from public.at_invoices i
    where i.client_id = v_client
      and i.status in ('borrador','emitida')
      and i.created_at < now() - (case when i.tipo = 'plataforma'
                                       then public.at_ciclo_cobro_plataforma()
                                       else public.at_ciclo_cobro() end)
      and i.total - coalesce((
            select sum(p.amount) from public.at_invoice_payments p
            where p.invoice_id = i.id and p.status = 'verificado'), 0) > 0
    order by i.created_at
    limit 1;

    if v_num is not null then
      raise exception 'Tienes la factura % sin pagar (%). Reporta el pago y, apenas lo verifiquemos, puedes volver a solicitar recogidas.',
        v_num, to_char(v_saldo, 'FM$999G999G999');
    end if;

    v_site := coalesce(
      (select p.site_id from public.at_profiles p where p.id = auth.uid()),
      (select s.id from public.at_client_sites s
        where s.client_id = v_client and s.es_principal and s.active limit 1));
  else
    v_client := p_client_id;
    if v_client is null then
      raise exception 'Selecciona el comercio que solicita la recogida';
    end if;
    if not exists (select 1 from public.at_clients where id = v_client) then
      raise exception 'El comercio indicado no existe';
    end if;
    v_site := (select s.id from public.at_client_sites s
               where s.client_id = v_client and s.es_principal and s.active limit 1);
  end if;

  select count(*) into v_ajenas
  from public.at_guides g
  where g.id = any(p_guide_ids) and g.client_id is distinct from v_client;
  if v_ajenas > 0 then
    raise exception 'Hay % pedido(s) que no pertenecen a ese comercio', v_ajenas;
  end if;

  v_address := coalesce(
    nullif(trim(p_address), ''),
    (select nullif(trim(s.address), '') from public.at_client_sites s where s.id = v_site),
    (select nullif(trim(address), '') from public.at_clients where id = v_client)
  );
  if v_address is null then
    raise exception 'Indica la dirección donde debemos recoger';
  end if;

  update public.at_clients set address = v_address
  where id = v_client and coalesce(trim(address), '') = '';

  insert into public.at_pickups
    (client_id, site_id, scheduled_date, scheduled_time, address, contact_name, contact_phone, notes, status, created_by, client_request_id)
  values
    (v_client, v_site, coalesce(p_scheduled_date, current_date), p_scheduled_time, v_address,
     nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''),
     nullif(trim(p_notes), ''), 'pendiente', auth.uid(), p_request_id)
  returning * into v_pickup;

  update public.at_guides g set pickup_id = v_pickup.id
  where g.id = any(p_guide_ids) and g.client_id = v_client
    and g.status = 'creada' and g.pickup_id is null;

  return v_pickup;
end $function$;

revoke execute on function public.at_request_pickup(uuid, date, time, text, text, text, text, uuid[], uuid) from public, anon;
grant execute on function public.at_request_pickup(uuid, date, time, text, text, text, text, uuid[], uuid) to authenticated;
