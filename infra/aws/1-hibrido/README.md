# Infraestructura en AWS — camino híbrido

Terraform de las piezas de AWS que YAM usa hoy. **No mueve la base de datos ni
la app**: Supabase sigue siendo Supabase y Vercel sigue sirviendo la app.

## Qué es esto y qué no

De los tres caminos que se estudiaron (ver *Plan — Migración a AWS* en la
bóveda), este es el **camino C**: adoptar solo las piezas que ganan algo ya,
cada una reversible por su cuenta y sin ventana de caída.

Se descartó por ahora migrar la pila entera porque, con 9 comercios y 28
pedidos, la factura de AWS no baja de la de Supabase — la migración se pagaría
en control, no en dinero. Y hay una mudanza de proyecto de Supabase a medias:
encadenar dos es pagar el riesgo dos veces sobre una operación con dinero en la
calle.

| Pieza | Qué resuelve | Riesgo si falla |
| --- | --- | --- |
| **Route 53** | El dominio `atiempologistica.com`, pendiente desde antes | Se revierte cambiando los NS en el registrador |
| **SES** | Correos transaccionales con dominio propio, firmados y medibles | Ninguno hasta que Supabase los use; hoy solo verifica |
| **S3 + CloudFront** | Los logos de marca desde el borde | Ninguno: como mucho no se ve un logotipo |
| **Lambda + EventBridge** | El sync de Shopify, **que hoy falla en silencio** | El cron viejo sigue ahí hasta que se apague a mano |
| **Presupuesto y alarmas** | Que un fallo o un gasto raro se vean | — |

### El que de verdad importa

El sync de Shopify **está roto en producción ahora mismo**: responde `401`
porque falta `AT_CRON_SECRET` en los secretos de la edge function
(`docs/arranque-produccion.md`, punto 1). Los pedidos de Shopify no entran
solos, y la única forma de enterarse es consultar `net._http_response` a mano.

Nadie lo hace. Con esto, ese mismo 401 dispara una alarma y llega un correo.
**La ganancia no es la nube: es que el fallo se ve.**

### Lo que deliberadamente NO se mueve

Los cinco buckets privados de Supabase —cédulas de mensajeros, evidencias de
entrega, comprobantes de pago, documentos de sedes— **se quedan donde están**.
Su control de acceso son políticas RLS atadas a la sesión de cada persona, y
reproducir eso con URLs firmadas de S3 es reescribir la autorización de los
archivos entera. No es algo que se haga de paso mientras se monta un CDN.

Solo se mueve `at-brand-logos`, que es público por definición.

## Coste

Al volumen de hoy, todo esto debería costar **menos de 5 USD/mes**: la zona de
Route 53 son 0,50 USD y el resto cabe en la capa gratuita. El aviso de
presupuesto está en 20 USD para que algo desbocado se note pronto.

---

## Cómo aplicarlo

### Paso 0 — El backend de estado (una sola vez)

Huevo y gallina: el estado de Terraform vive en S3, pero ese bucket no lo puede
crear este mismo Terraform. Se crea a mano:

```bash
aws s3api create-bucket --bucket atl-terraform-estado --region us-east-1
aws s3api put-bucket-versioning --bucket atl-terraform-estado \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket atl-terraform-estado \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

El versionado no es opcional: es lo que permite recuperar un estado que se
corrompió a mitad de un `apply`.

### Paso 1 — Variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

Completar `correo_alertas` y `supabase_url`. **Confirmar cuál de los dos
proyectos de Supabase está sirviendo producción** antes de escribirlo — hay una
mudanza a medias.

### Paso 2 — Mirar antes de tocar

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=plan.tfplan
```

**Leer el plan entero.** Debería crear ~25 recursos y no destruir ninguno. Si
aparece algún `destroy`, parar y preguntar: en el primer `apply` de una cuenta
nueva no hay nada que destruir.

```bash
terraform apply plan.tfplan
```

### Paso 3 — El dominio

`terraform output servidores_de_nombres` da cuatro. Ponerlos en el
**registrador** del dominio.

Hasta ese momento **no cambia nada**: la zona existe pero no la consulta nadie.
Por eso es seguro aplicar esto primero.

Cuando resuelva (de minutos a horas):

```bash
dig +short NS atiempologistica.com
dig +short A atiempologistica.com          # debería dar la IP de Vercel
```

Luego, y esto es lo que siempre se olvida:

