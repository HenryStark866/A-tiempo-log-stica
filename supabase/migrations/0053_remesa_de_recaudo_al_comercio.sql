-- A TIEMPO LOGÍSTICA — devolverle al comercio la plata que recaudamos por él.
--
-- EL HUECO QUE CIERRA: la plata del contraentrega tenía un solo tramo
-- modelado —mensajero → ATL, en at_settlements— y ahí se acababa. Lo que ATL
-- le debe al comercio por lo recaudado en su nombre no existía en ninguna
-- parte: se cuadraba por fuera del sistema. Con el COD que incluye flete esa
-- cuenta se volvió obligatoria, porque ahora hay una parte del recaudo que sí
-- es nuestra y otra que no.
--
-- CÓMO SE ARMA UNA REMESA
--   recaudo bruto            todo lo que el comprador pagó
--   − flete cobrado al comprador   lo que ya es nuestro (COD con flete)
--   = disponible del comercio
--   − cruce contra sus facturas    su deuda de fletes, saldada con su plata
--   = neto a girar
--
-- El cruce es la decisión de negocio de Henry: un solo movimiento en vez de
-- dos giros cruzados, y de paso el comercio nunca se bloquea por las 48 h,
-- porque su factura se paga sola con lo que ya le debíamos.
--
-- REGLA QUE NO SE NEGOCIA: solo entra a la remesa el recaudo que el mensajero
-- YA consignó y que quedó conciliado (at_settlements.status = 'conciliado').
-- Girar plata que todavía no hemos recibido sería prestarla sin saberlo.

alter table public.at_guides
  add column if not exists remittance_id uuid;

create table if not exists public.at_cod_remittances (
  id             uuid primary key default gen_random_uuid(),
  remittance_number text not null unique default ('REM-' || nextval('public.at_guide_number_seq')::text),
  client_id      uuid not null references public.at_clients(id) on delete restrict,
  period_start   date not null,
  period_end     date not null,
  guide_count    int not null default 0,
  -- Todo lo que el comprador pagó, sin tocar.
  gross_amount   numeric(14,2) not null default 0,
  -- La parte del recaudo que es nuestra: el domicilio que iba dentro del COD.
  shipping_kept  numeric(14,2) not null default 0,
  -- Lo que se le abonó a sus facturas pendientes con este mismo recaudo.
  invoice_offset numeric(14,2) not null default 0,
  -- Lo que efectivamente se le gira.
  net_amount     numeric(14,2) not null default 0,
  status         text not null default 'pendiente' check (status in ('pendiente','pagada')),
  method         text,
  reference      text,
  receipt_path   text,
  paid_at        timestamptz,
  paid_by        uuid references public.at_profiles(id) on delete set null,
  created_by     uuid references public.at_profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (period_end >= period_start)
);

comment on table public.at_cod_remittances is
  'Lo que ATL le devuelve al comercio del contraentrega recaudado en su nombre. No confundir con at_settlements (mensajero → ATL) ni con at_invoices (comercio → ATL por fletes).';

create index if not exists at_cod_remittances_client_idx
  on public.at_cod_remittances (client_id, status);

alter table public.at_cod_remittances enable row level security;

drop policy if exists "ops o comercio dueño lee remesas" on public.at_cod_remittances;
create policy "ops o comercio dueño lee remesas" on public.at_cod_remittances
  for select to authenticated
  using (public.at_is_ops() or client_id = public.at_my_client());

