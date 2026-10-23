-- ═══════════════════════════════════════════════════════════════════════════
-- LA MONEDA DEL COMERCIO, Y EL PAGO QUE SE PUEDE VER
--
-- Tres agujeros que quedaron abiertos y que no son mejoras: son fallos.
--
-- ── 1. El cobro mal hecho (la Fase 0 de docs/multimoneda.md) ────────────
-- Los importes de las tablas `at_` son numeros sin moneda, y son pesos porque
-- hasta hoy todos los comercios estaban en Medellin. Un `cod_amount` de
-- 50.000 cobrado contra una billetera en euros no son 50.000 euros: son unos
-- once. Etiquetar ese numero con la moneda de la billetera pide cuatro mil
-- veces el precio, y eso no se descubre revisando logs — se descubre cuando
-- alguien reclama su dinero.
--
-- `billing_currency` convierte esa suposicion en un dato, y la `fk` a
-- `at_monedas` es la que impide que el mismo peso se escriba 'COP', 'cop' y
-- 'COL$' y parta un total en tres. Mismo criterio que `commission_bps` en la
-- 0046: que la unidad este escrita, no sobreentendida.
--
-- No convierte nada ni toca una sola cifra: toda fila existente es COP, que
-- es lo que ya era. `add column ... default` no reescribe la tabla en
-- Postgres moderno, asi que esto no bloquea la operacion, y se deshace con un
-- `drop column`.
--
-- ── 2. El comprador no podia ver su propio pago ─────────────────────────
-- `at_pagos_op` nace sin politicas porque guarda un token portador (0148), y
-- eso dejo a la app del telefono diciendo «estamos confirmando tu pago» para
-- siempre: no hay forma de saber como acabo. La salida NO es abrir la tabla
-- —seria repartir tokens de pago— sino una funcion que devuelve lo que se
-- puede ensenar y nada mas: estado, importes y cuando se pago.
--
-- Quien pregunta solo recibe los pagos de los pedidos que van a SU telefono,
-- con el mismo criterio de la 0146 (`at_mi_telefono()`), porque es el unico
-- vinculo que existe hoy entre una guia y quien espera el paquete.
--
-- ── 3. Un pago conciliado no dejaba rastro en el pedido ─────────────────
-- La 0149 aprendio a saber si el dinero llego, y ese dato se quedaba dentro
-- de `at_pagos_op`: quien mira el pedido —el comercio, el CEDI, la persona—
-- no veia nada. `at_op_anotar_en_la_guia` escribe el hecho en la linea de
-- tiempo, que es donde todo el mundo ya mira.
--
-- Lo que esta funcion NO hace, a proposito: no apaga el contraentrega
-- (`is_cod`) ni cambia el estado del pedido. Un mensajero que deja de cobrar
-- en efectivo porque una fila cambio sola es un problema de operacion, no de
-- software, y esa decision es de Henry. El evento deja el dato a la vista
-- para que se pueda tomar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Las monedas con las que trabajamos ───────────────────────────────
create table if not exists public.at_monedas (
  codigo             text primary key,          -- ISO 4217 en mayusculas
  nombre             text not null,
  -- La escala con la que la red mueve esa moneda (Open Payments: entero +
  -- escala). No tiene que ser la de los decimales que se ensenan.
  escala             smallint not null default 2,
  decimales_visibles smallint not null default 0,
  activa             boolean not null default true,
  constraint at_monedas_codigo_iso check (codigo ~ '^[A-Z]{3}$')
);

comment on table public.at_monedas is
  'Las monedas en las que la plataforma sabe cobrar. La fk desde cada columna de moneda es lo que impide que el mismo peso se escriba de tres formas.';

