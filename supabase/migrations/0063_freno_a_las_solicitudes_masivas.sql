-- A TIEMPO LOGÍSTICA — freno a las solicitudes masivas sobre lo que es público.
--
-- Por qué en la base y no en el middleware de Next: el navegador habla DIRECTO
-- con Supabase. La llave anónima viaja en el bundle —es pública por diseño— así
-- que cualquiera puede golpear /rest/v1/rpc/at_track_guide sin pasar jamás por
-- nuestro servidor. Un límite en el middleware no protegería nada; el único
-- sitio por donde pasan todas las peticiones es Postgres.
--
-- Qué se protege: las cinco funciones que se pueden llamar sin cuenta. No hay
-- fuga de datos por tablas (se revisó: ninguna política de RLS deja entrar a un
-- anónimo), así que el riesgo real es el volumen — y, en el rastreo por número,
-- que alguien recorra ATL-100001, ATL-100002… y se lleve el historial de
-- envíos.
--
-- Los topes se fijaron mirando lo que hace la app de verdad: la pantalla de
-- seguimiento consulta cada 30 segundos, o sea 2 por minuto. Van holgados a
-- propósito, porque los operadores móviles en Colombia meten a muchísimos
-- clientes detrás de una sola IP (CGNAT) y un tope estrecho dejaría por fuera a
-- gente que no hizo nada. Aun así, un raspador que necesita miles de peticiones
-- choca de frente.

-- ── Quién está llamando ───────────────────────────────────────────────────
-- Comprobado contra el endpoint real: en una petición anónima, Postgres sí ve
-- la IP del cliente en las cabeceras que le pasa PostgREST.
create or replace function public.at_actor_de_la_peticion()
returns text
language plpgsql stable set search_path = public
as $$
declare
  v_cab jsonb;
  v_ip  text;
begin
  -- Con sesión, el actor es la persona: sigue siendo el mismo aunque cambie de
  -- red, y así el límite no se le reinicia saltando de wifi a datos.
  if auth.uid() is not null then
    return 'uid:' || auth.uid()::text;
  end if;

  begin
    v_cab := current_setting('request.headers', true)::jsonb;
  exception when others then
    v_cab := null;
  end;

  -- cf-connecting-ip la pone Cloudflare y no se puede falsificar desde fuera.
  -- x-forwarded-for es una lista y solo el PRIMER elemento es el cliente.
  v_ip := coalesce(
    v_cab ->> 'cf-connecting-ip',
    nullif(trim(split_part(coalesce(v_cab ->> 'x-forwarded-for', ''), ',', 1)), '')
  );

  -- Sin IP visible no se inventa un actor por petición: eso volvería inútil el
  -- contador. Caen todos en el mismo cubo, que solo lo frena el tope global.
  return coalesce('ip:' || v_ip, 'sin-ip');
end $$;

comment on function public.at_actor_de_la_peticion() is
  'A quién se le cuentan las peticiones: la persona si hay sesión, la IP si no.';

-- ── El contador ───────────────────────────────────────────────────────────
-- Ventana fija: una fila por (qué, quién, minuto). Se prefirió a una ventana
-- deslizante porque cada petición cuesta un upsert por clave primaria, sin
-- recorrer nada, y eso es lo que tiene que ser barato justo cuando llueve.
create table if not exists public.at_rate_limit (
  bucket  text        not null,
  actor   text        not null,
  ventana timestamptz not null,
  golpes  int         not null default 0,
  primary key (bucket, actor, ventana)
);

alter table public.at_rate_limit enable row level security;
-- Sin políticas a propósito: nadie la toca por la API. Solo se escribe desde
-- at_limitar, que es SECURITY DEFINER.

comment on table public.at_rate_limit is
  'Contador de peticiones por ventana. Lo llena at_limitar; se purga solo con el cron at-limpiar-rate-limit.';

create index if not exists at_rate_limit_ventana_idx
  on public.at_rate_limit (ventana);

