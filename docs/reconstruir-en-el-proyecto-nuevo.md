# Reconstruir A Tiempo en el proyecto nuevo

|  | |
| --- | --- |
| **Viejo** | `uhbtivaepyhwfdvtpfjq` · org Incubant (Pro) · us-west-2 |
| **Nuevo** | `kjfwlofcqtptedwfpddh` · org YAM (Free por ahora) · us-east-1 |

La regla que manda sobre todo lo demás: **el proyecto viejo no se toca hasta
que el nuevo esté sirviendo producción y verificado.** Mientras tanto es la
única red que hay, y borrarlo antes de tiempo convierte cualquier tropiezo en
pérdida.

## Lo primero: la app está en producción

El riesgo de esta mudanza **no es que la app se caiga**. Es peor y más callado.

Si vuelcas la base a las 22:00 y terminas de cambiar Vercel a las 22:30, durante
esa media hora la app **sigue escribiendo en la base vieja**. Todo pedido
creado, toda entrega confirmada y todo pago reportado en esa ventana queda allá
y no existe en la nueva. Al cambiar, para el usuario simplemente desaparecieron:
un mensajero que confirmó cinco entregas las ve sin confirmar, y no se entera
nadie hasta que un comercio reclama días después.

Eso no se arregla yendo rápido. Se arregla **impidiendo que nadie escriba
mientras dura**.

### Modo mantenimiento

Se enciende con la variable `MANTENIMIENTO=1` en Vercel y un redespliegue.
Cierra la plataforma —donde se escribe— y **deja en pie el rastreo público y la
pantalla de pago**, que solo leen. Un destinatario con un paquete en camino
sigue viendo dónde va, y quien tiene al mensajero en la puerta sigue pudiendo
ver a quién pagarle.

Probado en local, encendido y apagado, ruta por ruta.

### El orden que hace esto reversible

1. **Vercel: `MANTENIMIENTO=1` → redesplegar.** Desde este momento nadie
   escribe. Empieza el reloj.
2. Volcar el proyecto viejo (paso 1).
3. Restaurar en el nuevo (paso 2).
4. Copiar los archivos (paso 3).
5. Verificar con el retrato (paso 5). **Si algo no cuadra, para aquí**: la app
   sigue en mantenimiento y la base vieja está intacta.
6. **Vercel: cambiar `NEXT_PUBLIC_SUPABASE_URL` y la llave al proyecto nuevo,
   y `MANTENIMIENTO=0` → redesplegar.** Un solo despliegue para las dos cosas.
7. Comprobar en producción (paso 8).

**Y si algo sale mal después del paso 6:** devuelves las dos variables al
proyecto viejo, redesplegas, y en dos minutos estás como antes — con todos los
datos, porque la base vieja no se tocó. Ese es el motivo de no borrarla hasta
dentro de unos días.

### Cuándo hacerlo

De noche, cuando no haya reparto. Con 527 filas y 39 archivos el trabajo real
son minutos, no horas; lo que se alarga es verificar, y eso conviene hacerlo sin
prisa. Avisa antes a los comercios: media hora anunciada no molesta a nadie,
media hora por sorpresa sí.

## Antes de empezar

**Las llaves y contraseñas no se pegan en el chat.** Van en variables de
entorno de tu propia terminal y desaparecen al cerrarla. Ninguna se guarda en
este repositorio.

Lo que vas a necesitar a mano:

- La contraseña de base de datos de **cada** proyecto (Project Settings →
  Database → Database password). Si no recuerdas la del viejo, ahí mismo se
  puede regenerar — ojo: regenerarla no rompe la app, que usa las llaves de API
  y no la de la base.
- La llave `service_role` de cada proyecto (Project Settings → API Keys).

No hacen falta `psql` ni el CLI instalados: se usan por Docker y npx, que ya
tienes.

## Paso 1 — Volcar el proyecto viejo

En PowerShell, dentro de la carpeta del proyecto:

```powershell
mkdir volcado; cd volcado
$VIEJO = "postgresql://postgres:LA_CONTRASENA@db.uhbtivaepyhwfdvtpfjq.supabase.co:5432/postgres"

npx supabase@latest db dump --db-url $VIEJO -f roles.sql  --role-only
npx supabase@latest db dump --db-url $VIEJO -f schema.sql
npx supabase@latest db dump --db-url $VIEJO -f data.sql --use-copy --data-only
```

**Comprueba los volcados antes de seguir.** Si el de datos no trae los
usuarios, restaurarías una base perfecta donde nadie puede entrar:

```powershell
Select-String -Path data.sql   -Pattern "auth\.users"  | Measure-Object | % Count
Select-String -Path schema.sql -Pattern "at_guides"    | Measure-Object | % Count
```

Los dos tienen que dar más de cero. Si `data.sql` no menciona `auth.users`,
para aquí y dímelo: hay que volcar el esquema `auth` aparte y es mejor
resolverlo antes de restaurar que después.

## Paso 2 — Restaurar en el nuevo

