-- A TIEMPO LOGÍSTICA — el medio de pago se captura por partes.
--
-- El formulario de Mi perfil ya no pregunta «medio» y «dato» en dos casillas
-- sueltas: pregunta primero la CATEGORÍA (cuenta bancaria, billetera, enlace)
-- y luego lo que esa categoría necesita —banco, tipo y número; o plataforma y
-- llave; o nombre y enlace—. Eso permite exigir que un número de cuenta sea un
-- número, que era imposible cuando en la misma casilla iba «Bancolombia».
--
-- La tabla NO cambia de forma. Siguen siendo las mismas columnas, `kind` e
-- `identifier`, y `at_payment_info` devuelve exactamente los mismos campos: la
-- vista pública del QR no cambió de contrato. Lo que cambia es qué se escribe
-- en ellas:
--
--   Davivienda ahorros   → kind 'otro_banco'   id 'Davivienda - Ahorros - 12345678'
--   Bancolombia ahorros  → kind 'bancolombia'  id 'Ahorros - 12345678'
--   Nequi                → kind 'nequi'        id '3001234567'
--   Dale!                → kind 'billetera'    id 'Dale! - 3001234567'
--   Link de Wompi        → kind 'link'         id 'Link de Wompi - https://…'
--   Efectivo             → kind 'efectivo'     id 'Efectivo al mensajero'
--
-- La regla del identificador, en una frase: **la última parte es el dato con
-- el que se paga y todo lo de antes es contexto.** Con eso el QR muestra la
-- marca de título, el contexto pequeño, y copia SOLO el dato —pegar «Ahorros -
-- 12345» en la app del banco no le sirve a nadie—.

-- ── 1. `kind` necesita dos casillas más ────────────────────────────────
--
-- Esto es lo único del esquema que hubo que tocar, y no se pudo evitar: el
-- CHECK de la migración 0017 solo admite seis valores, todos ellos marcas
-- concretas (nequi, daviplata, bancolombia) o casos sueltos. Una billetera
-- Dale! o un cobro por Wompi no caben en ninguno, y meterlos a la fuerza en
-- 'otro_banco' o en 'link' haría que el QR le dijera «Otro banco» a quien va a
-- pagarle a una billetera, o que pusiera un botón «Abrir link» apuntando a un
-- número de celular.
--
-- No se agregan columnas, ni se quitan valores, ni se toca ninguna fila.

alter table public.at_payment_methods
  drop constraint if exists at_payment_methods_kind_check;

alter table public.at_payment_methods
  add constraint at_payment_methods_kind_check check (
    kind in (
      'nequi', 'daviplata', 'bancolombia', 'otro_banco',
      'billetera',   -- billetera que no es Nequi ni Daviplata
      'link',
      'otro',        -- un dato de cobro que no es cuenta, ni billetera, ni link
      'efectivo'
    )
  );

comment on column public.at_payment_methods.kind is
  'Casilla gruesa del medio, no la marca. La marca exacta (Davivienda, Dale!, Wompi) viaja adelante del identificador.';

-- ── 2. El identificador, con la forma nueva ────────────────────────────
--
-- Reemplaza la regla de 0097/0098. Va aquí y no editando aquellas porque
-- pueden estar ya aplicadas en la nube, y `supabase db push` no vuelve a
-- correr una migración registrada: la base se habría quedado con la regla
-- vieja y el comercio se llevaría un error crudo de Postgres al guardar. Esta
-- se para sobre cualquiera de los escenarios.

alter table public.at_payment_methods
  drop constraint if exists at_payment_methods_dato_coherente;

alter table public.at_payment_methods
  add constraint at_payment_methods_dato_coherente check (
    case
      -- Cuentas bancarias: lo guardado termina SIEMPRE en « - » seguido del
      -- número. Eso es lo que permite volver a repartirlo en los campos al
      -- editar y copiar solo el número en el QR.
      --
      -- El `is not null` no sobra: en SQL `null ~ '…'` no es falso sino null,
      -- y un CHECK que da null SE APRUEBA. Sin él se podría guardar una cuenta
      -- sin número y el QR mostraría un medio de cobro vacío.
      when kind in ('bancolombia', 'otro_banco')
        then identifier is not null
         and identifier ~ '^[^[:cntrl:]]+ - [0-9]{6,20}$'
         and length(identifier) <= 120

      -- El link tiene que terminar en una URL de verdad y sin espacios, que es
      -- lo que delata un texto pegado a medias. Puede llevar un nombre
      -- adelante: «Link de Wompi - https://…».
      when kind = 'link'
        then identifier is not null
         and identifier ~* '(^|.* - )https?://[^[:space:]]{3,}$'
         and length(identifier) <= 360

      -- Efectivo: no hay dato que copiar, pero sí un nombre que mostrar. Se
      -- admite vacío por los medios registrados antes de este formulario.
      when kind = 'efectivo'
        then identifier is null or length(identifier) <= 120

      -- Billeteras y «otro»: con contenido, de largo sensato y sin caracteres
      -- de control, que solo llegan de un copiar y pegar accidentado.
      --
      -- El tope es 360 y no 120 porque en «Enlace de Pago / Otro» el campo del
      -- dato admite hasta 300 caracteres —es el mismo campo donde va una URL—
      -- y ahí la casilla es 'otro' cuando lo escrito no empieza por http. La
      -- base tiene que ser al menos tan ancha como el formulario; el que
      -- aprieta es el formulario, no ella.
      else
        identifier is not null
        and btrim(identifier) <> ''
        and length(identifier) <= 360
        and identifier !~ '[[:cntrl:]]'
    end
  ) not valid;

comment on constraint at_payment_methods_dato_coherente on public.at_payment_methods is
  'El identificador tiene la forma «contexto - contexto - dato»: la última parte es el dato de cobro y lo de antes es la marca y el detalle. NOT VALID: los medios guardados antes quedan tal como estaban.';

-- ── Para el día que se quiera limpiar lo viejo ─────────────────────────
-- Los medios que hoy NO cumplirían. Son datos de cobro de un comercio real:
-- ejecutar a mano, revisarlos uno por uno y pedirle al comercio que los vuelva
-- a escribir en el formulario nuevo. NO corregirlos a mano adivinando.
--
--   select c.business_name, m.id, m.kind, m.identifier
--   from public.at_payment_methods m
--   join public.at_clients c on c.id = m.client_id
--   where m.active
--     and case
--           when m.kind in ('bancolombia','otro_banco')
--             then coalesce(m.identifier !~ '^[^[:cntrl:]]+ - [0-9]{6,20}$', true)
--           when m.kind = 'link'
--             then coalesce(m.identifier !~* '(^|.* - )https?://[^[:space:]]{3,}$', true)
--           when m.kind = 'efectivo'
--             then coalesce(length(m.identifier) > 120, false)
--           else m.identifier is null or btrim(m.identifier) = '' or length(m.identifier) > 360
--         end
--   order by c.business_name;
--
-- Cuando ya no salga ninguno, se puede sellar con:
--   alter table public.at_payment_methods
--     validate constraint at_payment_methods_dato_coherente;