-- ── El freno ──────────────────────────────────────────────────────────────
-- Lanza con SQLSTATE PT429, que PostgREST traduce a un HTTP 429 de verdad. Sin
-- eso saldría un 500 y el navegador no distinguiría "vas muy rápido" de "esto
-- se rompió".
create or replace function public.at_limitar(
  p_bucket  text,
  p_por_ip  int,
  p_global  int,
  p_ventana interval default interval '1 minute'
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_inicio timestamptz := date_bin(p_ventana, now(), timestamptz 'epoch');
  v_mios   int;
  v_todos  int;
begin
  insert into public.at_rate_limit as rl (bucket, actor, ventana, golpes)
  values (p_bucket, public.at_actor_de_la_peticion(), v_inicio, 1)
  on conflict (bucket, actor, ventana)
    do update set golpes = rl.golpes + 1
  returning rl.golpes into v_mios;

  if v_mios > p_por_ip then
    raise exception 'Vas demasiado rápido. Espera un momento y vuelve a intentarlo.'
      using errcode = 'PT429';
  end if;

  -- Tope global del mismo cubo: es el que aguanta un ataque repartido entre
  -- muchas IPs, donde el contador por IP nunca se dispara. Se lleva en su
  -- propia fila para que comprobarlo no cueste recorrer las demás.
  insert into public.at_rate_limit as rl (bucket, actor, ventana, golpes)
  values (p_bucket, '@global', v_inicio, 1)
  on conflict (bucket, actor, ventana)
    do update set golpes = rl.golpes + 1
  returning rl.golpes into v_todos;

  if v_todos > p_global then
    raise exception 'El servicio está recibiendo demasiadas consultas. Intenta en un minuto.'
      using errcode = 'PT429';
  end if;
end $$;

comment on function public.at_limitar(text, int, int, interval) is
  'Cuenta y frena. Lanza PT429 (HTTP 429) al pasarse, por actor o en total.';

revoke execute on function public.at_limitar(text, int, int, interval) from public, anon, authenticated;

-- ── Las funciones públicas, ahora con freno ───────────────────────────────
-- Pasan de STABLE a VOLATILE porque ahora escriben el contador. No cambia cómo
-- las llama la app: supabase-js ya usa POST para las RPC.

-- Rastreo por NÚMERO de guía. Es el más expuesto: los números son correlativos
-- (ATL-100008, ATL-100009…), así que se pueden recorrer a mano. No se puede
-- cerrar sin quitarle a la gente el rastreo público, que es una función real
-- del negocio; lo que sí se puede es que recorrerlos salga carísimo en tiempo.
create or replace function public.at_track_guide(p_guide_number text)
returns json
language plpgsql volatile security definer set search_path = public
as $function$
declare v_out json;
begin
  perform public.at_limitar('rastreo_numero', 40, 1500);

  select json_build_object(
    'guide_number', g.guide_number,
    'status', g.status,
    'recipient_city', g.recipient_city,
    'created_at', g.created_at,
    'delivered_at', g.delivered_at,
    'delivery_attempts', g.delivery_attempts,
    'events', coalesce((
      select json_agg(json_build_object('status', e.status, 'created_at', e.created_at) order by e.created_at)
      from public.at_guide_events e where e.guide_id = g.id
    ), '[]'::json)
  ) into v_out
  from public.at_guides g
  where upper(g.guide_number) = upper(trim(p_guide_number));

  return v_out;
end $function$;

-- Rastreo por TOKEN. El token no se adivina, así que aquí el límite no es
-- contra la enumeración sino contra el martilleo. Va más alto porque esta
-- pantalla se refresca sola cada 30 segundos mientras el pedido va en camino.
create or replace function public.at_track_guide_by_token(p_token text)
returns json
language plpgsql volatile security definer set search_path = public
as $function$
declare v_out json;
begin
  perform public.at_limitar('rastreo_token', 120, 3000);

  select json_build_object(
    'guide_number', g.guide_number,
    'status', g.status,
    'recipient_city', g.recipient_city,
    'recipient_name', g.recipient_name,
    'created_at', g.created_at,
    'delivered_at', g.delivered_at,
    'delivery_attempts', g.delivery_attempts,
    'business_name', cl.business_name,
    'courier_name',        case when g.status = 'en_ruta' then c.full_name end,
    'courier_lat',         case when g.status = 'en_ruta' then c.last_lat end,
    'courier_lng',         case when g.status = 'en_ruta' then c.last_lng end,
    'courier_position_at', case when g.status = 'en_ruta' then c.last_position_at end,
    'events', coalesce((
      select json_agg(json_build_object('status', e.status, 'created_at', e.created_at)
             order by e.created_at)
      from public.at_guide_events e where e.guide_id = g.id
    ), '[]'::json)
  ) into v_out
  from public.at_guides g
  left join public.at_profiles c on c.id = g.courier_id
  left join public.at_clients  cl on cl.id = g.client_id
  where length(coalesce(trim(p_token), '')) >= 12
    and g.tracking_token = trim(p_token);

  return v_out;
end $function$;

-- Datos de pago. Devuelve a quién pagarle: conviene que no se pueda sondear en
-- masa aunque haga falta acertar un token de 12+ caracteres.
create or replace function public.at_payment_info(p_token text)
returns json
language plpgsql volatile security definer set search_path = public
as $function$
declare
  v_guide  public.at_guides;
  v_client public.at_clients;
  v_medios json;
begin
  if p_token is null or length(trim(p_token)) < 12 then
    return null;
  end if;

  perform public.at_limitar('pago', 60, 1500);

  select * into v_guide from public.at_guides where payment_token = trim(p_token);
  if not found then return null; end if;

  select * into v_client from public.at_clients where id = v_guide.client_id;

  select coalesce(json_agg(json_build_object(
           'kind', m.kind,
           'holder', m.holder,
           'identifier', m.identifier,
           'instructions', m.instructions
         ) order by m.sort_order, m.created_at), '[]'::json)
  into v_medios
  from public.at_payment_methods m
  where m.client_id = v_guide.client_id and m.active;

  return json_build_object(
    'guide_number', v_guide.guide_number,
    'status',       v_guide.status,
    'is_cod',       v_guide.is_cod,
    'cod_amount',   v_guide.cod_amount,
    'recipient_name', v_guide.recipient_name,
    'business_name', coalesce(v_client.business_name, 'El comercio'),
    'methods',      v_medios
  );
end $function$;

-- El registro de eventos de seguridad. Se puede llamar sin cuenta —tiene que
-- poder, si no no se podrían anotar los intentos de login fallidos— y eso lo
-- convertía en la puerta más cómoda para llenar la base de basura: su freno
-- anterior contaba por user-agent, que lo cambia el atacante en cada petición.
-- Ahora cuenta por IP, que es lo que sí le cuesta cambiar. De paso se ahorra un
-- count(*) sobre at_security_events en CADA llamada, que era el otro problema:
-- la función de auditoría se volvía más lenta cuanto más había que auditar.
create or replace function public.at_log_security_event(
  p_event_type text,
  p_severity   text default 'info',
  p_detail     jsonb default '{}'::jsonb,
  p_path       text default null,
  p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_detail   jsonb := coalesce(p_detail, '{}'::jsonb);
  v_severity text := p_severity;
begin
  if p_event_type not in (
    'login_fallido','escalar_rol_bloqueado','cambio_rol_admin',
    'mensajero_habilitado','mensajero_revocado','documento_rechazado'
  ) then
    return;
  end if;

  if v_severity not in ('info','advertencia','critico') then
    v_severity := 'info';
  end if;

  if pg_column_size(v_detail) > 4000 then
    v_detail := jsonb_build_object('truncado', true);
  end if;

  perform public.at_limitar('auditoria', 30, 900);

  insert into public.at_security_events (event_type, severity, actor_id, actor_role, detail, path, user_agent)
  values (
    p_event_type, v_severity, auth.uid(),
    case when auth.uid() is not null then public.at_my_role() else null end,
    v_detail, nullif(trim(coalesce(p_path,'')),''), nullif(trim(coalesce(p_user_agent,'')),'')
  );
exception when others then
  -- Un fallo al auditar nunca debe tumbar el flujo real de la app. Incluye
  -- pasarse del límite: al que va muy rápido no se le corta el login, solo se
  -- deja de anotar lo que ya quedó anotado veinte veces.
  return;
end $function$;

-- ── Que el contador no crezca para siempre ────────────────────────────────
create or replace function public.at_limpiar_rate_limit()
returns void
language sql security definer set search_path = public
as $$
  delete from public.at_rate_limit where ventana < now() - interval '1 hour'
$$;

select cron.unschedule('at-limpiar-rate-limit')
where exists (select 1 from cron.job where jobname = 'at-limpiar-rate-limit');

select cron.schedule(
  'at-limpiar-rate-limit',
  '*/10 * * * *',
  $$ select public.at_limpiar_rate_limit() $$
);

-- Los ayudantes del freno no son superficie pública. Se revocan explícitamente
-- porque una función nueva nace con EXECUTE para todo el mundo: at_limitar ya
-- lo tenía, pero estas dos se habían quedado abiertas. La de limpieza solo
-- borra ventanas viejas —no serviría para reiniciarse el contador— pero es un
-- DELETE gratis que cualquiera podía mandar a ejecutar en bucle.
revoke execute on function public.at_limpiar_rate_limit() from public, anon, authenticated;
revoke execute on function public.at_actor_de_la_peticion() from public, anon, authenticated;
