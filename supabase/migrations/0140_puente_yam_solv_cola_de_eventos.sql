-- ═══════════════════════════════════════════════════════════════════════════
-- PUENTE YAM → SolV: LA COLA DE EVENTOS DE PAGO
--
-- Contrato: SolV/CONTRATO-INTEGRACION.md. Cuando en YAM pasa algo que mueve
-- plata —se cobra un contraentrega, se concilia el cierre de caja de un
-- mensajero, se gira una remesa al comercio— la base deja UNA fila en
-- at_solv_eventos con la Intención de Pago y el evento que el libro de SolV
-- acepta. Un servicio aparte (el orquestador de Open Payments) las toma con
-- at_solv_tomar_eventos() y las entrega; YAM no habla con SolV directamente.
--
-- ── Por qué una cola y no una llamada ─────────────────────────────────────
-- Igual que el buzón de mensajes: si el libro o el orquestador están caídos,
-- el CEDI sigue entregando y el evento espera. Nunca al revés.
--
-- ── Idempotencia ──────────────────────────────────────────────────────────
-- (origen, ref_id, tipo_evento) es único: reintentar el trigger, o volver a
-- marcar una remesa como pagada, no duplica el asiento. event_id es lo que
-- SolV usa para ignorar repetidos; aquí es determinista (uuid v5 sobre esa
-- clave) para que dos réplicas de la base den el mismo.
-- Un mismo origen+ref comparte intent_id entre sus eventos.
--
-- ── Montos ────────────────────────────────────────────────────────────────
-- YAM guarda numeric(14,2) en pesos. El contrato pide entero en unidades
-- mínimas como texto: COP con asset_scale 2 → pesos × 100.
--
-- ── Wallets ───────────────────────────────────────────────────────────────
-- YAM no conoce wallets. Manda alias estables (yam:comercio:<uuid>,
-- yam:mensajero:<uuid>, yam:comprador:<guia_uuid>, yam:cedi) y el
-- orquestador los resuelve con solv.resolver_alias().
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.at_solv_eventos (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null unique,
  intent_id     uuid not null,
  tipo_evento   text not null check (tipo_evento in (
    'incoming_payment.completed','outgoing_payment.completed','outgoing_payment.failed',
    'voucher.issued','voucher.redeemed','cash.received_by_agent','fee.charged')),
  origen        text not null check (origen in ('guia','cierre_caja','remesa')),
  ref_id        uuid not null,
  intencion     jsonb not null,   -- Intención de Pago (forma del contrato)
  evento        jsonb not null,   -- cuerpo del webhook { event_id, tipo, intent_id, monto, … }
  status        text not null default 'pendiente'
                check (status in ('pendiente','enviando','enviado','fallido')),
  attempts      int not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  taken_at      timestamptz,
  sent_at       timestamptz,
  unique (origen, ref_id, tipo_evento)
);

comment on table public.at_solv_eventos is
  'Cola YAM → SolV/orquestador (contrato de integración). Solo la leen ops y el servicio; se consume con at_solv_tomar_eventos().';

create index if not exists at_solv_eventos_pendientes_idx
  on public.at_solv_eventos (created_at) where status in ('pendiente','enviando');
create index if not exists at_solv_eventos_intent_idx on public.at_solv_eventos (intent_id);

alter table public.at_solv_eventos enable row level security;

drop policy if exists "ops ve la cola de solv" on public.at_solv_eventos;
create policy "ops ve la cola de solv" on public.at_solv_eventos
  for select to authenticated
  using ((select public.at_is_ops()));

revoke all on public.at_solv_eventos from anon, authenticated;
grant select on public.at_solv_eventos to authenticated;

-- ── Utilidades ─────────────────────────────────────────────────────────────
-- uuid determinista (md5 del nombre) para que el event_id sea reproducible.
create or replace function public.at_solv_uuid(p_nombre text)
returns uuid
language sql immutable
as $$ select md5('yam-solv:' || p_nombre)::uuid $$;

