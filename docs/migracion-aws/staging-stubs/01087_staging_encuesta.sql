-- ENCUESTA DE SATISFACCIÓN — DISEÑO NUEVO, NO RECUPERACIÓN.
--
-- El frontend (src/components/EncuestaSatisfaccion.tsx) llama a tres funciones que
-- ninguna migración crea: at_encuesta_pendiente, at_responder_encuesta y
-- at_posponer_encuesta. Las tablas existen (stubs mínimos en 0000_staging_stubs.sql)
-- pero sin las columnas de la respuesta. Lo que sigue las completa y escribe las
-- funciones.
--
-- Cada decisión está marcada así:
--   DATO    = lo dice el repo (componente, migraciones 0105/0106/0107, nombres de
--             los parámetros).
--   DISEÑO  = lo decidí yo al reconstruir; producción pudo hacerlo distinto.
-- Hay un resumen en LEEME.md.
--
-- Va en 01087_ porque necesita que at_profiles y at_clients existan (claves
-- foráneas), y se ejecuta después de las migraciones 0105 a 0107, que ya alteran
-- la política, comentan y indexan estas tablas.

-- ── Tabla de respuestas ───────────────────────────────────────────────────
-- DATO: user_id (la política de la 0105 compara user_id con auth.uid()) y
--       client_id (índice parcial de la 0107).
-- DATO: recomienda, facilidad, comentario y version salen de los parámetros de la
--       RPC (p_recomienda, p_facilidad, p_comentario, p_version).
-- DISEÑO: el tipo y el nombre de cada columna, y las claves foráneas con
--       SET NULL: borrar a la persona o al comercio no borra la respuesta, la
--       deja anónima (la encuesta mide la app, no a la persona).
alter table public.at_survey_responses
  add column if not exists recomienda smallint,
  add column if not exists facilidad smallint,
  add column if not exists comentario text,
  add column if not exists version text;

alter table public.at_survey_responses alter column recomienda set not null;

-- DATO: la escala es de 0 a 10 (recomienda) y de 1 a 5 (facilidad, opcional).
alter table public.at_survey_responses drop constraint if exists at_survey_recomienda_0_10;
alter table public.at_survey_responses
  add constraint at_survey_recomienda_0_10 check (recomienda between 0 and 10);
alter table public.at_survey_responses drop constraint if exists at_survey_facilidad_1_5;
alter table public.at_survey_responses
  add constraint at_survey_facilidad_1_5 check (facilidad is null or facilidad between 1 and 5);
-- DISEÑO: tope del comentario.
alter table public.at_survey_responses drop constraint if exists at_survey_comentario_largo;
alter table public.at_survey_responses
  add constraint at_survey_comentario_largo check (comentario is null or char_length(comentario) <= 2000);

alter table public.at_survey_responses drop constraint if exists at_survey_responses_user_fk;
alter table public.at_survey_responses
  add constraint at_survey_responses_user_fk
  foreign key (user_id) references public.at_profiles (id) on delete set null;
alter table public.at_survey_responses drop constraint if exists at_survey_responses_client_fk;
alter table public.at_survey_responses
  add constraint at_survey_responses_client_fk
  foreign key (client_id) references public.at_clients (id) on delete set null;

comment on table public.at_survey_responses is
  'Respuestas de la encuesta de satisfacción (NPS de 0 a 10 y facilidad de 1 a 5). Se escriben solo desde at_responder_encuesta. Esquema reconstruido: ver docs/migracion-aws/staging-stubs/LEEME.md.';

-- ── Tabla de aplazamientos ────────────────────────────────────────────────
-- DATO: user_id y "hasta cuándo" (comentario de la 0106: «A quién no se le vuelve a
--       preguntar y hasta cuándo»; sin políticas a propósito).
-- DISEÑO: el nombre snoozed_until y la clave foránea con CASCADE (sin la persona,
--       el aplazamiento no significa nada).
alter table public.at_survey_snooze alter column snoozed_until set not null;
alter table public.at_survey_snooze drop constraint if exists at_survey_snooze_user_fk;
alter table public.at_survey_snooze
  add constraint at_survey_snooze_user_fk
  foreign key (user_id) references public.at_profiles (id) on delete cascade;

