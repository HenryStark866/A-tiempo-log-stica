-- ═══════════════════════════════════════════════════════════════════════════
-- EL PERMISO DEL PAGO SE GUARDA
--
-- Un pago de Open Payments se parte en dos por fuerza: pedimos permiso, el
-- comprador se va a SU billetera a autorizarlo, y vuelve. En medio hay una
-- visita a otro sitio, y entre una peticion y la otra el servidor no recuerda
-- nada. Si lo que devuelve `pedirPermisoDePago` —la URI de continuacion y su
-- token— no esta guardado cuando la persona vuelve, el permiso queda
-- concedido y sin usar: nadie puede rematar ese pago y la unica salida es
-- empezar de cero. Esta tabla es ese recuerdo.
--
-- ── Por que tambien se guarda la cotizacion y lo cotizado ────────────────
-- Porque al volver hay que crear el pago contra la MISMA cotizacion que la
-- persona vio, no contra una nueva. Una cotizacion nueva traeria otra tasa de
-- cambio, y cobrarle un importe distinto del que autorizo es una devolucion
-- esperando a pasar. Los importes se guardan como los da el estandar —entero
-- y escala, nunca coma flotante— para que al conciliar se comparen sin
-- redondeos.
--
-- ── Esta tabla tiene secretos dentro ────────────────────────────────────
-- `continuar_token` es un token portador: quien lo tenga puede rematar ese
-- pago. Por eso la tabla nace con RLS y SIN una sola politica: ni `anon` ni
-- `authenticated` la leen nunca, pase lo que pase en el navegador. La toca
-- solo el cliente de servicio desde las rutas de /api, que se salta RLS
-- entera y corre donde la llave privada ya vive.
--
-- Esto es a proposito y conviene decirlo: el comprador NO consulta aqui el
-- estado de su pago. El dia que haga falta ensenarselo, se expone una vista
-- con las columnas de estado y sin los tokens, no se le abre esta tabla.
--
-- ── El nonce es la unica llave que viaja ────────────────────────────────
-- Al volver, la billetera trae `interact_ref` y un `hash`, no el id de esta
-- fila. El `nonce` va en la URL de regreso y es con lo que se encuentra el
-- pago; es unico y de un solo uso, y el `hash` se recalcula para comprobar
-- que ese regreso lo manda de verdad el servidor de autorizacion y no alguien
-- que adivino una URL (ver `verificarRegreso` en
-- src/lib/pagos/openpayments.ts).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.at_pagos_op (
  id uuid primary key default gen_random_uuid(),

  -- A que pedido corresponde. Null se permite porque un cobro puede nacer
  -- antes que la guia (comprar primero, despachar despues) y perder el pago
  -- por no tener guia todavia seria el peor intercambio posible.
  guide_id uuid references public.at_guides(id) on delete set null,

  estado text not null default 'cotizado'
    check (estado in ('cotizado', 'autorizando', 'pagado', 'fallido')),

  billetera_pagador text not null,
  billetera_destino text not null,

  -- Las URL que devuelve la red: el cobro (incoming payment) y la cotizacion.
  cobro_url      text not null,
  cotizacion_url text not null,

  -- Lo que SALE de quien paga y lo que ENTRA a quien cobra. Casi nunca son el
  -- mismo numero ni la misma moneda: la diferencia es el cambio mas lo que
  -- cobre la red, y es justo el dato que distingue a YAM.
  debit_value       text not null,
  debit_asset_code  text not null,
  debit_asset_scale int  not null,
  receive_value       text not null,
  receive_asset_code  text not null,
  receive_asset_scale int  not null,

  -- Lo que hace falta para rematar cuando la persona vuelva.
  nonce          text not null unique,
  as_nonce       text not null,
  auth_server    text not null,
  continuar_uri   text,
  continuar_token text,

  interact_ref text,
  pago_url     text,
  motivo_fallo text,

  created_at timestamptz not null default now(),
  -- Una cotizacion de Open Payments vence. Pasada esa hora no se remata nada:
  -- se marca fallido y se vuelve a cotizar con la tasa del momento.
  expira_at  timestamptz not null default now() + interval '1 hour',
  pagado_at  timestamptz
);

comment on table public.at_pagos_op is
  'Pagos de Open Payments en curso. Guarda el permiso para poder rematarlo cuando el comprador vuelve de autorizar. Contiene tokens: no se expone a nadie.';

-- Buscar por nonce al volver, y barrer lo vencido.
create index if not exists at_pagos_op_estado_idx
  on public.at_pagos_op (estado, expira_at);
create index if not exists at_pagos_op_guide_idx
  on public.at_pagos_op (guide_id) where guide_id is not null;

alter table public.at_pagos_op enable row level security;

-- Sin politicas: RLS niega por omision y asi se queda. El `revoke` de abajo es
-- el cinturon por si manana alguien escribe un `grant ... to authenticated` de
-- los que se hacen en bloque sobre todas las tablas del esquema.
revoke all on public.at_pagos_op from anon, authenticated;

-- ── Barrer lo que vencio ────────────────────────────────────────────────
-- Un pago que nadie autorizo no se borra: se marca. Saber cuantos compradores
-- empiezan a pagar y no terminan es el numero que dira si el paso por la
-- billetera esta espantando gente, y un DELETE lo borraria junto con la fila.
create or replace function public.at_op_vencer_pagos()
returns integer
language plpgsql security definer set search_path = public
as $fn$
declare
  v_tocadas integer;
begin
  update public.at_pagos_op
     set estado = 'fallido',
         motivo_fallo = coalesce(motivo_fallo, 'La cotizacion vencio sin que se autorizara el pago.')
   where estado in ('cotizado', 'autorizando')
     and expira_at < now();
  get diagnostics v_tocadas = row_count;
  return v_tocadas;
end;
$fn$;

comment on function public.at_op_vencer_pagos() is
  'Marca como fallidos los pagos de Open Payments cuya cotizacion vencio. La llama el cron del buzon.';

revoke execute on function public.at_op_vencer_pagos() from public, anon, authenticated;
grant  execute on function public.at_op_vencer_pagos() to service_role;

notify pgrst, 'reload schema';
