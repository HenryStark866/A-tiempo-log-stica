-- A TIEMPO LOGÍSTICA — el mensajero nuevo puede subir sus documentos.
--
-- ── El fallo, y por qué bloquea toda la contratación ──────────────────────
--
-- `at_register_courier_doc` exigía rol 'mensajero':
--
--     if public.at_my_role() <> 'mensajero' then
--       raise exception 'Solo un mensajero sube sus documentos';
--
-- Pero quien se acaba de registrar en /registro NO tiene ese rol todavía:
-- queda con `role = 'pendiente'` y `requested_role = 'mensajero'` (migración
-- 0006), y solo pasa a 'mensajero' cuando un admin lo habilita.
--
-- Y para habilitarlo hay que revisarle los documentos. Que no puede subir.
--
-- O sea: se necesita estar habilitado para subir los papeles que hacen falta
-- para que te habiliten. Ningún mensajero nuevo podía entrar a la operación.
--
-- No se había visto porque los mensajeros que ya estaban en producción fueron
-- promovidos a 'mensajero' de una sola vez por la propia 0020 (el update del
-- paso 11). Para ellos la función siempre funcionó. El agujero solo aparece
-- con alguien que se registra DESPUÉS — y eso empezó a pasar justo ahora, al
-- tener que rehacer la plantilla de mensajeros tras el reset.
--
-- ── Por qué es seguro abrirlo ─────────────────────────────────────────────
--
-- Lo que de verdad protege estos archivos no es el rol: es la carpeta. Tanto
-- la política de storage como esta misma función exigen que el primer tramo
-- de la ruta sea el auth.uid() de quien sube. Un pendiente solo puede escribir
-- en su propia carpeta y solo puede registrar filas a su propio nombre.
--
-- Se abre SOLO a quien pidió ser mensajero. Un pendiente que solicitó ser
-- 'cliente' sigue sin poder: no tiene documentos que subir y no hay motivo
-- para darle un bucket privado.
--
-- (El valor 'certificado_medidas_correctivas' del enum y la lista de papeles
-- obligatorios ya los puso la 0084 y la 0085. Esta migración solo toca quién
-- puede llamar a la función.)

-- ── 1. Quién puede subir ──────────────────────────────────────────────────
create or replace function public.at_register_courier_doc(
  p_doc_type   public.at_doc_type,
  p_file_path  text,
  p_expires_on date default null
)
returns public.at_courier_documents
language plpgsql security definer set search_path = public
as $$
declare
  v_doc     public.at_courier_documents;
  v_perfil  public.at_profiles;
begin
  select * into v_perfil from public.at_profiles where id = auth.uid();
  if not found then
    raise exception 'No encontramos tu perfil. Vuelve a iniciar sesión.';
  end if;

  -- El mensajero ya habilitado, y el que todavía espera a que lo habiliten.
  -- Sin la segunda rama, nadie nuevo puede entrar nunca a la operación.
  if not (
    v_perfil.role = 'mensajero'
    or (v_perfil.role = 'pendiente' and v_perfil.requested_role = 'mensajero')
  ) then
    raise exception
      'Tu cuenta no está registrada como mensajero, así que no hay documentos que subir. Si te registraste como comercio, escribe al CEDI.';
  end if;

  -- Una cuenta desactivada no sube nada. Coherente con at_estoy_activo(), que
  -- la migración 0081 metió en las políticas: suspender tiene que suspender.
  -- Los pendientes se dejan pasar aunque `active` venga en false, porque hasta
  -- que se les habilita nadie ha decidido nada sobre ellos.
  if v_perfil.role = 'mensajero' and not coalesce(v_perfil.active, false) then
    raise exception 'Tu cuenta está suspendida. Habla con el CEDI antes de subir documentos.';
  end if;

  if coalesce(trim(p_file_path), '') = '' then
    raise exception 'Falta el archivo';
  end if;

  -- El archivo tiene que estar en la carpeta del propio mensajero. Esto es lo
  -- que de verdad sostiene la seguridad de este bucket, no el rol: sin ello
  -- alguien podría registrar como suyo el archivo de otro.
  if split_part(p_file_path, '/', 1) <> auth.uid()::text then
    raise exception 'El archivo no corresponde a tu carpeta';
  end if;

  insert into public.at_courier_documents (courier_id, doc_type, file_path, expires_on)
  values (auth.uid(), p_doc_type, trim(p_file_path), p_expires_on)
  on conflict (courier_id, doc_type) do update set
    file_path    = excluded.file_path,
    expires_on   = excluded.expires_on,
    status       = 'pendiente',   -- vuelve a revisión
    review_notes = null,
    reviewed_by  = null,
    reviewed_at  = null,
    uploaded_at  = now()
  returning * into v_doc;

  return v_doc;
end $$;

comment on function public.at_register_courier_doc(public.at_doc_type, text, date) is
  'Registra un documento del mensajero. Lo puede llamar quien ya es mensajero y quien se registró como tal y espera habilitación: sin eso, nadie nuevo entra a la operación.';

revoke execute on function public.at_register_courier_doc(public.at_doc_type, text, date) from public, anon;
grant  execute on function public.at_register_courier_doc(public.at_doc_type, text, date) to authenticated;


-- ── 2. Que el pendiente pueda VER lo que subió ────────────────────────────
--
-- La política de select sobre at_courier_documents miraba courier_id =
-- auth.uid(), que ya cubre al pendiente. Se deja constancia de que se revisó y
-- no hacía falta tocarla: el mensajero nuevo ve sus propios documentos y su
-- estado de revisión desde /mi-perfil.


-- ── Comprobación ──────────────────────────────────────────────────────────
do $$
begin
  assert (
    select count(*) from pg_proc
    where proname = 'at_register_courier_doc'
      and pronamespace = 'public'::regnamespace
  ) = 1, 'la función no quedó';
end $$;
