-- A TIEMPO LOGÍSTICA — el comercio ve su plata y en qué estado está.
--
-- Hasta ahora el recaudo contraentrega solo se veía desde adentro: /recaudo es
-- de admin, coordinador y mensajero. El comercio, que es el DUEÑO de ese
-- dinero, no tenía dónde mirar cuánto le hemos cobrado a sus compradores ni si
-- ya se lo giramos. Tenía que preguntarnos por WhatsApp y creernos.
--
-- El dinero pasa por cuatro estados, y contarlos como uno solo sería mentir por
-- simplificación. Cuando un comercio pregunta "¿tienen mi plata?", la respuesta
-- honesta depende de dónde está:
--
--   1. con_el_mensajero  El pedido se entregó y se cobró, pero el mensajero
--                        todavía no ha cerrado su caja. La plata existe y es
--                        suya, pero NO está en nuestras manos todavía. Decir
--                        que sí la tenemos sería falso.
--   2. en_nuestras_manos El mensajero cerró y la conciliación cuadró. Ahora sí
--                        la tenemos nosotros y le toca girársela.
--   3. en_remesa         Ya se armó la remesa con su corte, pero no se ha
--                        consignado. Tiene número y puede reclamarlo por él.
--   4. girado            Consignado, con fecha, medio y referencia.
--
-- La regla de qué está "en nuestras manos" es exactamente la misma que usa
-- at_recaudo_por_girar del lado de admin —entregada, contraentrega, sin remesa
-- y con la conciliación del mensajero en 'conciliado'—. Tenía que ser la misma:
-- dos pantallas mostrando cifras distintas del mismo dinero es peor que no
-- mostrar ninguna.

create or replace function public.at_mi_recaudo()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_resumen json;
  v_pedidos json;
  v_remesas json;
begin
  if v_role is null then raise exception 'No autorizado'; end if;
  if v_client is null then
    raise exception 'Tu cuenta todavía no tiene comercio';
  end if;

  -- Estado del dinero de cada pedido contraentrega ya entregado.
  with base as (
    select
      g.id, g.guide_number, g.recipient_name, g.delivered_at,
      g.cod_amount, coalesce(g.shipping_fee, 0) as shipping_fee,
      g.cod_includes_shipping,
      r.remittance_number, r.status as remesa_estado, r.paid_at,
      case
        when r.id is not null and r.status = 'pagada' then 'girado'
        when r.id is not null                          then 'en_remesa'
        when s.status = 'conciliado'                   then 'en_nuestras_manos'
        else                                                'con_el_mensajero'
      end as estado_dinero,
      -- Lo que de verdad le corresponde: si el domicilio venía DENTRO del
      -- contraentrega, ese pedazo ya es nuestro y no entra en el giro.
      g.cod_amount - case when g.cod_includes_shipping
                          then coalesce(g.shipping_fee, 0) else 0 end as le_corresponde
    from public.at_guides g
    left join public.at_settlements    s on s.id = g.settlement_id
    left join public.at_cod_remittances r on r.id = g.remittance_id
    where g.client_id = v_client
      and g.is_cod
      and g.status = 'entregada'
  )
  select
    json_build_object(
      'con_el_mensajero',  json_build_object(
        'pedidos', count(*) filter (where estado_dinero = 'con_el_mensajero'),
        'monto',   coalesce(sum(le_corresponde) filter (where estado_dinero = 'con_el_mensajero'), 0)),
      'en_nuestras_manos', json_build_object(
        'pedidos', count(*) filter (where estado_dinero = 'en_nuestras_manos'),
        'monto',   coalesce(sum(le_corresponde) filter (where estado_dinero = 'en_nuestras_manos'), 0)),
      'en_remesa',         json_build_object(
        'pedidos', count(*) filter (where estado_dinero = 'en_remesa'),
        'monto',   coalesce(sum(le_corresponde) filter (where estado_dinero = 'en_remesa'), 0)),
      'girado',            json_build_object(
        'pedidos', count(*) filter (where estado_dinero = 'girado'),
        'monto',   coalesce(sum(le_corresponde) filter (where estado_dinero = 'girado'), 0)),
      'recaudado_total',   coalesce(sum(cod_amount), 0),
      'domicilios_cobrados_al_comprador',
                           coalesce(sum(case when cod_includes_shipping then shipping_fee else 0 end), 0)
    ),
    coalesce(json_agg(json_build_object(
      'guide_number', guide_number,
      'recipient_name', recipient_name,
      'delivered_at', delivered_at,
      'cod_amount', cod_amount,
      'shipping_fee', shipping_fee,
      'cod_includes_shipping', cod_includes_shipping,
      'le_corresponde', le_corresponde,
      'estado_dinero', estado_dinero,
      'remittance_number', remittance_number,
      'paid_at', paid_at
    ) order by delivered_at desc), '[]'::json)
  into v_resumen, v_pedidos
  from base;

  -- Sus remesas. Aquí sí se muestra el cruce de cuentas, porque es lo que
  -- explica por qué el neto girado no coincide con el bruto recaudado.
  select coalesce(json_agg(json_build_object(
           'remittance_number', r.remittance_number,
           'period_start', r.period_start,
           'period_end', r.period_end,
           'guide_count', r.guide_count,
           'gross_amount', r.gross_amount,
           'shipping_kept', r.shipping_kept,
           'invoice_offset', r.invoice_offset,
           'net_amount', r.net_amount,
           'status', r.status,
           'method', r.method,
           'reference', r.reference,
           'paid_at', r.paid_at,
           'created_at', r.created_at
         ) order by r.created_at desc), '[]'::json)
  into v_remesas
  from public.at_cod_remittances r
  where r.client_id = v_client;

  return json_build_object(
    'resumen', v_resumen,
    'pedidos', v_pedidos,
    'remesas', v_remesas
  );
end $$;

comment on function public.at_mi_recaudo() is
  'Lo que se le ha recaudado al comercio y dónde está ese dinero: con el mensajero, en nuestras manos, en remesa o girado.';

revoke execute on function public.at_mi_recaudo() from public, anon;
grant execute on function public.at_mi_recaudo() to authenticated;
