-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE SE ENCOLÓ SIN SEÑAL NO SE DUPLICA AL VOLVER
--
-- La cola sin conexión reintenta lo que no pudo salir. El problema es el caso
-- en que la petición SÍ llegó al servidor y se ejecutó, pero la respuesta se
-- perdió de vuelta: la red se cayó en ese medio segundo, o el móvil cambió de
-- antena. Para el teléfono eso es indistinguible de «no llegó», así que lo
-- guarda y lo reintenta al recuperar señal.
--
-- Para un cambio de estado da igual: la máquina de estados rechaza el segundo
-- intento y queda como conflicto visible. Pero crear un pedido o pedir una
-- recogida no tienen esa protección: el segundo intento crea OTRO. Dos guías
-- para el mismo envío son dos rótulos, dos domicilios cobrados al comercio y
-- un paquete fantasma que el CEDI espera y nunca llega.
--
-- La solución es que el teléfono diga QUÉ petición es. La cola ya le pone un
-- identificador único a cada acción al encolarla; ahora ese identificador
-- viaja al servidor y se guarda. Si vuelve el mismo, ya no es una petición
-- nueva: es la misma de antes, que sí se había ejecutado.
--
-- Índice único PARCIAL: solo aplica a las filas que traen identificador. Todo
-- lo que se crea con señal —la inmensa mayoría— sigue sin traerlo y no compite
-- por nada.
--
-- Verificado al aplicarlo: reintentar el mismo pedido da 23505 y queda UNO.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_guides
  add column if not exists client_request_id uuid;

comment on column public.at_guides.client_request_id is
  'Identificador que pone el dispositivo al encolar el pedido sin señal. Impide que un reintento cree un duplicado cuando la respuesta se perdió de vuelta. NULL en todo lo creado con conexión.';

create unique index if not exists at_guides_client_request_id_key
  on public.at_guides (client_request_id)
  where client_request_id is not null;

alter table public.at_pickups
  add column if not exists client_request_id uuid;

comment on column public.at_pickups.client_request_id is
  'Lo mismo que en at_guides: evita que una recogida encolada sin señal se pida dos veces al reconectar.';

create unique index if not exists at_pickups_client_request_id_key
  on public.at_pickups (client_request_id)
  where client_request_id is not null;