1. **Vercel** → Settings → Domains → añadir `atiempologistica.com` y
   `www.atiempologistica.com`. Vercel emite el certificado cuando el dominio
   resuelva.
2. **Supabase** → Authentication → URL Configuration:
   - `Site URL` → `https://atiempologistica.com`
   - Redirect URLs → añadir `https://atiempologistica.com/**`,
     **dejando** `https://atiempo-logistica.vercel.app/**`

Sin el paso 2, el correo de confirmación sigue mandando al dominio viejo y el
enlace falla para quien entre por el nuevo.

> **No hay que reimprimir guías.** Vercel mantiene vivo el `.vercel.app` junto
> al dominio nuevo, así que los QR ya impresos siguen funcionando.

### Paso 4 — El reloj de Shopify

Primero cargar el secreto. **Tiene que ser el mismo valor** que
`AT_CRON_SECRET` en Supabase → Edge Functions → Secrets:

```bash
# En el editor SQL de Supabase:
#   select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret';

aws secretsmanager put-secret-value \
  --secret-id yam/shopify-reloj \
  --secret-string '{"cron_secret":"EL-VALOR","anon_key":"LA-LLAVE-ANONIMA"}'
```

> Si `AT_CRON_SECRET` nunca se cargó en Supabase —que es lo que pasa hoy—, hay
> que ponerlo **en los dos sitios** con el mismo valor. Ese es el arreglo del
> punto 1 de `docs/arranque-produccion.md`, y es lo que hace que los pedidos de
> Shopify empiecen a entrar solos.

Probar antes de confiar:

```bash
aws lambda invoke --function-name yam-shopify-sync /dev/stdout
```

Esperado: `{"tiendas":N,"creadas":0,"fallaron":[],"ms":...}`.
Si sale `401`, los dos secretos no coinciden.

**Confirmar la suscripción de correo del SNS.** AWS manda un correo; hasta que
alguien haga clic, las alarmas no llegan a nadie. Es el fallo más típico al
montar esto.

Y solo cuando la Lambda haya corrido bien un par de veces, **apagar el cron
viejo** o se ejecutarán los dos:

```sql
select cron.unschedule('at-shopify');
```

### Paso 5 — SES

Verificar que el dominio quedó verificado y **pedir la salida del sandbox** por
la consola de SES. Lo aprueba AWS a mano y tarda: pídelo el mismo día que
apliques esto, no el día que lo necesites.

Mientras esté en sandbox, SES solo envía a direcciones verificadas a mano. La
app sigue mandando los correos por Supabase, así que nada se rompe.

### Paso 6 — Los logos

```bash
aws s3 sync ./logos s3://$(terraform output -raw bucket_logos)/ --cache-control "public, max-age=31536000, immutable"
```

Y en la app, apuntar a `terraform output cdn_logos`. Eso es un cambio de código
aparte y opcional: mientras no se haga, los logos siguen saliendo de Supabase y
todo funciona.

---

## Cómo revertir

Cada pieza por su cuenta, sin tocar las demás:

| Pieza | Vuelta atrás |
| --- | --- |
| DNS | Devolver los NS del registrador a los de antes. Minutos. |
| Shopify | `select cron.schedule('at-shopify', …)` con la migración 0082 y desactivar la regla de EventBridge. |
| Logos | Volver a apuntar la app a Supabase. |
| SES | No hay nada que revertir: hasta que Supabase lo use, no manda ni un correo. |

Y todo junto: `terraform destroy`. Como nada de esto sirve tráfico de la
plataforma, destruirlo no tumba la app — solo deja el dominio sin resolver, y
para eso está la fila de DNS de arriba.

---

## Lo que este Terraform NO valida por ti

Se escribió sin poder ejecutar `terraform validate` (el entorno donde se generó
no tiene ni Terraform ni salida de red a AWS). **El `plan` del paso 2 es la
primera verificación real.** Es de esperar que algo haya que ajustar: leedlo con
esa idea, no dando por hecho que está bien.

Puntos donde es más probable que salte:

- El id de la política de caché gestionada de CloudFront (`cache_policy_id` en
  `logos.tf`) — está copiado de la documentación de AWS; si cambió, el plan lo
  dirá.
- `use_lockfile` en el backend de S3 exige Terraform ≥ 1.10. Con una versión
  anterior hay que volver a la tabla de DynamoDB.
- El nombre del bucket de logos tiene que ser único en todo AWS. Si está
  cogido, cambiar `atl-yam-logos-marca`.
