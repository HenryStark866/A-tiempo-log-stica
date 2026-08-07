-- A TIEMPO LOGÍSTICA — el municipio entra al formulario del comercio, y de paso
-- se acaba una ambigüedad que estaba servida.
--
-- at_update_my_business había quedado con DOS versiones vivas: la original de
-- cinco parámetros y otra de seis, de cuando se le agregó la zona. Postgres las
-- deja convivir porque se distinguen por la firma, y la app acertaba siempre
-- por casualidad: manda los nombres de los parámetros y por eso caía en la de
-- seis. El día que alguien llamara sin la zona, escribiría en la versión vieja
-- —la que no sabe de zonas— y el cambio se perdería sin un solo error.
--
-- Queda una sola función, con el municipio adentro. Un formulario, una llamada.

drop function if exists public.at_update_my_business(text, text, text, text, text);
drop function if exists public.at_update_my_business(text, text, text, text, text, uuid);
-- Creada hace un momento en 0059 pensando que el formulario no se podía tocar.
-- Resultó que sí, y dos caminos para guardar lo mismo es uno de más.
drop function if exists public.at_update_my_location(text, text);

create or replace function public.at_update_my_business(
  p_business_name text,
  p_nit           text default null,
  p_address       text default null,
  p_city          text default null,
  p_phone         text default null,
  p_contact_name  text default null,
  p_zone_id       uuid default null
)
returns public.at_clients
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_out public.at_clients;
begin
  if v_role is null or v_role <> 'cliente' then raise exception 'No autorizado'; end if;
  if v_client is null then raise exception 'Tu cuenta todavía no tiene comercio'; end if;
  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'El nombre del comercio es obligatorio';
  end if;

  update public.at_clients set
    business_name = trim(p_business_name),
    nit          = coalesce(nullif(trim(p_nit), ''), nit),
    address      = coalesce(nullif(trim(p_address), ''), address),
    city         = coalesce(nullif(trim(p_city), ''), city),
    phone        = coalesce(nullif(trim(p_phone), ''), phone),
    contact_name = coalesce(nullif(trim(p_contact_name), ''), contact_name),
    zone_id      = coalesce(p_zone_id, zone_id)
  where id = v_client
  returning * into v_out;

  return v_out;
end $$;

comment on function public.at_update_my_business(text, text, text, text, text, text, uuid) is
  'El comercio edita sus propios datos. Nunca tarifas, ciclo de facturación ni estado activo.';

revoke execute on function public.at_update_my_business(text, text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.at_update_my_business(text, text, text, text, text, text, uuid)
  to authenticated;
