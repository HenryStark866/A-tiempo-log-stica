-- A TIEMPO LOGÍSTICA — el dato de cobro, ahora con la cuenta en partes.
--
-- Reemplaza la regla que puso 0097. Aquella exigía que una cuenta de
-- Bancolombia fuera solo dígitos, y con eso el comercio se quedaba sin dónde
-- decir si era de ahorros o corriente: el formulario pedía banco, tipo y
-- número en una sola casilla que a la vez prohibía las letras. No cuadraba.
--
-- Desde hoy el formulario los pide por separado y los une para guardarlos, de
-- modo que `identifier` sigue siendo un solo texto —la tabla y la vista
-- pública del QR no cambian de forma— pero con una estructura reconocible:
--
--   otro_banco  →  «Banco de Bogotá - Ahorros - 12345678»
--   bancolombia →  «Ahorros - 12345678»
--   nequi       →  «3001234567»
--   link        →  «https://…»
--   efectivo    →  null
--
-- Va aparte y no editando 0097 porque 0097 puede estar ya aplicado en la
-- nube. Esta migración se para sobre cualquiera de los dos escenarios: quita
-- la restricción anterior si existe y deja la nueva.
--
-- Nequi y Daviplata dejan de exigir diez dígitos exactos. Las llaves Bre-B
-- admiten un correo, un @usuario o una cédula, y amarrarlas al celular era
-- cerrarle la puerta al comercio que ya cobra así.

alter table public.at_payment_methods
  drop constraint if exists at_payment_methods_dato_coherente;

alter table public.at_payment_methods
  add constraint at_payment_methods_dato_coherente check (
    case
      -- Efectivo no cobra por ningún lado: el dato sobra.
      when kind = 'efectivo'
        then identifier is null or btrim(identifier) = ''

      -- Cuentas bancarias: lo que se guarda termina SIEMPRE en « - » seguido
      -- del número. Eso es lo que permite volver a separarlo al editar y, en
      -- el QR público, copiar solo el número —pegar «Ahorros - 12345» en la
      -- app del banco no le sirve a nadie—.
      --
      -- El `is not null` no sobra: en SQL `null ~ '…'` no es falso sino null,
      -- y un CHECK que da null SE APRUEBA. Sin él se podría guardar una cuenta
      -- sin número y el QR mostraría un medio de cobro vacío.
      when kind in ('bancolombia', 'otro_banco')
        then identifier is not null
         and identifier ~ '^[^[:cntrl:]]+ - [0-9]{6,20}$'
         and length(identifier) <= 120

      -- El link tiene que ser una URL de verdad y sin espacios, que es lo que
      -- delata un texto pegado a medias.
      when kind = 'link'
        then identifier is not null
         and identifier ~* '^https?://[^[:space:]]{3,}$'

      -- Billeteras: una llave alfanumérica, con contenido y de largo sensato.
      else
        identifier is not null
        and btrim(identifier) <> ''
        and length(identifier) <= 60
        and identifier !~ '[[:cntrl:]]'
    end
  ) not valid;

comment on constraint at_payment_methods_dato_coherente on public.at_payment_methods is
  'El identificador tiene la forma que le corresponde a su medio: «… - Tipo - número» en cuentas bancarias, URL en el link, texto alfanumérico en billeteras, nulo en efectivo. NOT VALID: los medios guardados antes quedan tal como estaban.';

-- ── Para el día que se quiera limpiar lo viejo ─────────────────────────
-- Los medios que hoy NO cumplirían. Son datos de cobro de un comercio real:
-- ejecutar a mano, revisarlos uno por uno y pedirle al comercio que los
-- vuelva a escribir en el formulario nuevo. NO corregirlos a mano adivinando.
--
--   select c.business_name, m.id, m.kind, m.identifier
--   from public.at_payment_methods m
--   join public.at_clients c on c.id = m.client_id
--   where m.active
--     and case
--           when m.kind = 'efectivo'
--             then not (m.identifier is null or btrim(m.identifier) = '')
--           when m.kind in ('bancolombia','otro_banco')
--             then coalesce(m.identifier !~ '^[^[:cntrl:]]+ - [0-9]{6,20}$', true)
--           when m.kind = 'link'
--             then coalesce(m.identifier !~* '^https?://[^[:space:]]{3,}$', true)
--           else m.identifier is null or btrim(m.identifier) = '' or length(m.identifier) > 60
--         end
--   order by c.business_name;
--
-- Cuando ya no salga ninguno, se puede sellar con:
--   alter table public.at_payment_methods
--     validate constraint at_payment_methods_dato_coherente;
