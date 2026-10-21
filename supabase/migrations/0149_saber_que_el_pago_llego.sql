-- ═══════════════════════════════════════════════════════════════════════════
-- SABER QUE EL PAGO LLEGO, NO SOLO QUE SALIO
--
-- La 0148 guarda el permiso para poder rematar el pago. Esta cierra el agujero
-- que quedaba del otro lado: un pago REMATADO no es un pago COBRADO. Entre las
-- dos cosas hay tres caminos por donde se pierde la verdad:
--
--   · el remate funciona y la respuesta no vuelve: el dinero salio y nosotros
--     creemos que no. La fila se queda en `autorizando` A PROPOSITO —marcarla
--     fallida invitaria a cobrar dos veces— y hasta hoy nadie la volvia a
--     mirar nunca;
--   · el outgoing payment se crea y el dinero se atasca en un tramo
--     intermedio: para nosotros estaba `pagado` desde el primer segundo;
--   · llega menos de lo cotizado, o llega en otra moneda.
--
-- La unica fuente que no miente sobre lo que LLEGO es el incoming payment, que
-- vive en la billetera de quien cobra. Estas columnas son donde se anota lo
-- que esa billetera contesta.
--
-- ── Por que dos estados nuevos y no un booleano ─────────────────────────
-- `pagado` pasa a querer decir «lo mandamos» y `conciliado` «la billetera de
-- destino dice que lo tiene». Son hechos distintos y confundirlos es lo que
-- deja plata sin cobrar: con un solo estado, la fila de un pago atascado se ve
-- igual que la de uno cobrado. `discrepancia` es el tercero y existe para no
-- tener que decidir: si llego otra moneda o un importe que no cuadra, ninguna
-- regla automatica deberia resolverlo — lo mira una persona. Lo que se pierde
-- es simplicidad en las consultas: quien cuente ventas tiene que contar
-- `pagado` y `conciliado`, no solo uno.
--
-- Entrar de MENOS no es discrepancia: un cobro a medio llenar es lo normal
-- mientras el pago esta en vuelo. Por eso se reintenta en vez de alarmar.
--
-- ── Por que se cuentan los intentos ─────────────────────────────────────
-- Por el incidente del 2026-09-08 (ver
-- 0112_el_buzon_no_se_atasca_ni_tumba_la_base.sql): un mensaje que nunca podia
-- salir hizo que el cron golpeara en balde cada minuto hasta tumbar la base en
-- un t4g.nano. Un cobro que nunca se completa es exactamente la misma forma.
-- `conciliaciones` y el tope de `at_op_por_conciliar` son el freno: a partir
-- del tope la fila deja de consultarse y se queda como esta, visible y sin
-- resolver. Se pierde la automatizacion y se gana que la base siga encendida;
-- quien quiera rescatar esa fila la rescata a mano, que es lo correcto para
-- una cantidad que se cuenta con los dedos.
--
-- ── Lo que esta migracion NO cambia ─────────────────────────────────────
-- `at_pagos_op` sigue sin una sola politica de RLS. Guarda un token portador y
-- ahora tambien el detalle de lo cobrado: menos motivos que nunca para
-- abrirla. La tocan solo las rutas de /api con el cliente de servicio.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Lo que llego de verdad, y cuando se comprobo ──────────────────────
-- Los importes se guardan como los da el estandar —entero y escala, nunca coma
-- flotante— para que se comparen con lo cotizado sin redondeos. La moneda se
-- guarda aunque «deberia» ser la misma que `receive_asset_code`: el dia que no
-- lo sea, el dato que lo demuestra tiene que estar aqui y no deducirse.
alter table public.at_pagos_op
  add column if not exists recibido_value       text,
  add column if not exists recibido_asset_code  text,
  add column if not exists recibido_asset_scale int,
  -- La billetera de destino dio el cobro por cerrado: no va a entrar mas.
  add column if not exists cobro_completado boolean,
  add column if not exists conciliado_at    timestamptz,
  add column if not exists conciliaciones   integer not null default 0;

comment on column public.at_pagos_op.recibido_value is
  'Lo que la billetera de destino dice que tiene. Puede no coincidir con receive_value: esa diferencia es el dato, no un error que corregir.';
comment on column public.at_pagos_op.conciliado_at is
  'Cuando se le pregunto a la red por ultima vez. No quiere decir que la respuesta llegara: lo que prueba una respuesta es recibido_value.';
comment on column public.at_pagos_op.conciliaciones is
  'Veces que se le pregunto a la red por este cobro. Con tope: un cobro que nunca se completa no puede quedarse golpeando el cron para siempre.';

-- ── 2. Los dos estados nuevos ────────────────────────────────────────────
-- Un `check` no se edita: se tira y se vuelve a crear. El nombre se fija a
-- mano porque el que puso Postgres al declararlo en la 0148 es derivado y
-- cambiarlo mas adelante seria otra adivinanza.
alter table public.at_pagos_op
  drop constraint if exists at_pagos_op_estado_check;
alter table public.at_pagos_op
  drop constraint if exists at_pagos_op_estado_valido;
