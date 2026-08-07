-- A TIEMPO LOGÍSTICA — el municipio que se escribe en el registro llega al perfil.
--
-- Sin esto, el formulario de registro pregunta el municipio y el dato muere en
-- el metadata de Supabase: at_handle_new_user copia campo por campo, y lo que
-- no está en su lista no existe. El comercio nacería otra vez sin zona, que es
-- justo lo que se está corrigiendo.

create or replace function public.at_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $function$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_requested text := v_meta->>'requested_role';
begin
  insert into public.at_profiles (
    id, full_name, phone, role,
    requested_role, business_type, business_name, business_nit, business_address,
    business_city, proposed_city
  )
  values (
    new.id,
    coalesce(v_meta->>'full_name', ''),
    nullif(v_meta->>'phone', ''),
    'pendiente',
    case when v_requested in ('cliente','mensajero','operario','admin_cedi')
         then v_requested::public.at_role else null end,
    nullif(v_meta->>'business_type', ''),
    nullif(v_meta->>'business_name', ''),
    nullif(v_meta->>'business_nit', ''),
    nullif(v_meta->>'business_address', ''),
    nullif(v_meta->>'business_city', ''),
    nullif(v_meta->>'proposed_city', '')
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end $function$;