-- ── Qué hay listo para girar ──────────────────────────────────────────────
-- Se consulta antes de generar, para que el admin vea de dónde sale cada
-- cifra en vez de un total suelto que hay que creer.
create or replace function public.at_recaudo_por_girar(p_client_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'guias',          count(*),
    'bruto',          coalesce(sum(g.cod_amount), 0),
    'flete_nuestro',  coalesce(sum(case when g.cod_includes_shipping
                                        then coalesce(g.shipping_fee,0) else 0 end), 0),
    'disponible',     coalesce(sum(g.cod_amount), 0)
                      - coalesce(sum(case when g.cod_includes_shipping
                                          then coalesce(g.shipping_fee,0) else 0 end), 0),
    -- El saldo se calcula por factura y luego se suma: hacerlo al revés
    -- mezcla el agregado con la referencia a cada fila y Postgres lo rechaza.
    'deuda_fletes',   coalesce((
      select sum(x.saldo) from (
        select i.total - coalesce((
          select sum(p.amount) from public.at_invoice_payments p
          where p.invoice_id = i.id and p.status = 'verificado'), 0) as saldo
        from public.at_invoices i
        where i.client_id = p_client_id and i.status in ('borrador','emitida')
      ) x
    ), 0)
  )
  from public.at_guides g
  join public.at_settlements s on s.id = g.settlement_id
  where g.client_id = p_client_id
    and g.is_cod and g.status = 'entregada'
    and g.remittance_id is null
    and s.status = 'conciliado'
$$;

revoke execute on function public.at_recaudo_por_girar(uuid) from public, anon;
grant execute on function public.at_recaudo_por_girar(uuid) to authenticated;

-- ── Generar la remesa ─────────────────────────────────────────────────────
create or replace function public.at_generate_cod_remittance(
  p_client_id    uuid,
  p_period_start date default null,
  p_period_end   date default null
)
returns public.at_cod_remittances
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $$
declare
  v_rem        public.at_cod_remittances;
  v_bruto      numeric(14,2) := 0;
  v_flete      numeric(14,2) := 0;
  v_disponible numeric(14,2) := 0;
  v_aplicado   numeric(14,2) := 0;
  v_conteo     int := 0;
  v_desde      date;
  v_hasta      date;
  v_inv        record;
  v_saldo      numeric(14,2);
  v_abono      numeric(14,2);