alter table public.at_pagos_op
  add constraint at_pagos_op_estado_valido check (
    estado in (
      'cotizado',      -- hay cobro y cotizacion; nadie ha autorizado nada
      'autorizando',   -- el comprador esta en su billetera, o volvio y el remate fallo
      'pagado',        -- lo mandamos nosotros: el outgoing payment existe
      'conciliado',    -- la billetera de destino confirma que lo tiene
      'discrepancia',  -- llego algo que no cuadra; lo mira una persona
      'fallido'        -- no se cobro, y la red lo confirma
    )
  );

-- Lo que busca el barrido: sin conciliar, lo mas viejo primero.
create index if not exists at_pagos_op_por_conciliar_idx
  on public.at_pagos_op (estado, conciliado_at, created_at)
  where estado in ('pagado', 'autorizando');

-- ── 3. A quien hay que preguntarle, y cuantos de una vez ─────────────────
-- El criterio vive aqui y no en la ruta a proposito: es la definicion de «sin
-- conciliar» y hay un solo sitio donde cambiarla. El tope tambien se topa aqui
-- —la ruta puede pedir menos, nunca mas— porque el freno de la instancia no
-- puede depender de que quien llama se porte bien.
create or replace function public.at_op_por_conciliar(p_tope integer default 25)
returns table (
  id                  uuid,
  cobro_url           text,
  billetera_destino   text,
  estado              text,
  receive_value       text,
  receive_asset_code  text,
  receive_asset_scale int,
  conciliaciones      integer
)
language sql security definer set search_path = public
as $fn$
  select p.id,
         p.cobro_url,
         p.billetera_destino,
         p.estado,
         p.receive_value,
         p.receive_asset_code,
         p.receive_asset_scale,
         p.conciliaciones
    from public.at_pagos_op p
   where p.conciliaciones < 8
     and (
       -- Salio y nadie ha confirmado que llego.
       (p.estado = 'pagado' and p.conciliado_at is null)

       -- Salio, se pregunto, y el cobro seguia abierto. Se reintenta con
       -- holgura: un pago en vuelo tarda, y preguntar cada minuto es el
       -- goteo que ya tumbo la base una vez.
       or (p.estado = 'pagado'
           and coalesce(p.cobro_completado, false) = false
           and p.conciliado_at < now() - interval '10 minutes')

       -- Se quedo en `autorizando`. Si trae `interact_ref`, el remate se
       -- intento y el pago pudo existir al otro lado aunque no nos
       -- enterasemos: ese es el caso que justifica todo esto. Si no lo trae,
       -- el comprador no volvio y nada pudo salir — se consulta igual, una
       -- vez vencida la cotizacion, porque es mas barato preguntar que
       -- marcar fallido un cobro que si entro.
       or (p.estado = 'autorizando'
           and (p.interact_ref is not null or p.expira_at < now())
           and (p.conciliado_at is null
                or p.conciliado_at < now() - interval '10 minutes'))
     )
   order by p.created_at
   limit least(greatest(coalesce(p_tope, 25), 1), 100);
$fn$;

comment on function public.at_op_por_conciliar(integer) is
  'Pagos de Open Payments a los que hay que preguntarle a la red si llegaron. Topado por dentro: la ruta puede pedir menos, nunca mas.';

revoke execute on function public.at_op_por_conciliar(integer) from public, anon, authenticated;
grant  execute on function public.at_op_por_conciliar(integer) to service_role;

-- ── 4. Vencer ya no puede ir por delante de conciliar ────────────────────
-- La version de la 0148 marcaba fallido TODO lo vencido, `autorizando`
-- incluido. Eso es justo lo contrario de lo que hace falta: la fila que se
-- quedo en `autorizando` es la que pudo haberse cobrado al otro lado, y
-- declararla fallida sin preguntar es perder la unica pista de un cobro de
-- verdad — o cobrarlo dos veces cuando alguien reintente.
--
-- Ahora un `autorizando` solo vence cuando la red ya dijo que ahi no entro
-- nada. Lo que se pierde: una fila cuya consulta falla siempre no llega nunca
-- a `fallido` y se queda en `autorizando` pasado el tope de intentos. Es el
-- intercambio querido — un pago en el limbo que alguien tiene que mirar es
-- mejor que un pago cobrado que la plataforma dio por perdido.
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
   where expira_at < now()
     and (
       -- Nunca hubo permiso, asi que nunca pudo salir dinero.
       estado = 'cotizado'
       -- Hubo permiso: hace falta que la red confirme que no entro nada.
       -- `recibido_value = '0'` es esa prueba, y por eso se exige el valor en
       -- vez de un `coalesce` a cero: null no significa «no entro nada»,
       -- significa «no se pudo preguntar», y son cosas distintas. Un cobro
       -- que no se pudo consultar nunca se marca fallido.
       or (estado = 'autorizando'
           and coalesce(cobro_completado, false) = false
           and recibido_value = '0')
     );
  get diagnostics v_tocadas = row_count;
  return v_tocadas;
end;
$fn$;

comment on function public.at_op_vencer_pagos() is
  'Marca como fallidos los pagos de Open Payments cuya cotizacion vencio sin cobrarse. Un `autorizando` solo vence si la conciliacion ya confirmo que no entro nada. La llama el cron del buzon.';

revoke execute on function public.at_op_vencer_pagos() from public, anon, authenticated;
grant  execute on function public.at_op_vencer_pagos() to service_role;

notify pgrst, 'reload schema';
