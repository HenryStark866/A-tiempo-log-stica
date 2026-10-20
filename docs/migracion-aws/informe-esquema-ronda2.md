# Informe de esquema: migraciones contra el dump de producción

Fecha: 2026-10-20. Dump comparado: `yam-20261020T200022Z.dump` (S3, solo descarga),
restaurado en un Postgres local aparte. Esquema local: todas las migraciones de `main`
(0001…0131 + 0140–0142) aplicadas sobre el staging local.

## Qué se comparó (esquema `public`, más políticas de `storage` y buckets)

Tablas y RLS (con `force`), columnas (tipo, nulidad, default), vistas, funciones
(firma, tipo de retorno, `security definer`, cuerpo normalizado), triggers, políticas
(comando, roles, `using`/`with check`), índices, restricciones, buckets, permisos de
tablas y funciones, enums, extensiones y publicaciones.

## Diferencias encontradas

| Objeto | Producción | Migraciones | Solución |
| --- | --- | --- | --- |
| `at_url_funciones()` | existe (lee `at_funciones_url` del vault) | no existía | `0132` |
| `at_despachar_buzon()` | llama a `at_url_funciones() \|\| '/enviar-mensajes'`, sin llave anónima | URL fija de Supabase y llave anónima | `0132` |
| `at_sincronizar_shopify()` | igual, hacia `/shopify-sync` | igual que arriba | `0132` |

Las tres eran un cambio hecho a mano en la instancia de AWS. Las **64 políticas** locales
contra 62 que dejó abierta la ronda 1 ya coinciden: la diferencia era de entonces
(los stubs); hoy tablas, columnas, triggers, políticas, índices, restricciones,
vistas y buckets son idénticos.

## Lo que no se pudo comparar

- `cron.job` (los jobs de pg_cron viven en la base `postgres` de la instancia y el
  dump no los restaura): hay que comprobarlos en la instancia con una consulta de solo lectura.
- Extensión `pg_cron` y publicación `supabase_realtime_messages_publication`: solo
  difieren por cómo se restauró el dump aquí, no por el esquema.

## Cómo repetirlo

Restaurar el dump con `pg_restore --no-owner` en una base vacía y ejecutar la misma
consulta de catálogo contra ambas bases; ordenar y comparar con `diff`.
