-- A TIEMPO LOGÍSTICA — la base queda solo con lo de A Tiempo.
--
-- Aplicada el 2026-08-09, con el respaldo ya hecho. Queda una sola cosa fuera
-- de su alcance: el bucket `evidencias`, que solo se borra desde el panel.
--
-- Este proyecto se compartía con otras aplicaciones. Ya no: A Tiempo se queda
-- sola. Al hacer el inventario aparecieron DOS apps ajenas, no una:
--
--   A) TaxiYa — empresas, profiles, conductores, servicios, tipos_servicio,
--      tarifas_cdh, cargos_cdh, auditoria_servicios, socios_plataforma,
--      alertas_trafico, eventos_orden_publico, consentimientos_datos,
--      politicas_datos, las vistas v_* y sus funciones.
--
--   B) Un sistema de monitoreo industrial —temperaturas, CO2, humedad, turnos
--      y novedades de personal— con "User", "Machine", "Session", "Shift",
--      "Break", "HourlyLog", "Report", "Incident", "LeaveRequest",
--      "ScheduleAssignment", su bucket `evidencias` y delete_evidence_file().
--
-- Por qué borrarlas y no dejarlas cerradas, que es como quedaron en 0064:
-- mientras esas tablas estén aquí, los datos personales que contienen —nombres
-- y teléfonos de conductores, sus placas, los consentimientos de tratamiento de
-- datos, los operarios del sistema industrial con su PIN de acceso— son
-- responsabilidad de A Tiempo ante la Ley 1581, sobre gente que nunca fue
-- cliente nuestro y a la que no podríamos atender una solicitud de supresión.
-- Guardar datos personales "por si acaso" no es lo prudente: es lo contrario.
--
-- El respaldo previo —161 filas y la estructura de las dos apps— está en
-- Escritorio\respaldo-apps-ajenas\. Va fuera del repo a propósito: son datos
-- personales y GitHub no es sitio para eso.
--
-- Antes de escribir esto se comprobó, con pg_depend, que ningún objeto de
-- A Tiempo depende de ninguno de estos.

-- ── Vistas primero: dependen de las tablas de abajo ───────────────────────
drop view if exists public.v_liquidacion_socios;
drop view if exists public.v_cargos_periodo;

-- ── Las dos funciones que abrían la puerta de verdad ──────────────────────
-- Insertaban directo en auth.users con el correo ya marcado como confirmado,
-- saltándose la verificación entera. auth.users es el de A Tiempo.
drop function if exists public.registrar_usuario(text, text, text, text, text, text, text, boolean);
drop function if exists public.crear_usuario_semilla(text, text, jsonb);

-- ── A) TaxiYa ────────────────────────────────────────────────────────────
-- cascade porque entre ellas hay claves foráneas y triggers.
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

-- ── B) Monitoreo industrial ──────────────────────────────────────────────
-- Los nombres van entre comillas porque llevan mayúsculas: sin ellas, Postgres
-- los busca en minúscula y no encuentra nada.
drop table if exists public."HourlyLog"          cascade;
drop table if exists public."Report"             cascade;
drop table if exists public."Incident"           cascade;
drop table if exists public."Break"              cascade;
drop table if exists public."ScheduleAssignment" cascade;
drop table if exists public."LeaveRequest"       cascade;
drop table if exists public."Session"            cascade;
drop table if exists public."Shift"              cascade;
drop table if exists public."Machine"            cascade;
drop table if exists public."User"               cascade;

drop function if exists public.delete_evidence_file();

-- Los enum quedan huérfanos al irse las tablas que los usaban.
drop type if exists public."MachineType";
drop type if exists public."Role";

-- Su política de almacenamiento. El BUCKET `evidencias` en sí no se puede
-- borrar desde SQL: Supabase protege sus tablas de storage con un trigger
-- (`storage.protect_delete`) que rechaza cualquier DELETE directo, y con razón
-- —borrar la fila sin borrar los archivos deja basura invisible pagándose—.
-- Hay que quitarlo desde el panel, en Storage. Está vacío, así que no corre
-- prisa: sin política y sin permisos ya no lo alcanza nadie.
drop policy if exists "solo staff usa el bucket evidencias" on storage.objects;

-- ── C) Las cuentas que TaxiYa dejó dentro de las NUESTRAS ────────────────
-- Esto no está en sus tablas, por eso hace falta aparte: son usuarios suyos
-- que acabaron en auth.users —que las dos apps compartían— y de ahí el trigger
-- de A Tiempo les creó un perfil en at_profiles. Se les reconoce por el correo:
-- TaxiYa los fabricaba como <telefono>@usuarios.taxiya.app.
--
-- Mientras estén, salen en la bandeja de solicitudes pendientes del admin como
-- gente esperando aprobación que nunca va a llegar, y ensucian el conteo de
-- usuarios. Ninguna ha entrado nunca a A Tiempo: su rol es 'pendiente' y su
-- nombre está vacío.
--
-- Se borra el usuario de auth y el perfil se va detrás por la clave foránea.
-- Va de último a propósito: si algo de arriba falla, esto ni se intenta.
delete from auth.users where email like '%@usuarios.taxiya.app';