```powershell
$NUEVO = "postgresql://postgres:LA_CONTRASENA_NUEVA@db.kjfwlofcqtptedwfpddh.supabase.co:5432/postgres"

docker run --rm -i -v "${PWD}:/w" -w /w postgres:17 psql `
  --single-transaction --variable ON_ERROR_STOP=1 `
  --file roles.sql --file schema.sql `
  --command "SET session_replication_role = replica" `
  --file data.sql --dbname $NUEVO
```

Qué hace cada parte, porque conviene entenderla antes de correrla:

- `--single-transaction`: o entra todo o no entra nada. Sin esto, un error a
  mitad deja la base a medio construir y hay que adivinar por dónde iba.
- `ON_ERROR_STOP=1`: `psql` por omisión sigue adelante después de un error.
  Sin esto, terminaría diciendo que todo salió bien.
- `session_replication_role = replica`: apaga los triggers durante la carga de
  datos. Es imprescindible: con ellos encendidos, insertar las guías volvería a
  disparar la facturación automática y saldrían facturas duplicadas de la nada.

## Paso 3 — Los archivos

El volcado trae las FILAS de `storage.objects`, no los archivos. Sin este paso
la app cree que la cédula del mensajero existe, la lista, y al abrirla no hay
nada.

```powershell
$env:VIEJO_URL = "https://uhbtivaepyhwfdvtpfjq.supabase.co"
$env:VIEJO_KEY = "<service_role del VIEJO>"
$env:NUEVO_URL = "https://kjfwlofcqtptedwfpddh.supabase.co"
$env:NUEVO_KEY = "<service_role del NUEVO>"
node scripts/copiar-almacenamiento.mjs
```

Se puede repetir sin miedo: salta lo que ya esté copiado.

## Paso 4 — Las edge functions

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref kjfwlofcqtptedwfpddh
npx supabase@latest functions deploy enviar-mensajes
npx supabase@latest functions deploy shopify-sync
```

Si esas funciones usan secretos (credenciales de Shopify, del proveedor de
WhatsApp), hay que volver a ponerlos: `npx supabase secrets set NOMBRE=valor`.
Los secretos **no** viajan en ningún volcado.

## Paso 5 — Verificar la base ANTES de cambiar la app

Abre `scripts/retrato.sql` en el editor SQL del proyecto nuevo y ejecútalo.
Tiene que dar lo mismo que el viejo; el resultado esperado está anotado al pie
del propio archivo.

Si un número baja, para. Es más barato repetir la restauración que descubrir
en tres días que faltaba una política de RLS.

## Paso 6 — Apuntar la app al proyecto nuevo

En Vercel → proyecto `atiempo-logistica` → Settings → Environment Variables:

| Variable | Valor nuevo |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kjfwlofcqtptedwfpddh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la llave publicable del proyecto nuevo |

Revisa si hay más variables (`SUPABASE_SERVICE_ROLE_KEY`, secretos de Shopify).
Después hay que **volver a desplegar**: Vercel no reconstruye solo por cambiar
una variable.

## Paso 7 — Lo que no viaja en ningún volcado

Son ajustes del proyecto, no de la base. Se rehacen a mano en el panel nuevo:

- **URL del sitio y redirecciones** (Authentication → URL Configuration):
  `https://atiempo-logistica.vercel.app`, y como redirección
  `https://atiempo-logistica.vercel.app/auth/confirmar`. Si esto falta, el
  enlace del correo de confirmación no lleva a ninguna parte.
- **La plantilla del correo** de `correos/confirmar-cuenta.html`.
- **Protección contra contraseñas filtradas** y **límite de registros**.
- Confirmar que las **tareas cron** quedaron: el retrato las cuenta.

## Paso 8 — Comprobar en producción, con calma

```bash
curl -s https://atiempo-logistica.vercel.app/api/version
curl -s -o /dev/null -w '%{http_code}\n' https://atiempo-logistica.vercel.app/rastreo/ATL-100008
```

Y a mano, que es lo que de verdad prueba que sirve:

1. Entrar con una cuenta de comercio **con su contraseña de siempre**. Si tiene
   que restablecerla, los usuarios no se migraron y hay que parar.
2. Abrir *Mis pedidos* y ver que están los 28.
3. Abrir *Mi recaudo* y ver que los números cuadran.
4. Abrir un documento de un mensajero: prueba que los archivos llegaron.
5. Crear un pedido de prueba y borrarlo.

## Paso 9 — Solo entonces, el viejo

Cuando lleves unos días sin sorpresas: borrar el proyecto viejo. No antes.

Y mientras tanto, sube la organización nueva a **Pro**. En Free no hay
respaldos automáticos diarios y el proyecto se pausa por inactividad — para una
operación con dinero y datos personales, eso es exactamente lo que no quieres
descubrir el día que algo se rompa.

## Lo que puedo hacer yo

Mi conexión con Supabase solo alcanza la organización Incubant, así que sobre
`kjfwlofcqtptedwfpddh` no puedo escribir ni leer.

Si conectas el MCP de Supabase con la cuenta nueva, puedo hacerme cargo de los
pasos 2, 5 y 7 —restaurar, verificar contra el retrato y dejar la configuración
puesta— en vez de dictarte comandos a ciegas. Es la diferencia entre
acompañarte y hacerlo.