-- COP con `decimales_visibles` 0 porque es como se ensena aqui (formatCOP en
-- src/lib/utils.ts usa maximumFractionDigits 0), y escala 2 porque es la que
-- habla la red. Las otras tres son las de los tres informes de
-- docs/internacional/: no se activan solas, se dejan escritas.
insert into public.at_monedas (codigo, nombre, escala, decimales_visibles, activa) values
  ('COP', 'Peso colombiano', 2, 0, true),
  ('EUR', 'Euro',            2, 2, false),
  ('USD', 'Dolar',           2, 2, false),
  ('NGN', 'Naira',           2, 2, false)
on conflict (codigo) do nothing;

alter table public.at_monedas enable row level security;

-- Es un catalogo publico: saber que existe el euro no filtra nada, y la
-- vitrina necesita leerlo para ensenar precios. Solo lectura; escribe ops.
drop policy if exists "las monedas las lee cualquiera" on public.at_monedas;
create policy "las monedas las lee cualquiera" on public.at_monedas
  for select to anon, authenticated using (true);

drop policy if exists "ops administra las monedas" on public.at_monedas;
create policy "ops administra las monedas" on public.at_monedas
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

grant select on public.at_monedas to anon, authenticated;

alter table public.at_clients
  add column if not exists billing_currency text not null default 'COP';

alter table public.at_clients
  drop constraint if exists at_clients_billing_currency_fk;
alter table public.at_clients
  add constraint at_clients_billing_currency_fk
  foreign key (billing_currency) references public.at_monedas(codigo);

comment on column public.at_clients.billing_currency is
  'La moneda en la que estan escritos los precios de este comercio. Hoy COP para todos. La ruta de pago se niega a cobrar si no coincide con la moneda de su billetera.';

-- La moneda del comercio NO entra en las columnas que la 0143 abrio a `anon`:
-- la vitrina publica no la necesita todavia y anadirla sola seria justo lo que
-- aquella migracion evito al conceder columna por columna.
revoke select (billing_currency) on public.at_clients from anon;

-- ── 2. El pago, como lo puede ver quien lo hizo ─────────────────────────
create or replace function public.at_mi_pago(p_guide_id uuid)
returns table (
  estado              text,
  debit_value         text,
  debit_asset_code    text,
  debit_asset_scale   int,
  receive_value       text,
  receive_asset_code  text,
  receive_asset_scale int,
  pagado_at           timestamptz,
  conciliado_at       timestamptz,
  created_at          timestamptz
)
language sql stable security definer set search_path = public
as $fn$
  select p.estado,
         p.debit_value, p.debit_asset_code, p.debit_asset_scale,
         p.receive_value, p.receive_asset_code, p.receive_asset_scale,
         p.pagado_at, p.conciliado_at, p.created_at
    from public.at_pagos_op p
    join public.at_guides g on g.id = p.guide_id
   where p.guide_id = p_guide_id
     -- El mismo criterio de la 0146: es suyo el pedido que va a su telefono.
     -- Un comprador sin telefono en el perfil no ve nada, porque
     -- `at_mi_telefono()` devuelve NULL y NULL = NULL no es cierto.
     and g.recipient_phone is not null
     and g.recipient_phone = public.at_mi_telefono()
   order by p.created_at desc
   limit 1;
$fn$;

comment on function public.at_mi_pago(uuid) is
  'El estado del pago de un pedido, para quien lo espera. Devuelve importes y fechas; nunca los tokens ni las URL del permiso.';

-- `anon` no: un pago se consulta con sesion. Y la funcion es `security
-- definer` porque la tabla no tiene politicas a proposito: el filtro por
-- telefono lo hace el `where` de aqui, que es el unico sitio donde esta.
revoke execute on function public.at_mi_pago(uuid) from public, anon;
grant  execute on function public.at_mi_pago(uuid) to authenticated;

