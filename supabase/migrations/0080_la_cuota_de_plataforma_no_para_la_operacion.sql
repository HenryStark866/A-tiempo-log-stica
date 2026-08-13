-- A TIEMPO LOGÍSTICA — la cuota de la plataforma no puede parar la operación.
--
-- Al fijar la tasa de cambio (3.116,06) la cuota quedó lista para cobrarse: son
-- 31.160,60 al mes por comercio. Antes de darla por buena se simuló el 1 de
-- septiembre, y el resultado fue este:
--
--     el 2 de septiembre, los NUEVE comercios quedaban bloqueados.
--
-- La cuota entraba en la misma factura que los domicilios, así que heredaba el
-- ciclo de 24 horas. Al día siguiente de emitirla, todos aparecían en mora y
-- ninguno podía pedir recogidas. La suscripción habría parado la operación
-- entera — y con ella nuestra propia facturación, porque un comercio que no
-- despacha tampoco genera domicilios que cobrarle.
--
-- El ciclo de 24 horas se diseñó para los domicilios, que van atados al
-- movimiento diario de caja. Una suscripción mensual no es eso: se paga cuando
-- se paga una suscripción, no al día siguiente.
--
-- Ahora la cuota va en su propia factura, marcada como 'plataforma', y tiene su
-- propio plazo de 15 días. Sigue cobrándose: pasados esos 15 días bloquea igual
-- que cualquier otra. Lo que cambia es que ya no lo hace de un día para otro.
--
-- Comprobado simulando los dos extremos: al día siguiente de emitirla, 8 de 9
-- pueden despachar —el noveno estaba bloqueado por su deuda real de
-- domicilios—; a los 16 días sin pagarla, los 9 quedan bloqueados.

alter table public.at_invoices
  add column if not exists tipo text not null default 'operacion'
    check (tipo in ('operacion','plataforma'));

comment on column public.at_invoices.tipo is
  'operacion = domicilios y devoluciones, ciclo de 24h. plataforma = la cuota mensual de YAM, con su propio plazo.';

create or replace function public.at_ciclo_cobro_plataforma()
returns interval language sql immutable set search_path = public
as $$ select interval '15 days' $$;

comment on function public.at_ciclo_cobro_plataforma() is
  'Plazo de la cuota mensual de YAM. Único lugar donde vive, como at_ciclo_cobro.';

grant execute on function public.at_ciclo_cobro_plataforma() to authenticated;

-- El resto de esta migración —at_estado_cartera, at_cobrar_cuota_saas y
-- at_request_pickup, los tres pasando a elegir el plazo según el tipo de
-- factura— se aplicó junto con lo de arriba. Ver el historial de migraciones
-- de Supabase: la_cuota_de_plataforma_no_para_la_operacion.