-- ── at_encuesta_pendiente() ───────────────────────────────────────────────
-- DATO: sin argumentos; devuelve un objeto con la clave `mostrar` (booleano), que
--       es lo único que lee el componente. No aparece "los primeros días". Quien la
--       cierra no la vuelve a ver en un mes y quien responde, en tres.
-- DISEÑO: «los primeros días» = 7 días desde que se creó la cuenta (el repo no
--       dice cuántos). No se muestra a cuentas pendientes ni inactivas. Sin
--       sesión devuelve mostrar=false en vez de fallar (pero el permiso es solo
--       para `authenticated`, como los demás auxiliares de la 0100).
create or replace function public.at_encuesta_pendiente()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.at_profiles;
  v_hasta timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('mostrar', false);
  end if;

  select * into v_perfil from public.at_profiles where id = v_uid;
  if not found or v_perfil.role = 'pendiente' or not v_perfil.active then
    return jsonb_build_object('mostrar', false);
  end if;

  if v_perfil.created_at > now() - interval '7 days' then
    return jsonb_build_object('mostrar', false);
  end if;

  select s.snoozed_until into v_hasta from public.at_survey_snooze s where s.user_id = v_uid;
  if v_hasta is not null and v_hasta > now() then
    return jsonb_build_object('mostrar', false);
  end if;

  return jsonb_build_object('mostrar', true);
end $$;

-- ── at_posponer_encuesta(p_dias) ──────────────────────────────────────────
-- DATO: un parámetro p_dias (el componente lo llama con 30); el resultado no se usa.
-- DISEÑO: se acota entre 1 y 365 días para que un valor absurdo no esconda la
--       encuesta para siempre; por omisión 30.
create or replace function public.at_posponer_encuesta(p_dias integer default 30)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_dias integer := greatest(1, least(coalesce(p_dias, 30), 365));
begin
  if v_uid is null then
    raise exception 'No autorizado';
  end if;

  insert into public.at_survey_snooze (user_id, snoozed_until)
  values (v_uid, now() + make_interval(days => v_dias))
  on conflict (user_id) do update set snoozed_until = excluded.snoozed_until;
end $$;

-- ── at_responder_encuesta(...) ────────────────────────────────────────────
-- DATO: p_recomienda (obligatorio, 0 a 10), p_facilidad (opcional, 1 a 5),
--       p_comentario (opcional) y p_version (opcional, el componente manda
--       NEXT_PUBLIC_VERSION); el resultado no se usa, solo si hay error. Quien
--       responde no vuelve a verla en tres meses.
-- DISEÑO: «tres meses» = 90 días; el comentario se recorta y vale NULL si queda
--       vacío (máximo 2.000 caracteres); la versión se recorta a 64; el comercio
--       se toma de at_my_client() (null para el personal); las cuentas pendientes
--       no pueden responder; los mensajes de error son míos.
create or replace function public.at_responder_encuesta(
  p_recomienda integer,
  p_facilidad integer default null,
  p_comentario text default null,
  p_version text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.at_profiles;
  v_comentario text := nullif(trim(p_comentario), '');
begin
  if v_uid is null then
    raise exception 'No autorizado';
  end if;

  select * into v_perfil from public.at_profiles where id = v_uid;
  if not found or v_perfil.role = 'pendiente' or not v_perfil.active then
    raise exception 'No autorizado';
  end if;

  if p_recomienda is null or p_recomienda < 0 or p_recomienda > 10 then
    raise exception 'La recomendación debe ser un número de 0 a 10'
      using errcode = 'check_violation';
  end if;
  if p_facilidad is not null and (p_facilidad < 1 or p_facilidad > 5) then
    raise exception 'La facilidad debe ser un número de 1 a 5'
      using errcode = 'check_violation';
  end if;
  if v_comentario is not null and char_length(v_comentario) > 2000 then
    raise exception 'El comentario es demasiado largo (máximo 2.000 caracteres)'
      using errcode = 'check_violation';
  end if;

  insert into public.at_survey_responses (user_id, client_id, recomienda, facilidad, comentario, version)
  values (v_uid, public.at_my_client(), p_recomienda, p_facilidad, v_comentario,
          left(nullif(trim(p_version), ''), 64));

  insert into public.at_survey_snooze (user_id, snoozed_until)
  values (v_uid, now() + interval '90 days')
  on conflict (user_id) do update set snoozed_until = excluded.snoozed_until;
end $$;

-- ── Permisos: solo con sesión (igual que los auxiliares de la 0100) ─────────
revoke execute on function public.at_encuesta_pendiente() from public, anon;
revoke execute on function public.at_posponer_encuesta(integer) from public, anon;
revoke execute on function public.at_responder_encuesta(integer, integer, text, text) from public, anon;
grant execute on function public.at_encuesta_pendiente() to authenticated;
grant execute on function public.at_posponer_encuesta(integer) to authenticated;
grant execute on function public.at_responder_encuesta(integer, integer, text, text) to authenticated;