create or replace function public.at_solv_minimas(p_pesos numeric)
returns text
language sql immutable
as $$ select round(coalesce(p_pesos,0) * 100)::bigint::text $$;

-- ── Encolar (una sola puerta) ──────────────────────────────────────────────
create or replace function public.at_solv_encolar(
  p_origen     text,
  p_ref_id     uuid,
  p_tipo_evento text,
  p_tipo_intencion text,
  p_pagador    text,
  p_receptor   text,
  p_pesos      numeric,
  p_canal      text,
  p_ref_yam    jsonb,
  p_datos      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_clave   text := p_origen || ':' || p_ref_id::text || ':' || p_tipo_evento;
  v_intent  uuid := public.at_solv_uuid('intent:' || p_origen || ':' || p_ref_id::text);
  v_event   uuid := public.at_solv_uuid('event:' || v_clave);
  v_ahora   timestamptz := now();
  v_monto   text := public.at_solv_minimas(p_pesos);
begin
  if p_pesos is null or p_pesos <= 0 then
    return null;  -- sin plata no hay asiento
  end if;

  insert into public.at_solv_eventos
    (event_id, intent_id, tipo_evento, origen, ref_id, intencion, evento)
  values (
    v_event, v_intent, p_tipo_evento, p_origen, p_ref_id,
    jsonb_build_object(
      'intent_id', v_intent,
      'tipo', p_tipo_intencion,
      'pagador_wallet', p_pagador,
      'receptor_wallet', p_receptor,
      'monto', v_monto,
      'asset_code', 'COP',
      'asset_scale', 2,
      'canal', p_canal,
      'ref_yam', jsonb_build_object('guia_id', null, 'factura_id', null, 'remesa_id', null) || p_ref_yam,
      'creado_en', v_ahora
    ),
    jsonb_build_object(
      'event_id', v_event,
      'tipo', p_tipo_evento,
      'intent_id', v_intent,
      'monto', v_monto,
      'asset_code', 'COP',
      'asset_scale', 2,
      'ocurrido_en', v_ahora,
      'datos', p_datos
    )
  )
  on conflict (origen, ref_id, tipo_evento) do nothing;

  return v_intent;
end $$;

revoke execute on function public.at_solv_encolar(text, uuid, text, text, text, text, numeric, text, jsonb, jsonb)
  from public, anon, authenticated;

-- ── 1. Se cobra un pedido contraentrega ────────────────────────────────────
-- AFTER UPDATE: el trigger de facturación es BEFORE y no se toca.
create or replace function public.at_guides_puente_solv_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'entregada' and old.status is distinct from 'entregada'
     and new.is_cod and coalesce(new.cod_amount,0) > 0 then
    perform public.at_solv_encolar(
      'guia', new.id, 'incoming_payment.completed', 'cobro_comercio',
      'yam:comprador:' || new.id::text,
      'yam:comercio:' || new.client_id::text,
      new.cod_amount, 'agente',
      jsonb_build_object('guia_id', new.id),
      jsonb_build_object('guide_number', new.guide_number,
                         'courier_id', new.courier_id,
                         'flete_incluido', coalesce(new.cod_includes_shipping,false),
                         'flete', coalesce(new.shipping_fee,0))
    );
  end if;
  return new;
end $$;

revoke execute on function public.at_guides_puente_solv_fn() from public, anon, authenticated;

drop trigger if exists at_guides_puente_solv on public.at_guides;
create trigger at_guides_puente_solv
  after update of status on public.at_guides
  for each row execute function public.at_guides_puente_solv_fn();

-- ── 2. Se concilia el cierre de caja de un mensajero ───────────────────────
-- El mensajero le entregó a ATL el efectivo que recaudó: cash.received_by_agent
-- con el monto consignado (lo que de verdad entró, no lo esperado).
create or replace function public.at_settlements_puente_solv_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'conciliado' and old.status is distinct from 'conciliado' then
    perform public.at_solv_encolar(
      'cierre_caja', new.id, 'cash.received_by_agent', 'liquidacion_mensajero',
      'yam:mensajero:' || new.courier_id::text,
      'yam:cedi',
      coalesce(new.deposited_amount, new.expected_amount), 'agente',
      jsonb_build_object(),
      jsonb_build_object('settlement_id', new.id,
                         'courier_id', new.courier_id,
                         'fecha', new.settlement_date,
                         'esperado', public.at_solv_minimas(new.expected_amount),
                         'banco_ref', new.bank_reference)
    );
  end if;
  return new;
end $$;

revoke execute on function public.at_settlements_puente_solv_fn() from public, anon, authenticated;

drop trigger if exists at_settlements_puente_solv on public.at_settlements;
create trigger at_settlements_puente_solv
  after update of status on public.at_settlements
  for each row execute function public.at_settlements_puente_solv_fn();

-- ── 3. Se cierra (gira) una remesa al comercio ─────────────────────────────
create or replace function public.at_remesas_puente_solv_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'pagada' and old.status is distinct from 'pagada' then
    perform public.at_solv_encolar(
      'remesa', new.id, 'outgoing_payment.completed', 'remesa',
      'yam:cedi',
      'yam:comercio:' || new.client_id::text,
      new.net_amount, 'web',
      jsonb_build_object('remesa_id', new.id),
      jsonb_build_object('remittance_number', new.remittance_number,
                         'bruto', public.at_solv_minimas(new.gross_amount),
                         'flete_retenido', public.at_solv_minimas(new.shipping_kept),
                         'cruce_facturas', public.at_solv_minimas(new.invoice_offset),
                         'referencia', new.reference)
    );
  end if;
  return new;
end $$;

revoke execute on function public.at_remesas_puente_solv_fn() from public, anon, authenticated;

drop trigger if exists at_remesas_puente_solv on public.at_cod_remittances;
create trigger at_remesas_puente_solv
  after update of status on public.at_cod_remittances
  for each row execute function public.at_remesas_puente_solv_fn();

-- ── 4. Lo que consume el orquestador (rol de servicio) ─────────────────────
-- «Tomar» marca 'enviando' con skip locked: dos orquestadores no se pisan. Lo
-- que se quedó en 'enviando' más de 5 min vuelve a ofrecerse (el consumidor se
-- cayó a medias); SolV ignora el repetido por event_id.
create or replace function public.at_solv_tomar_eventos(p_limite int default 20)
returns setof public.at_solv_eventos
language sql security definer set search_path = public
as $$
  with elegidos as (
    select id from public.at_solv_eventos
    where (status = 'pendiente' or (status = 'enviando' and taken_at < now() - interval '5 minutes'))
      and attempts < 8
    order by created_at
    limit greatest(least(coalesce(p_limite, 20), 100), 1)
    for update skip locked
  )
  update public.at_solv_eventos e
  set status = 'enviando', taken_at = now(), attempts = e.attempts + 1
  from elegidos
  where e.id = elegidos.id
  returning e.*
$$;

create or replace function public.at_solv_marcar_evento(
  p_event_id uuid, p_ok boolean, p_error text default null)
returns void
language sql security definer set search_path = public
as $$
  update public.at_solv_eventos set
    status  = case when p_ok then 'enviado'
                   when attempts >= 8 then 'fallido'
                   else 'pendiente' end,
    sent_at = case when p_ok then now() end,
    error   = case when p_ok then null else left(p_error, 500) end
  where event_id = p_event_id
$$;

revoke execute on function public.at_solv_tomar_eventos(int) from public, anon, authenticated;
revoke execute on function public.at_solv_marcar_evento(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.at_solv_tomar_eventos(int) to service_role;
grant execute on function public.at_solv_marcar_evento(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
