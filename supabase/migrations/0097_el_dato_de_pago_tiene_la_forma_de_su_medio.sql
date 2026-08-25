-- A TIEMPO LOGÍSTICA — el dato de cobro tiene que tener la forma de su medio.
--
-- Quien recibe el paquete abre el QR de pago con el celular en una mano y el
-- paquete en la otra, y copia el dato para pegarlo en su app del banco. Si el
-- comercio escribió «Bancolombia ahorros 4567 890» donde va un número de
-- cuenta, lo que se copia no sirve: la transferencia falla, el destinatario
-- desconfía del cobro y el mensajero se queda parado en la puerta.
--
-- El formulario de Mi perfil ya filtra lo que se teclea, pero no es la única
-- puerta a esta tabla: la política «cliente administra sus medios de pago» le
-- abre INSERT y UPDATE directos a cualquiera con la sesión iniciada, y
-- PostgREST está publicado. La regla tiene que estar también aquí.
--
-- Va como NOT VALID a propósito. Los medios ya guardados se quedan como están
-- —no se le borra a nadie su forma de cobrar por un cambio de criterio— pero
-- desde hoy ninguna fila nueva ni ninguna edición puede violarla. El día que
-- se quiera limpiar lo viejo, la consulta que los encuentra está al final.

alter table public.at_payment_methods
  drop constraint if exists at_payment_methods_dato_coherente;

alter table public.at_payment_methods
  add constraint at_payment_methods_dato_coherente check (
    case kind
      -- Efectivo no cobra por ningún lado: el dato sobra.
      when 'efectivo'
        then identifier is null or btrim(identifier) = ''

      -- El `is not null` de cada rama no sobra: en SQL, `null ~ '…'` no es
      -- falso sino null, y un CHECK que da null SE APRUEBA. Sin él, cualquiera
      -- podría guardar un Nequi sin número y el QR de pago quedaría mostrando
      -- un medio de cobro vacío.

      -- Nequi y Daviplata son SIEMPRE un celular colombiano de diez dígitos.
      when 'nequi'
        then identifier is not null and identifier ~ '^[0-9]{10}$'
      when 'daviplata'
        then identifier is not null and identifier ~ '^[0-9]{10}$'

      -- Una cuenta de Bancolombia es un número y nada más. Ni el nombre del
      -- banco, ni «ahorros», ni guiones de separación: eso va en la nota.
      when 'bancolombia'
        then identifier is not null and identifier ~ '^[0-9]{6,20}$'

      -- El link tiene que ser una URL de verdad y sin espacios, que es lo que
      -- delata un texto pegado a medias.
      when 'link'
        then identifier is not null and identifier ~* '^https?://[^[:space:]]{3,}$'

      -- «Otro banco» es el único texto libre, porque el medio por sí solo no
      -- dice a qué banco va la plata: ahí caben «Davivienda ahorros 4567890»
      -- y parecidos. Se le exige contenido y un largo razonable.
      else
        identifier is not null
        and btrim(identifier) <> ''
        and length(identifier) <= 60
    end
  ) not valid;

comment on constraint at_payment_methods_dato_coherente on public.at_payment_methods is
  'El identificador tiene la forma que le corresponde a su medio: dígitos para cuentas y celulares, URL para el link, texto libre solo en otro_banco. NOT VALID: las filas anteriores a esta migración quedan tal como estaban.';

-- ── Para el día que se quiera limpiar lo viejo ─────────────────────────
-- Los medios que hoy NO cumplirían. Ejecutar a mano y revisarlos uno por uno
-- con su comercio antes de tocar nada: son sus datos de cobro.
--
--   select c.business_name, m.id, m.kind, m.identifier
--   from public.at_payment_methods m
--   join public.at_clients c on c.id = m.client_id
--   where m.active
--     and case m.kind
--           when 'efectivo'    then not (m.identifier is null or btrim(m.identifier) = '')
--           when 'nequi'       then coalesce(m.identifier !~ '^[0-9]{10}$', true)
--           when 'daviplata'   then coalesce(m.identifier !~ '^[0-9]{10}$', true)
--           when 'bancolombia' then coalesce(m.identifier !~ '^[0-9]{6,20}$', true)
--           when 'link'        then coalesce(m.identifier !~* '^https?://[^[:space:]]{3,}$', true)
--           else m.identifier is null or btrim(m.identifier) = '' or length(m.identifier) > 60
--         end
--   order by c.business_name;
--
-- Cuando ya no salga ninguno, se puede sellar con:
--   alter table public.at_payment_methods
--     validate constraint at_payment_methods_dato_coherente;
