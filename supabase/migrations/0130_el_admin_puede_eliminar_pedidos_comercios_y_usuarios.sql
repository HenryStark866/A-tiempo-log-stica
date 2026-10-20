-- Eliminar pedido, comercio y usuario: las tres funciones de borrado del admin.
--
-- Estaban en producción y en ninguna migración; el staging fallaba cerrado
-- («función no encontrada») y por eso no se reconstruían a ciegas: borran
-- datos y su orden importa. Con el respaldo del 2026-09-23 se recuperó el
-- código original, que solo deja borrar a un admin, deja rastro crítico en
-- at_log_security_event y se niega a borrar lo facturado o girado, al último
-- admin, a uno mismo y a un mensajero con cierres de caja.

create or replace function public.at_admin_eliminar_pedido(p_id uuid, p_motivo text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_g public.at_guides;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo un administrador puede eliminar pedidos ya despachados';
  end if;

  select * into v_g from public.at_guides where id = p_id;
  if not found then raise exception 'Ese pedido no existe'; end if;

  if v_g.invoice_id is not null then
    raise exception 'El pedido % ya está facturado. Anula primero la factura: borrarlo dejaría un cobro sin respaldo.', v_g.guide_number;
  end if;
  if v_g.remittance_id is not null then
    raise exception 'El pedido % ya entró en una remesa de recaudo. Borrarlo descuadraría la plata girada al comercio.', v_g.guide_number;
  end if;

  perform public.at_log_security_event(
    'cambio_rol_admin', 'critico',
    jsonb_build_object('accion','pedido_eliminado','guia',v_g.guide_number,
                       'estado',v_g.status,'motivo',p_motivo));

  delete from public.at_guides where id = p_id;
  return json_build_object('eliminado', v_g.guide_number);
end $$;

create or replace function public.at_admin_eliminar_comercio(p_id uuid, p_confirmacion text, p_motivo text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_c public.at_clients;
  v_pedidos int;
  v_usuarios int;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo un administrador puede eliminar comercios';
  end if;

  select * into v_c from public.at_clients where id = p_id;
  if not found then raise exception 'Ese comercio no existe'; end if;

  -- Escribir el nombre a mano no es burocracia: es lo único que distingue
  -- «quería borrar este» de «le di al botón de la fila de al lado». Con
  -- pedidos, facturas y recaudo detrás, esa diferencia es cara.
  if public.at_norm(coalesce(p_confirmacion,'')) is distinct from public.at_norm(v_c.business_name) then
    raise exception 'Para confirmar, escribe exactamente el nombre del comercio: %', v_c.business_name;
  end if;

  select count(*) into v_pedidos  from public.at_guides where client_id = p_id;
  select count(*) into v_usuarios from public.at_profiles where client_id = p_id;

  perform public.at_log_security_event(
    'cambio_rol_admin', 'critico',
    jsonb_build_object('accion','comercio_eliminado','comercio',v_c.business_name,
                       'pedidos',v_pedidos,'usuarios',v_usuarios,'motivo',p_motivo));

  -- Sus usuarios pierden el comercio pero conservan la cuenta (la FK es SET
  -- NULL): borrarle la cuenta a una persona porque se cerró un negocio sería
  -- una decisión distinta, y se toma aparte.
  delete from public.at_clients where id = p_id;

  return json_build_object('eliminado', v_c.business_name,
                           'pedidos_borrados', v_pedidos,
                           'usuarios_desvinculados', v_usuarios);
end $$;

create or replace function public.at_admin_eliminar_usuario(p_id uuid, p_motivo text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_perfil public.at_profiles;
  v_admins int;
  v_correo text;
  v_cierres int;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo un administrador puede eliminar usuarios';
  end if;

  select * into v_perfil from public.at_profiles where id = p_id;
  if not found then raise exception 'Ese usuario no existe'; end if;

  if p_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta: te quedarías fuera de la plataforma';
  end if;

  if v_perfil.role = 'admin' then
    select count(*) into v_admins from public.at_profiles where role='admin' and active and id <> p_id;
    if v_admins = 0 then
      raise exception 'Es el último administrador activo. Nombra otro antes de eliminarlo.';
    end if;
  end if;

  select count(*) into v_cierres from public.at_settlements where courier_id = p_id;
  if v_cierres > 0 then
    raise exception 'Este mensajero tiene % cierre(s) de caja a su nombre. Borrarlo dejaría plata recaudada sin responsable. Desactívalo en vez de eliminarlo.', v_cierres;
  end if;

  select email into v_correo from auth.users where id = p_id;

  perform public.at_log_security_event(
    'cambio_rol_admin', 'critico',
    jsonb_build_object('accion','usuario_eliminado','perfil_id',p_id,
                       'nombre',v_perfil.full_name,'correo',v_correo,
                       'rol',v_perfil.role,'motivo',p_motivo));

  delete from auth.users where id = p_id;

  return json_build_object('eliminado', v_perfil.full_name, 'correo', v_correo);
end $$;

comment on function public.at_admin_eliminar_usuario(uuid, text) is
  'Elimina una cuenta. El perfil se va en cascada. No permite borrarse a uno mismo ni al último admin.';

revoke execute on function public.at_admin_eliminar_pedido(uuid, text)         from public, anon;
revoke execute on function public.at_admin_eliminar_comercio(uuid, text, text) from public, anon;
revoke execute on function public.at_admin_eliminar_usuario(uuid, text)        from public, anon;
grant  execute on function public.at_admin_eliminar_pedido(uuid, text)         to authenticated, service_role;
grant  execute on function public.at_admin_eliminar_comercio(uuid, text, text) to authenticated, service_role;
grant  execute on function public.at_admin_eliminar_usuario(uuid, text)        to authenticated, service_role;