begin
  if not public.at_is_ops() then
    raise exception 'Solo administración gira el recaudo a los comercios';
  end if;

  -- Solo lo que ya nos entró de verdad: recaudo entregado, con cierre de caja
  -- del mensajero conciliado, y que no se haya girado antes.
  select count(*),
         coalesce(sum(g.cod_amount), 0),
         coalesce(sum(case when g.cod_includes_shipping then coalesce(g.shipping_fee,0) else 0 end), 0),
         min(g.delivered_at::date), max(g.delivered_at::date)
    into v_conteo, v_bruto, v_flete, v_desde, v_hasta
  from public.at_guides g
  join public.at_settlements s on s.id = g.settlement_id
  where g.client_id = p_client_id
    and g.is_cod and g.status = 'entregada'
    and g.remittance_id is null
    and s.status = 'conciliado'
    and (p_period_start is null or g.delivered_at::date >= p_period_start)
    and (p_period_end   is null or g.delivered_at::date <= p_period_end);

  if v_conteo = 0 then
    raise exception 'No hay recaudo conciliado pendiente de girar para este comercio';
  end if;

  v_disponible := v_bruto - v_flete;

  insert into public.at_cod_remittances
    (client_id, period_start, period_end, guide_count, gross_amount, shipping_kept, created_by)
  values
    (p_client_id, coalesce(p_period_start, v_desde), coalesce(p_period_end, v_hasta),
     v_conteo, v_bruto, v_flete, auth.uid())
  returning * into v_rem;

  update public.at_guides g
  set remittance_id = v_rem.id
  where g.client_id = p_client_id
    and g.is_cod and g.status = 'entregada'
    and g.remittance_id is null
    and g.settlement_id in (select id from public.at_settlements where status = 'conciliado')
    and (p_period_start is null or g.delivered_at::date >= p_period_start)
    and (p_period_end   is null or g.delivered_at::date <= p_period_end);

  -- ── El cruce ────────────────────────────────────────────────────────────
  -- Su deuda de fletes se paga con su propia plata, de la factura más vieja a
  -- la más nueva. Cada abono queda como un pago VERIFICADO de verdad, con su
  -- referencia a esta remesa: así el cruce se audita igual que un pago en
  -- banco y no como un ajuste silencioso.
  for v_inv in
    select i.id, i.invoice_number, i.total,
           i.total - coalesce((
             select sum(p.amount) from public.at_invoice_payments p
             where p.invoice_id = i.id and p.status = 'verificado'), 0) as saldo
    from public.at_invoices i
    where i.client_id = p_client_id and i.status in ('borrador','emitida')
    order by i.created_at
  loop
    exit when v_disponible - v_aplicado <= 0;
    v_saldo := v_inv.saldo;
    continue when v_saldo <= 0;

    v_abono := least(v_saldo, v_disponible - v_aplicado);

    insert into public.at_invoice_payments
      (invoice_id, amount, method, reference, status, verified_by, verified_at, review_notes)
    values
      (v_inv.id, v_abono, 'Cruce con recaudo', v_rem.remittance_number,
       'verificado', auth.uid(), now(),
       'Descontado del recaudo contraentrega girado en ' || v_rem.remittance_number);

    if v_abono >= v_saldo then
      update public.at_invoices set status = 'pagada', paid_at = now() where id = v_inv.id;
    end if;

    v_aplicado := v_aplicado + v_abono;
  end loop;

  update public.at_cod_remittances set
    invoice_offset = v_aplicado,
    net_amount     = v_disponible - v_aplicado
  where id = v_rem.id
  returning * into v_rem;

  insert into public.at_notifications (user_id, title, body, link)
  select p.id, 'Tu recaudo está listo',
         'Recaudamos ' || to_char(v_bruto, 'FM$999G999G999') || ' de ' || v_conteo || ' entrega(s).'
         || case when v_aplicado > 0
                 then ' Abonamos ' || to_char(v_aplicado, 'FM$999G999G999') || ' a tus fletes pendientes.'
                 else '' end
         || ' Te giramos ' || to_char(v_disponible - v_aplicado, 'FM$999G999G999') || '.',
         '/facturacion'
  from public.at_profiles p
  where p.client_id = p_client_id and p.active;

  return v_rem;
end $$;

revoke execute on function public.at_generate_cod_remittance(uuid, date, date) from public, anon;
grant execute on function public.at_generate_cod_remittance(uuid, date, date) to authenticated;

-- ── Marcar la remesa como girada ──────────────────────────────────────────
create or replace function public.at_pay_cod_remittance(
  p_remittance_id uuid,
  p_reference     text default null,
  p_method        text default null,
  p_receipt_path  text default null
)
returns public.at_cod_remittances
language plpgsql security definer set search_path = public
as $$
declare v_out public.at_cod_remittances;
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;

  update public.at_cod_remittances set
    status       = 'pagada',
    paid_at      = now(),
    paid_by      = auth.uid(),
    reference    = nullif(trim(p_reference), ''),
    method       = nullif(trim(p_method), ''),
    receipt_path = nullif(trim(p_receipt_path), '')
  where id = p_remittance_id and status = 'pendiente'
  returning * into v_out;

  if not found then raise exception 'Esa remesa no existe o ya fue girada'; end if;

  insert into public.at_notifications (user_id, title, body, link)
  select p.id, 'Recaudo girado',
         'Te giramos ' || to_char(v_out.net_amount, 'FM$999G999G999')
         || ' (' || v_out.remittance_number || ')'
         || case when v_out.reference is not null then ' · Ref: ' || v_out.reference else '' end,
         '/facturacion'
  from public.at_profiles p
  where p.client_id = v_out.client_id and p.active;

  return v_out;
end $$;

revoke execute on function public.at_pay_cod_remittance(uuid, text, text, text) from public, anon;
grant execute on function public.at_pay_cod_remittance(uuid, text, text, text) to authenticated;
