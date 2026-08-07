-- A TIEMPO LOGÍSTICA — se van de nuestra base los objetos de TaxiYa.
--
-- ⚠ ESTA MIGRACIÓN TODAVÍA NO ESTÁ APLICADA. A diferencia del resto del
-- directorio, hay que ejecutarla a mano desde el editor SQL de Supabase. Borra
-- datos y eso no se automatiza a ciegas: conviene abrir antes el respaldo y
-- comprobar que está lo que tiene que estar.
--
-- TaxiYa se mudó a su propio proyecto y Henry confirmó que este Supabase queda
-- dedicado a A Tiempo. En 0064 se les cerró el acceso; aquí se retiran.
--
-- Por qué borrarlos y no solo dejarlos cerrados: mientras esas tablas estén
-- aquí, los datos personales que contienen —nombres, teléfonos y placas de
-- conductores, y los consentimientos de tratamiento de datos de sus usuarios—
-- son responsabilidad de A Tiempo ante la Ley 1581, sobre gente que nunca fue
-- cliente nuestro y a la que no podríamos atender una solicitud de supresión.
-- Guardarlos "por si acaso" no es lo prudente: es lo contrario.
--
-- Antes de esto se exportaron datos y estructura a un respaldo fuera del repo
-- (no se versiona: son datos personales y GitHub no es sitio para eso).
--
-- NO se toca la otra aplicación que también vive aquí —la de monitoreo
-- industrial: "User", "Machine", "Session", "Shift", "Break", "HourlyLog",
-- "Report", "Incident", "LeaveRequest", "ScheduleAssignment"—. Apareció al
-- hacer el inventario, no estaba en la conversación, y borrar lo de alguien
-- que no sabe que está ahí no se hace. Queda cerrada a la API por 0064.

-- Las vistas primero: dependen de las tablas de abajo.
drop view if exists public.v_liquidacion_socios;
drop view if exists public.v_cargos_periodo;

-- Las dos que insertaban directo en auth.users saltándose la verificación de
-- correo. Son las que abrían la puerta de verdad; se van las primeras.
drop function if exists public.registrar_usuario(text, text, text, text, text, text, text, boolean);
drop function if exists public.crear_usuario_semilla(text, text, jsonb);

-- Las tablas. cascade porque entre ellas hay claves foráneas y triggers que
-- dependen de las funciones de más abajo.
drop table if exists public.consentimientos_datos cascade;
drop table if exists public.auditoria_servicios   cascade;
drop table if exists public.cargos_cdh            cascade;
drop table if exists public.tarifas_cdh           cascade;
drop table if exists public.servicios             cascade;
drop table if exists public.conductores           cascade;
drop table if exists public.alertas_trafico       cascade;
drop table if exists public.eventos_orden_publico cascade;
drop table if exists public.socios_plataforma     cascade;
drop table if exists public.tipos_servicio        cascade;
drop table if exists public.politicas_datos       cascade;
drop table if exists public.profiles              cascade;
drop table if exists public.empresas              cascade;

-- Y las funciones que quedaran sueltas. Van después de las tablas porque
-- algunas eran funciones de trigger y el cascade de arriba ya se llevó los
-- triggers que las usaban.
drop function if exists public.handle_new_user();
drop function if exists public.preparar_servicio();
drop function if exists public.generar_cargo_cdh();
drop function if exists public.registrar_auditoria_servicio();
drop function if exists public.proteger_cargo_cdh();
drop function if exists public.validar_participacion_socios();
drop function if exists public.preparar_alerta_movilidad();
drop function if exists public.tarifa_cdh_vigente(uuid, text);
drop function if exists public.mi_empresa();
drop function if exists public.mi_rol();
