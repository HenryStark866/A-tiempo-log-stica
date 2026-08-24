-- A TIEMPO LOGÍSTICA — un precio con coma decimal deja de multiplicarse por cien.
--
-- ── El fallo ──────────────────────────────────────────────────────────────
--
-- at_parse_money convierte el precio que viene en el CSV del comercio. Cuando
-- el archivo trae coma decimal Y cuatro o más dígitos por delante, la tomaba
-- como separador de miles y la borraba:
--
--     '89900,00'   →  8990000      debía ser  89900.00
--     '12345,5'    →   123455      debía ser  12345.5
--
-- Un producto de 89.900 pesos queda a 8.990.000 en el catálogo. El asesor lo
-- ve así al hacer el pedido, y ese precio viaja al contraentrega: el mensajero
-- le cobra al comprador cien veces de más en la puerta.
--
-- ── Por qué pasa, y por qué no se había visto ─────────────────────────────
--
-- La condición tenía dos partes unidas por AND:
--
--     length(s) - position(',' in reverse(s)) - 1 <= 2     ← esta sobra
--     and length(s) - (length(s) - position(',' in reverse(s))) <= 3
--
-- La segunda es la buena: se reduce a «como mucho 2 dígitos detrás de la
-- coma», que es exactamente la regla que hay que aplicar. La primera mide otra
-- cosa —la posición de la coma desde el principio— y exige que haya como mucho
-- 3 dígitos ANTES. En pesos colombianos eso no se cumple casi nunca: los
-- precios reales tienen cinco o seis cifras.
--
-- No se había visto porque el caso más común sí funcionaba. Excel en español
-- suele exportar '89.900,00' —con punto de miles Y coma decimal—, y esa rama
-- es otra y está bien. El fallo aparece cuando la celda tiene dos decimales
-- pero no separador de miles: '89900,00'. Igual de real, y silencioso: no da
-- error, guarda un número.
--
-- ── La corrección ─────────────────────────────────────────────────────────
--
-- Una sola regla, la que ya estaba escrita en el comentario original:
--
--     el ÚLTIMO separador que aparezca es decimal si deja 1 o 2 dígitos
--     detrás; en cualquier otro caso es de miles.
--
-- Se reescribe entera en vez de quitar la condición sobrante, porque la
-- versión anterior mezclaba tres ramas (coma+punto, solo coma, solo punto) que
-- decían lo mismo de tres formas distintas. Con una sola regla no hay ramas
-- que puedan discrepar entre sí.
--
-- ── Qué hacer con lo ya cargado ───────────────────────────────────────────
--
-- Esta migración NO toca los precios existentes. Corregirlos a ciegas sería
-- peor: no hay forma de distinguir un producto que se cargó mal de uno que de
-- verdad cuesta ocho millones. Al pie hay una consulta para revisarlos a mano.

create or replace function public.at_parse_money(p text)
returns numeric
language plpgsql immutable set search_path = public
as $$
declare
  -- Fuera todo lo que no sea dígito o separador: '$ 89.900' → '89.900'.
  s text := regexp_replace(coalesce(p, ''), '[^0-9.,]', '', 'g');
  ult  int;   -- posición (1 a n) del último separador; 0 si no hay ninguno
  cola int;   -- cuántos dígitos quedan detrás de él
begin
  if s = '' then return 0; end if;

  -- El último separador que aparezca es el único candidato a decimal. Los
  -- anteriores, sean puntos o comas, solo pueden ser de miles.
  ult := greatest(
    case when position(',' in s) > 0
         then length(s) + 1 - position(',' in reverse(s)) else 0 end,
    case when position('.' in s) > 0
         then length(s) + 1 - position('.' in reverse(s)) else 0 end
  );

  -- Sin separadores: el número ya está listo.
  if ult = 0 then
    return coalesce(nullif(s, '')::numeric, 0);
  end if;

  cola := length(s) - ult;

  if cola between 1 and 2 then
    -- Decimal. Se marca con un carácter que no puede aparecer en el número,
    -- se limpian TODOS los separadores de miles, y se restituye el punto.
    -- Hacerlo en ese orden evita el fallo de '1,234,56', donde un replace
    -- directo dejaba dos puntos y reventaba la conversión.
    s := overlay(s placing '#' from ult for 1);
    s := replace(replace(s, '.', ''), ',', '');
    s := replace(s, '#', '.');
  else
    -- Miles (3 dígitos detrás, o ninguno): fuera todos los separadores.
    s := replace(replace(s, '.', ''), ',', '');
  end if;

  return coalesce(nullif(s, '')::numeric, 0);
exception when others then
  -- Un precio ilegible vale 0, no rompe la importación entera. at_sync_products
  -- conserva el precio anterior cuando el nuevo no es mayor que cero.
  return 0;
end $$;

comment on function public.at_parse_money(text) is
  'Convierte el precio de un CSV a numeric. Regla única: el último separador es decimal si deja 1-2 dígitos detrás; si no, es de miles.';

revoke execute on function public.at_parse_money(text) from public, anon;
grant  execute on function public.at_parse_money(text) to authenticated;


-- ── Comprobación de la propia migración ───────────────────────────────────
-- Si algo de esto falla, la migración no se aplica. Vale más quedarse con la
-- versión vieja que instalar una peor sin enterarse.
do $$
begin
  -- Los que ya funcionaban, para no romperlos
  assert public.at_parse_money('145000')      = 145000,   'entero plano';
  assert public.at_parse_money('$ 89.900')    = 89900,    'punto de miles';
  assert public.at_parse_money('89.900,00')   = 89900,    'punto miles + coma decimal';
  assert public.at_parse_money('45,000.50')   = 45000.50, 'coma miles + punto decimal';
  assert public.at_parse_money('1.234.567')   = 1234567,  'dos puntos de miles';
  assert public.at_parse_money('89,5')        = 89.5,     'coma decimal corta';
  assert public.at_parse_money('1,500')       = 1500,     'coma de miles';
  assert public.at_parse_money('')            = 0,        'vacío';
  assert public.at_parse_money(null)          = 0,        'nulo';
  assert public.at_parse_money('sin precio')  = 0,        'texto';

  -- Los que estaban mal
  assert public.at_parse_money('89900,00')    = 89900,    'REGRESIÓN: coma decimal con 5 dígitos delante';
  assert public.at_parse_money('12345,5')     = 12345.5,  'REGRESIÓN: coma decimal con 5 dígitos delante';
  assert public.at_parse_money('1234,56')     = 1234.56,  'REGRESIÓN: coma decimal con 4 dígitos delante';
  assert public.at_parse_money('$ 145.000,00')= 145000,   'formato completo de Excel es-CO';
end $$;


-- ── Para revisar a mano lo que ya está cargado ────────────────────────────
--
-- No se ejecuta aquí. Copiar al editor SQL cuando se quiera auditar:
--
--   select c.business_name, p.sku, p.name, p.price
--   from public.at_products p
--   join public.at_clients c on c.id = p.client_id
--   where p.active and p.price >= 1000000
--   order by p.price desc;
--
-- Un precio de siete cifras en este catálogo casi siempre es este fallo. Si se
-- confirma, dividir entre 100:
--
--   update public.at_products set price = price / 100 where id = '...';
