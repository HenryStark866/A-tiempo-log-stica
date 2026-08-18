-- ═══════════════════════════════════════════════════════════════════════════
-- Los papeles que de verdad se le piden a un mensajero para trabajar:
-- cédula (los dos lados), licencia de conducción, tarjeta de propiedad y
-- certificado de medidas correctivas.
--
-- Sale el SOAT de la lista de obligatorios. No desaparece: se puede seguir
-- subiendo y sigue en el catálogo, pero ya no bloquea la habilitación, que era
-- lo que en la práctica dejaba a un mensajero listo sin poder salir a rodar.
--
-- La misma lista para corporativo y colaborativo. Antes al corporativo se le
-- pedían menos papeles porque el vehículo era de la empresa; hoy la operación
-- verifica igual a todo el que sale a la calle.
--
-- Ojo: at_verify_courier lee esta función para decidir si puede habilitar a
-- alguien. Cambiar la lista cambia el requisito de habilitación, que es
-- justamente lo que se busca.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.at_required_courier_docs(p_type at_courier_type)
returns at_doc_type[]
language sql
immutable
set search_path to 'public'
as $function$
  select array[
    'cedula_frente',
    'cedula_reverso',
    'licencia_conduccion',
    'tarjeta_propiedad',
    'certificado_medidas_correctivas'
  ]::public.at_doc_type[]
$function$;
