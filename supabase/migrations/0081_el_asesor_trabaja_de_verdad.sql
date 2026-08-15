-- A TIEMPO LOGÍSTICA — el asesor puede trabajar, y suspenderlo lo suspende.
--
-- Dos agujeros que se descubrieron juntos y se tapan juntos, porque el segundo
-- se abre de par en par justo cuando se arregla el primero.
--
-- ── 1. El asesor no podía crear un pedido ────────────────────────────────
-- El rol existe desde 0073, tiene menú, tiene pantalla de aprobación, y las RPC
-- (at_request_pickup, at_update_guide, at_my_shipments…) ya lo contemplaban. Lo
-- que faltaba estaba una capa más abajo: la política de INSERT de at_guides
-- exigía literalmente at_my_role() = 'cliente', y /pedidos/nueva inserta DIRECTO
-- en la tabla, sin pasar por una RPC. Al asesor le rebotaba el INSERT.
--
-- No daba un error entendible: RLS no dice "no puedes", devuelve una violación
-- de política. En pantalla eso es un mensaje rojo que no explica nada. Por eso
-- nadie lo había visto: había que ser asesor Y llegar hasta el botón de guardar.
--
-- ── 2. Suspender a un asesor no lo suspendía ─────────────────────────────
-- Este es el serio. NINGUNA política de RLS miraba `active` — ninguna, de todas
-- las de la base. El dueño de un comercio le da a "suspender" en Mi equipo,
-- at_actualizar_asesor pone active = false, la pantalla lo pinta suspendido…
-- y la persona sigue entrando y trabajando igual. Conserva su rol y su
-- client_id, que es lo único que miraban las políticas.
--
-- Importa ahora más que nunca: los asesores pasan a ser quienes más usan la
-- app, y son gente que rota — se van, los cambian de comercio, los despiden. El
-- botón de suspender tiene que suspender de verdad, no pintar un estado.
--
-- Se comprobó antes de aplicar: los 9 perfiles de producción están active =
-- true. Nadie se queda fuera por este cambio.
--
-- Se aplica a TODOS los roles del comercio, no solo al asesor: una cuenta
-- desactivada es una cuenta desactivada, y dejar viva la del dueño mientras se
-- cierra la del empleado sería tapar la mitad del agujero.

-- ── ¿Sigue viva esta cuenta? ──────────────────────────────────────────────
-- Sin argumentos a propósito: Postgres la evalúa una sola vez por consulta
-- (InitPlan) en vez de una por fila, así que meterla en las políticas no cuesta
-- nada aunque la tabla crezca.
create or replace function public.at_estoy_activo()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(active, false) from public.at_profiles where id = auth.uid() $$;

comment on function public.at_estoy_activo() is
  'Si la cuenta de quien llama sigue habilitada. Lo usan las políticas de RLS para que suspender a alguien lo suspenda de verdad.';

-- ── Crear pedidos ─────────────────────────────────────────────────────────
-- La rama del comercio pasa de 'cliente' a ('cliente','asesor'). La de staff se
-- queda igual: el personal de A Tiempo no tiene client_id, se rige por CEDI.
drop policy if exists "staff o cliente crea guías propias" on public.at_guides;

create policy "staff o comercio crea guías propias"
on public.at_guides for insert to authenticated
with check (
  (public.at_is_staff() and public.at_puede_ver_facility(facility_id))
  or (
    public.at_my_role() in ('cliente','asesor')
    and public.at_estoy_activo()
    and client_id = public.at_my_client()
    and status = 'creada'::public.at_guide_status
  )
);

-- ── Pedir recogidas ───────────────────────────────────────────────────────
-- at_request_pickup es SECURITY DEFINER y ya dejaba pasar al asesor, así que
-- por ahí funcionaba. Se corrige igual: que la política diga una cosa y la RPC
-- otra es la clase de desacuerdo que muerde el día que alguien inserte directo.
drop policy if exists "cliente solicita recogida propia" on public.at_pickups;

create policy "el comercio solicita su recogida"
on public.at_pickups for insert to authenticated
with check (
  (
    public.at_my_role() in ('cliente','asesor')
    and public.at_estoy_activo()
    and client_id = public.at_my_client()
    and status = 'pendiente'::public.at_pickup_status
  )
  or (public.at_is_staff() and public.at_puede_ver_facility(facility_id))
);

-- ── Catálogo y compradores ────────────────────────────────────────────────
-- Estas dos ya dejaban entrar al asesor sin nombrarlo: solo miran
-- client_id = at_my_client(), y at_my_client() devuelve el comercio de quien
-- sea. O sea que el asesor SÍ podía leer y editar productos y destinatarios
-- —que es justamente lo que se quiere— pero el suspendido también.
drop policy if exists "cliente administra sus productos" on public.at_products;

create policy "el comercio administra sus productos"
on public.at_products for all to authenticated
using      (client_id = public.at_my_client() and public.at_estoy_activo())
with check (client_id = public.at_my_client() and public.at_estoy_activo());

drop policy if exists "cliente administra sus destinatarios" on public.at_recipients;

create policy "el comercio administra sus destinatarios"
on public.at_recipients for all to authenticated
using      (client_id = public.at_my_client() and public.at_estoy_activo())
with check (client_id = public.at_my_client() and public.at_estoy_activo());

-- ── El precio sale de la sede de quien lo pide ────────────────────────────
-- at_precio_domicilio acepta la sede desde 0072, pero at_mi_tarifario nunca se
-- la pasaba: cotizaba siempre desde la zona del comercio. Con multisede eso
-- está mal — un asesor de la sede de Bello le cobraba al comprador el domicilio
-- como si el paquete saliera de la sede principal.
--
-- El coalesce es el mismo que ya hace at_request_pickup: la sede de la persona
-- si tiene una asignada, y si no la principal del comercio.
create or replace function public.at_mi_tarifario()
returns json
language sql stable security definer set search_path = public
as $function$
  select coalesce(json_agg(t order by t.sort_order), '[]'::json)
  from (
    select z.id, z.name, z.coverage, z.sort_order,
           public.at_precio_domicilio(
             public.at_my_client(),
             z.id,
             coalesce(
               (select p.site_id from public.at_profiles p where p.id = auth.uid()),
               (select s.id from public.at_client_sites s
                 where s.client_id = public.at_my_client()
                   and s.es_principal and s.active limit 1)
             )
           ) as delivery_rate,
           z.id = (select zone_id from public.at_clients where id = public.at_my_client()) as es_mi_zona
    from public.at_zones z
    where z.active
      and z.facility_id = coalesce(
        (select facility_id from public.at_clients where id = public.at_my_client()),
        (select id from public.at_facilities where is_default limit 1)
      )
  ) t
$function$;

comment on function public.at_mi_tarifario() is
  'Lo que le cuesta a quien llama mandar a cada zona, calculado desde SU sede.';

-- ── La sede del pedido se pone sola ───────────────────────────────────────
-- at_guides.site_id existe desde 0072 y la app nunca lo llenaba. Se rellena en
-- la base y no solo en el formulario, para que valga también para lo que entra
-- por Shopify, por la cola sin señal o por una importación de CSV.
create or replace function public.at_sede_de_la_guia()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select p.site_id from public.at_profiles p where p.id = new.created_by),
      (select s.id from public.at_client_sites s
        where s.client_id = new.client_id and s.es_principal and s.active limit 1)
    );
  end if;
  return new;
end $$;

drop trigger if exists at_sede_de_la_guia on public.at_guides;
create trigger at_sede_de_la_guia
  before insert on public.at_guides
  for each row execute function public.at_sede_de_la_guia();
