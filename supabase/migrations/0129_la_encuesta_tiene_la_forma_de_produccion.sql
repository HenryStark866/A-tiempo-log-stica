-- La encuesta de satisfacción, tal como estaba en producción.
--
-- Las tablas y las funciones se crearon desde el panel y ninguna migración las
-- tenía; el staging llevaba un diseño nuevo que se parecía poco al real
-- (columna snoozed_until en vez de `hasta`, 7 días de gracia en vez de 3, la
-- respuesta sin el rol). El respaldo del 2026-09-23 trae el esquema y el código
-- verdaderos: esto los deja idénticos, y es seguro correrlo sobre una base que
-- ya tenga el diseño nuevo o que ya tenga datos (renombra, no borra).
--
-- Incluye at_resumen_encuestas(), la cuarta función de este grupo, que ningún
-- stub cubría (la usa el panel de administración).

-- ── at_survey_snooze: la columna se llama `hasta` ──────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='at_survey_snooze' and column_name='snoozed_until')
     and not exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='at_survey_snooze' and column_name='hasta') then
    alter table public.at_survey_snooze rename column snoozed_until to hasta;
  end if;
end $$;
alter table public.at_survey_snooze alter column hasta set not null;

alter table public.at_survey_snooze drop constraint if exists at_survey_snooze_user_fk;
alter table public.at_survey_snooze drop constraint if exists at_survey_snooze_user_id_fkey;
alter table public.at_survey_snooze
  add constraint at_survey_snooze_user_id_fkey
  foreign key (user_id) references public.at_profiles (id) on delete cascade;

comment on table public.at_survey_snooze is
  'A quién no se le vuelve a preguntar y hasta cuándo. RLS activo y SIN políticas a propósito: se escribe desde la función que aplaza la encuesta.';

-- ── at_survey_responses: rol obligatorio, restricciones con el nombre real ─
alter table public.at_survey_responses
  add column if not exists rol        public.at_role,
  add column if not exists recomienda integer,
  add column if not exists facilidad  integer,
  add column if not exists comentario text,
  add column if not exists version    text;
alter table public.at_survey_responses alter column recomienda type integer;
alter table public.at_survey_responses alter column facilidad  type integer;

-- Una respuesta sin rol (de la reconstrucción vieja) toma el rol actual de su autora.
update public.at_survey_responses r
   set rol = p.role
  from public.at_profiles p
 where r.rol is null and p.id = r.user_id;

do $$
begin
  if not exists (select 1 from public.at_survey_responses where rol is null) then
    alter table public.at_survey_responses alter column rol set not null;
  end if;
  if not exists (select 1 from public.at_survey_responses where recomienda is null) then
    alter table public.at_survey_responses alter column recomienda set not null;
  end if;
  if not exists (select 1 from public.at_survey_responses where user_id is null) then
    alter table public.at_survey_responses alter column user_id set not null;
  end if;
end $$;

alter table public.at_survey_responses drop constraint if exists at_survey_recomienda_0_10;
alter table public.at_survey_responses drop constraint if exists at_survey_facilidad_1_5;
alter table public.at_survey_responses drop constraint if exists at_survey_comentario_largo;
alter table public.at_survey_responses drop constraint if exists at_survey_responses_recomienda_check;
alter table public.at_survey_responses drop constraint if exists at_survey_responses_facilidad_check;
alter table public.at_survey_responses
  add constraint at_survey_responses_recomienda_check check (recomienda >= 0 and recomienda <= 10);
alter table public.at_survey_responses
  add constraint at_survey_responses_facilidad_check check (facilidad >= 1 and facilidad <= 5);

-- Borrar a la persona borra sus respuestas; borrar el comercio deja la respuesta sin comercio.
alter table public.at_survey_responses drop constraint if exists at_survey_responses_user_fk;
alter table public.at_survey_responses drop constraint if exists at_survey_responses_client_fk;
alter table public.at_survey_responses drop constraint if exists at_survey_responses_user_id_fkey;
alter table public.at_survey_responses drop constraint if exists at_survey_responses_client_id_fkey;
alter table public.at_survey_responses
  add constraint at_survey_responses_user_id_fkey
  foreign key (user_id) references public.at_profiles (id) on delete cascade;
alter table public.at_survey_responses
  add constraint at_survey_responses_client_id_fkey
  foreign key (client_id) references public.at_clients (id) on delete set null;

