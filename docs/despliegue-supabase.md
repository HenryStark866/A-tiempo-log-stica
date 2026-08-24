# Aplicar migraciones en Supabase

## El proyecto

| | |
| --- | --- |
| Ref | `uhbtivaepyhwfdvtpfjq` |
| Panel | <https://supabase.com/dashboard/project/uhbtivaepyhwfdvtpfjq> |
| SQL Editor | <https://supabase.com/dashboard/project/uhbtivaepyhwfdvtpfjq/sql/new> |
| Migraciones | <https://supabase.com/dashboard/project/uhbtivaepyhwfdvtpfjq/database/migrations> |

> **Este ref es el de producción.** Está en la lista `PROHIBIDOS` de
> `tests/db/harness.ts`, que se escribió justamente para que los tests contra la
> base no puedan apuntar aquí: esos tests crean y borran filas con la llave
> `service_role`, que se salta RLS entera.
>
> Que hoy se use también como entorno de pruebas es una decisión consciente
> —todavía no hay staging, ver `docs/LO-QUE-FALTA.md`— pero conviene tenerla
> presente: cada migración que se aplique aquí se aplica sobre la base real.
> Nunca pongas este ref en `SUPABASE_TEST_URL`.

## Enlazar el CLI, una sola vez

`supabase/config.toml` ya existe con el `project_id` local. Falta el enlace con
la nube, que se guarda en `supabase/.temp/` y no se commitea:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref uhbtivaepyhwfdvtpfjq
```

Te va a pedir la contraseña de la base (Settings → Database → Database password).
Si no la tienes, ahí mismo se puede regenerar — ojo, regenerarla invalida la
anterior en cualquier sitio donde esté guardada.

## Aplicar

**Siempre, antes de empujar:**

```bash
npx supabase@latest migration list
```

Compara los archivos locales con lo que la base dice tener aplicado. Léelo
entero, por dos razones:

1. **`db push` aplica TODO lo pendiente, no solo la migración que tienes en la
   cabeza.** Si `0087`, `0088` y `0089` están sin aplicar, van las tres.
2. **Hay huecos en la numeración**: faltan `0031`, `0039`, `0078` y `0079`. Si
   esos números llegaron a aplicarse en la nube y luego se borraron los
   archivos, `db push` se planta con *migration history does not match*. Se
   arregla con `supabase migration repair --status reverted <version>`, pero
   antes hay que entender qué pasó — no lo ejecutes a ciegas.

Y entonces:

```bash
npx supabase@latest db push
```

**Alternativa sin CLI:** pegar el contenido de la migración en el SQL Editor.
Funciona igual de bien y no necesita Docker ni enlace, pero **no deja registro
en `supabase_migrations.schema_migrations`**, así que el siguiente
`migration list` mostrará esa migración como pendiente. Si aplicas por el
editor, márcala después:

```bash
npx supabase@latest migration repair --status applied 0089
```

## Después de aplicar

Cada migración de esta tanda trae su archivo de verificación:

| Migración | Verificación |
| --- | --- |
| `0088` · hora de recogida | `docs/verificacion-0088-hora-de-recogida.sql` |
| `0089` · diez sub-zonas | `docs/verificacion-0089-subzonas.sql` |

Los dos se pegan en el SQL Editor. El de la 0089 trae además la marcha atrás,
comentada al final.

## Qué hacer si algo sale mal

Ninguna de las dos migraciones borra datos: la `0088` añade un CHECK `NOT VALID`
y dos triggers; la `0089` añade zonas y desactiva las viejas. La marcha atrás de
la `0089` está escrita y probada. Aun así, antes de aplicar sobre esta base vale
la pena tener el respaldo del día — en el plan Free de Supabase **no hay
respaldos diarios automáticos** (`docs/LO-QUE-FALTA.md`), así que si el proyecto
sigue en Free, el respaldo hay que sacarlo a mano:

```bash
npx supabase@latest db dump --linked -f respaldo-antes-de-0089.sql
```
