-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROL TOTAL DEL ADMIN — la ficha completa de un usuario, para soporte
--
-- Cuando alguien llama diciendo «no puedo entrar», lo que hace falta saber es
-- con qué correo está registrado, si alguna vez confirmó ese correo, cuándo
-- entró por última vez y en qué estado quedó su cuenta. Nada de eso vivía en
-- at_profiles: está en auth.users, que las pantallas no pueden leer con la
-- llave pública. Por eso hasta ahora el admin tenía que adivinar.
--
-- Lo que NO devuelve, porque no existe: la contraseña. auth.users guarda un
-- hash bcrypt, no la clave. No hay forma de mostrarla ni de recuperarla, ni
-- para el admin ni para nadie; lo que sí se puede es mandarle a la persona un
-- enlace para que ponga una nueva, y eso lo hace la pantalla.
--
-- Solo admin. No coordinador: aquí hay correos, teléfonos y documentos de
-- identidad de todo el mundo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_admin_ficha_usuario(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ficha json;
begin
  if coalesce(public.at_my_role() = 'admin', false) is not true then
    raise exception 'Solo un administrador consulta la ficha de un usuario';
  end if;

  select json_build_object(
    'perfil', to_jsonb(p),
    'cuenta', json_build_object(
      'email', u.email,
      'telefono_auth', u.phone,
      'email_confirmado_en', u.email_confirmed_at,
      'ultimo_acceso', u.last_sign_in_at,
      'cuenta_creada_en', u.created_at,
      'tiene_clave', (coalesce(u.encrypted_password, '') <> ''),
      'proveedores', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
      'bloqueada_hasta', u.banned_until
    ),
    'comercio', (
      select json_build_object('id', c.id, 'business_name', c.business_name, 'active', c.active)
      from public.at_clients c where c.id = p.client_id
    ),
    'documentos', coalesce((
      select json_agg(to_jsonb(d) order by d.uploaded_at desc)
      from public.at_courier_documents d where d.courier_id = p.id
    ), '[]'::json)
  ) into v_ficha
  from public.at_profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if v_ficha is null then
    raise exception 'Ese usuario no existe';
  end if;

  return v_ficha;
end $function$;

revoke execute on function public.at_admin_ficha_usuario(uuid) from public, anon;
grant execute on function public.at_admin_ficha_usuario(uuid) to authenticated;

-- El correo y el último acceso de todos, para poder buscar a alguien por su
-- correo desde la lista. Es la primera pregunta del soporte: «no puedo entrar»,
-- y el correo con el que escribe casi nunca es el que usó para registrarse.
create or replace function public.at_admin_directorio()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v json;
begin
  if coalesce(public.at_my_role() = 'admin', false) is not true then
    raise exception 'Solo un administrador ve el directorio';
  end if;

  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'email', u.email,
    'ultimo_acceso', u.last_sign_in_at,
    'email_confirmado', (u.email_confirmed_at is not null)
  )), '[]'::json) into v
  from public.at_profiles p
  left join auth.users u on u.id = p.id;

  return v;
end $function$;

revoke execute on function public.at_admin_directorio() from public, anon;
grant execute on function public.at_admin_directorio() to authenticated;