comment on table public.at_survey_responses is
  'Encuesta opcional de satisfacción. Se guarda el rol para poder leer por separado lo que dice un mensajero y lo que dice un comercio: usan apps distintas.';

-- ── Funciones ──────────────────────────────────────────────────────────────
-- at_encuesta_pendiente cambia de jsonb a json: CREATE OR REPLACE no puede.
drop function if exists public.at_encuesta_pendiente();

create or replace function public.at_encuesta_pendiente() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'mostrar',
      auth.uid() is not null
      -- Una cuenta recién creada no tiene nada que opinar todavía.
      and exists (select 1 from public.at_profiles p
                  where p.id = auth.uid() and p.active
                    and p.role not in ('pendiente')
                    and p.created_at < now() - interval '3 days')
      and not exists (select 1 from public.at_survey_responses r
                      where r.user_id = auth.uid()
                        and r.created_at > now() - interval '90 days')
      and not exists (select 1 from public.at_survey_snooze s
                      where s.user_id = auth.uid() and s.hasta > now())
  )
$$;

create or replace function public.at_posponer_encuesta(p_dias integer DEFAULT 30) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  insert into public.at_survey_snooze (user_id, hasta)
  values (auth.uid(), now() + make_interval(days => greatest(coalesce(p_dias,30), 1)))
  on conflict (user_id) do update set hasta = excluded.hasta;
end $$;

create or replace function public.at_responder_encuesta(p_recomienda integer, p_facilidad integer DEFAULT NULL::integer, p_comentario text DEFAULT NULL::text, p_version text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_p public.at_profiles;
begin
  select * into v_p from public.at_profiles where id = auth.uid();
  if not found then raise exception 'No autorizado'; end if;

  if p_recomienda is null or p_recomienda < 0 or p_recomienda > 10 then
    raise exception 'La puntuación va de 0 a 10';
  end if;

  insert into public.at_survey_responses
    (user_id, rol, client_id, recomienda, facilidad, comentario, version)
  values
    (v_p.id, v_p.role, v_p.client_id, p_recomienda,
     case when p_facilidad between 1 and 5 then p_facilidad end,
     nullif(trim(coalesce(p_comentario,'')), ''),
     nullif(trim(coalesce(p_version,'')), ''));

  delete from public.at_survey_snooze where user_id = v_p.id;
end $$;

create or replace function public.at_resumen_encuestas() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;

  return json_build_object(
    'total', (select count(*) from public.at_survey_responses),
    'nps', (
      select case when count(*) = 0 then null else
        round(100.0 * (count(*) filter (where recomienda >= 9)
                     - count(*) filter (where recomienda <= 6)) / count(*), 0)
      end
      from public.at_survey_responses where created_at > now() - interval '180 days'
    ),
    'promedio_facilidad', (
      select round(avg(facilidad)::numeric, 1) from public.at_survey_responses
      where facilidad is not null and created_at > now() - interval '180 days'
    ),
    'por_rol', (
      select coalesce(json_agg(json_build_object(
               'rol', rol, 'respuestas', n, 'promedio', prom) order by rol), '[]'::json)
      from (select rol, count(*) n, round(avg(recomienda)::numeric,1) prom
            from public.at_survey_responses group by rol) x
    ),
    'comentarios', (
      select coalesce(json_agg(json_build_object(
               'rol', rol, 'recomienda', recomienda,
               'comentario', comentario, 'created_at', created_at)
             order by created_at desc), '[]'::json)
      from (select * from public.at_survey_responses
            where comentario is not null order by created_at desc limit 50) c
    )
  );
end $$;


revoke execute on function public.at_encuesta_pendiente()                             from public, anon;
revoke execute on function public.at_posponer_encuesta(integer)                       from public, anon;
revoke execute on function public.at_responder_encuesta(integer, integer, text, text) from public, anon;
revoke execute on function public.at_resumen_encuestas()                              from public, anon;
grant  execute on function public.at_encuesta_pendiente()                             to authenticated, service_role;
grant  execute on function public.at_posponer_encuesta(integer)                       to authenticated, service_role;
grant  execute on function public.at_responder_encuesta(integer, integer, text, text) to authenticated, service_role;
grant  execute on function public.at_resumen_encuestas()                              to authenticated, service_role;