-- ── 3. El pago se anota en la linea de tiempo del pedido ────────────────
create or replace function public.at_op_anotar_en_la_guia(p_pago_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $fn$
declare
  v_pago   record;
  v_estado public.at_guide_status;
  v_nota   text;
begin
  select p.id, p.guide_id, p.estado, p.recibido_value, p.recibido_asset_code,
         p.recibido_asset_scale, p.receive_value, p.receive_asset_code
    into v_pago
    from public.at_pagos_op p
   where p.id = p_pago_id;

  if not found or v_pago.guide_id is null then
    return false;
  end if;

  -- El evento lleva el estado que el pedido YA tiene: esta nota cuenta algo
  -- del dinero, no un avance de la entrega, y mover el estado desde aqui
  -- sacaria el pedido de la cola donde esta esperando.
  select g.status into v_estado from public.at_guides g where g.id = v_pago.guide_id;
  if v_estado is null then
    return false;
  end if;

  if v_pago.estado = 'conciliado' then
    v_nota := 'Pago confirmado por la billetera de destino: '
           || coalesce(v_pago.recibido_value, v_pago.receive_value) || ' '
           || coalesce(v_pago.recibido_asset_code, v_pago.receive_asset_code)
           || ' (escala ' || coalesce(v_pago.recibido_asset_scale, 2)::text || ').';
  elsif v_pago.estado = 'discrepancia' then
    v_nota := 'El pago no cuadra con lo cotizado: llegaron '
           || coalesce(v_pago.recibido_value, '0') || ' '
           || coalesce(v_pago.recibido_asset_code, '?')
           || ' y se esperaban ' || v_pago.receive_value || ' '
           || v_pago.receive_asset_code || '. Lo revisa una persona.';
  else
    -- Los demas estados son pasos intermedios. Anotarlos llenaria la linea de
    -- tiempo de ruido sobre algo que todavia no acabo.
    return false;
  end if;

  -- Una sola nota por pago y por estado: la conciliacion reintenta hasta ocho
  -- veces (0149) y sin esto la linea de tiempo saldria ocho veces lo mismo.
  if exists (
    select 1 from public.at_guide_events e
     where e.guide_id = v_pago.guide_id
       and e.note = v_nota
  ) then
    return false;
  end if;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (v_pago.guide_id, v_estado, v_nota, null);

  return true;
end;
$fn$;

comment on function public.at_op_anotar_en_la_guia(uuid) is
  'Escribe en la linea de tiempo del pedido que su pago se confirmo (o que no cuadra). No toca is_cod ni el estado del pedido: esa decision es de operacion.';

revoke execute on function public.at_op_anotar_en_la_guia(uuid) from public, anon, authenticated;
grant  execute on function public.at_op_anotar_en_la_guia(uuid) to service_role;

-- ── 4. Las discrepancias se pueden mirar sin abrir la tabla ─────────────
-- No hay pantalla todavia, pero el dato tiene que ser alcanzable por alguien
-- de ops sin repartir tokens. El rol se comprueba DENTRO, que es la regla de
-- toda funcion `security definer` de este repo.
create or replace function public.at_op_discrepancias(p_tope integer default 50)
returns table (
  id                 uuid,
  guide_number       text,
  estado             text,
  esperado           text,
  recibido           text,
  motivo_fallo       text,
  conciliado_at      timestamptz,
  created_at         timestamptz
)
language plpgsql stable security definer set search_path = public
as $fn$
begin
  if not public.at_is_ops() then
    raise exception 'Solo ops puede ver las discrepancias de pago.';
  end if;

  return query
    select p.id,
           g.guide_number,
           p.estado,
           p.receive_value || ' ' || p.receive_asset_code,
           coalesce(p.recibido_value, '—') || ' ' || coalesce(p.recibido_asset_code, ''),
           p.motivo_fallo,
           p.conciliado_at,
           p.created_at
      from public.at_pagos_op p
      left join public.at_guides g on g.id = p.guide_id
     where p.estado = 'discrepancia'
     order by p.created_at desc
     limit least(greatest(coalesce(p_tope, 50), 1), 200);
end;
$fn$;

comment on function public.at_op_discrepancias(integer) is
  'Los pagos que no cuadran, para ops. Sin tokens ni URL de permiso.';

revoke execute on function public.at_op_discrepancias(integer) from public, anon;
grant  execute on function public.at_op_discrepancias(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
