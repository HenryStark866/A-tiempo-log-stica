-- A TIEMPO LOGÍSTICA — medios de pago del comercio y QR de la guía.
--
-- El comercio registra CÓMO quiere que le paguen (Nequi, Daviplata, cuenta
-- Bancolombia, un link de pago propio, o efectivo). Con eso, cada guía genera
-- dos QR:
--   1. Rastreo → /rastreo/<numero>, público, siempre al día.
--   2. Pago    → /pagar/<token>, público, muestra cuánto se recauda y por
--      dónde pagarle al comercio.
--
-- El QR de pago NO usa el número de guía: los números son consecutivos y
-- adivinables (ATL-100008), y esta vista expone los datos de cobro del
-- comercio. Por eso lleva un token aleatorio propio de cada guía.

-- ── 1. Medios de pago del comercio ─────────────────────────────────────
create table if not exists public.at_payment_methods (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.at_clients(id) on delete cascade,
  kind         text not null check (kind in ('nequi','daviplata','bancolombia','otro_banco','link','efectivo')),
  -- A quién le llega la plata y con qué dato se le paga.
  holder       text,          -- titular de la cuenta
  identifier   text,          -- celular, número de cuenta o URL del link
  instructions text,          -- "cuenta de ahorros", "enviar comprobante", etc.
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.at_payment_methods is
  'Formas de cobro que el comercio publica en el QR de pago de sus guías.';

create index if not exists at_payment_methods_client_idx
  on public.at_payment_methods (client_id, active, sort_order);

drop trigger if exists at_payment_methods_touch on public.at_payment_methods;
create trigger at_payment_methods_touch before update on public.at_payment_methods
  for each row execute function public.at_touch_updated_at();

alter table public.at_payment_methods enable row level security;

drop policy if exists "cliente administra sus medios de pago" on public.at_payment_methods;
create policy "cliente administra sus medios de pago" on public.at_payment_methods
  for all to authenticated
  using (client_id = public.at_my_client())
  with check (client_id = public.at_my_client());

drop policy if exists "staff lee medios de pago" on public.at_payment_methods;
create policy "staff lee medios de pago" on public.at_payment_methods
  for select to authenticated
  using (public.at_is_staff());

-- ── 2. Token público del QR de pago ────────────────────────────────────
alter table public.at_guides
  add column if not exists payment_token text;

-- Se rellena a las guías que ya existen antes de exigirlo.
update public.at_guides
set payment_token = encode(gen_random_bytes(12), 'hex')
where payment_token is null;

alter table public.at_guides
  alter column payment_token set default encode(gen_random_bytes(12), 'hex');

alter table public.at_guides
  alter column payment_token set not null;

create unique index if not exists at_guides_payment_token_idx
  on public.at_guides (payment_token);

comment on column public.at_guides.payment_token is
  'Token aleatorio del QR de pago. No se deriva del número de guía porque ese es consecutivo y adivinable.';

-- ── 3. Vista pública del pago ──────────────────────────────────────────
-- Devuelve solo lo que el destinatario necesita para pagar. Nada de
-- teléfonos, direcciones ni historial: para eso está el QR de rastreo.
create or replace function public.at_payment_info(p_token text)
returns json
language plpgsql security definer stable set search_path = public
as $$
declare
  v_guide  public.at_guides;
  v_client public.at_clients;
  v_medios json;
begin
  if p_token is null or length(trim(p_token)) < 12 then
    return null;
  end if;

  select * into v_guide from public.at_guides where payment_token = trim(p_token);
  if not found then return null; end if;

  select * into v_client from public.at_clients where id = v_guide.client_id;

  select coalesce(json_agg(json_build_object(
           'kind', m.kind,
           'holder', m.holder,
           'identifier', m.identifier,
           'instructions', m.instructions
         ) order by m.sort_order, m.created_at), '[]'::json)
  into v_medios
  from public.at_payment_methods m
  where m.client_id = v_guide.client_id and m.active;

  return json_build_object(
    'guide_number', v_guide.guide_number,
    'status',       v_guide.status,
    'is_cod',       v_guide.is_cod,
    'cod_amount',   v_guide.cod_amount,
    'recipient_name', v_guide.recipient_name,
    'business_name', coalesce(v_client.business_name, 'El comercio'),
    'methods',      v_medios
  );
end $$;

-- Público a propósito: el destinatario escanea el QR sin tener cuenta.
grant execute on function public.at_payment_info(text) to anon, authenticated;
