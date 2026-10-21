# Fase 1b — Runbook de Amplify (preparado 2026-10-18, NADA ejecutado)

Cuenta `126356678380` · usuario `henry-terraform`. Todo lo de abajo crea recursos o cambia DNS:
lo ejecuta Henry, comando por comando. `$REGION` = la que se decida en 1b.1 (recomendada: `us-west-2`).

## 0. Bloqueo previo: Supabase está pausado
`get_project uhbtivaepyhwfdvtpfjq` -> `status: INACTIVE` y el host `uhbtivaepyhwfdvtpfjq.supabase.co`
da NXDOMAIN (probado con DNS local, 8.8.8.8 y 1.1.1.1). Sin reactivarlo (pagar la org / restaurar
desde el panel de Supabase) no hay login ni datos: ni 1b.4 se puede verificar. Reactivar ANTES de todo.

## 1b.1 Región
Recomendada `us-west-2` (misma región que Supabase; Vercel hoy está en `sfo1`, ver `vercel.json`).
`us-east-1` añade ~60-70 ms a CADA consulta servidor->base (el middleware hace `getUser` en cada request).
El navegador consulta Supabase directo, así que su latencia no cambia. Medir con `/api/salud` en ambas si se duda.

## 1b.3 Crear la app (Henry)
```bash
export AWS_REGION=us-west-2
# a) token de GitHub (PAT con acceso de lectura al repo) -> NO pegarlo en chat ni en archivos
aws amplify create-app --name yam-web --platform WEB_COMPUTE \
  --repository https://github.com/HenryStark866/A-tiempo-log-stica \
  --access-token "$GITHUB_PAT" \
  --environment-variables NEXT_PUBLIC_SUPABASE_URL=https://uhbtivaepyhwfdvtpfjq.supabase.co,NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>,NEXT_PUBLIC_APP_URL=https://<id>.amplifyapp.com,AMPLIFY_MONOREPO_APP_ROOT=,_LIVE_UPDATES=[] \
  --query app.appId --output text
# (alternativa sin PAT: crear la app desde la consola y autorizar la app de GitHub de Amplify)
export APP=<appId>
aws amplify create-branch --app-id $APP --branch-name main --framework "Next.js - SSR" --stage PRODUCTION --enable-auto-build
```
Secretos (solo servidor), en SSM, no en la consola: parámetros `SecureString` bajo
`/amplify/$APP/main/<NOMBRE>` (`SUPABASE_SERVICE_ROLE_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `OPENWA_API_KEY`):
```bash
aws ssm put-parameter --name /amplify/$APP/main/SUPABASE_SERVICE_ROLE_KEY --type SecureString --value "$(read -rs v; echo $v)"
```
El rol de servicio de Amplify necesita `ssm:GetParameter(s)` sobre ese path (toca IAM: decisión de Henry; plan B:
cargarlos como variables de la rama marcadas como secretas). `amplify.yml` (raíz del repo) los vuelca a `.env.production`.
Hay que commitear/mergear `amplify.yml` y el cambio de `next.config.ts` a `main` ANTES del primer build.
```bash
aws amplify start-job --app-id $APP --branch-name main --job-type RELEASE
aws amplify list-jobs --app-id $APP --branch-name main --max-items 1
aws amplify get-app --app-id $APP --query app.defaultDomain --output text   # -> <id>.amplifyapp.com
```
Hay que completar `NEXT_PUBLIC_APP_URL` (usada en el retorno de pago de Polar) con la URL real y relanzar el build.

## 1b.4 Verificación en `https://main.<defaultDomain>`
`curl -s https://main.<dominio>/api/version` -> el SHA de 8 caracteres del commit (no `local`); `/api/salud` 200;
luego a mano: login de comercio, Mis pedidos, Mi recaudo, documento de mensajero, crear/borrar pedido de prueba.
En Supabase -> Auth -> URL Configuration añadir la URL de Amplify (dejando `.vercel.app` y el dominio).
Webhook de Polar: seguirá apuntando a Vercel hasta el corte; no duplicar.

## 1b.6 El corte
```bash
aws amplify create-domain-association --app-id $APP --domain-name atiempologistica.com \
  --sub-domain-settings prefix=,branchName=main prefix=www,branchName=main
aws amplify get-domain-association --app-id $APP --domain-name atiempologistica.com   # registros de verificación/CNAME
```
Si la zona es Route 53 en la MISMA cuenta, Amplify crea los registros solo. Orden: (1) bajar TTL en GoDaddy a 300 s un día antes;
(2) copiar a la zona Route 53 (Z00731932557L273KRWPD) TODOS los registros actuales de GoDaddy (MX, TXT/SPF/DKIM, SES) antes de cambiar NS;
(3) cambiar NS en GoDaddy a los 4 de `aws route53 get-hosted-zone --id Z00731932557L273KRWPD`; (4) `dig atiempologistica.com` y
`dig NS` hasta ver Amplify/CloudFront; (5) Supabase Auth URL Configuration; (6) mover el webhook de Polar y `NEXT_PUBLIC_APP_URL`.

## 1b.7 Vuelta atrás (minutos)
Devolver los NS en GoDaddy a `ns29/ns30.domaincontrol.com` (registro A a `216.198.79.1`, el de Vercel, sigue en GoDaddy) o, si ya
se propagó, en Route 53 crear A `216.198.79.1` y CNAME `www` a Vercel. No apagar Vercel hasta ≥ 7 días después del corte.
Para borrar Amplify: `aws amplify delete-domain-association` y luego `delete-app` (solo si Henry lo decide).

## Variables (nombres; nunca valores en este archivo)
- Públicas, van al navegador: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENV`. (`NEXT_PUBLIC_VERSION` NO se define: la fabrica `next.config.ts` desde `AWS_COMMIT_ID`.)
- Servidor, no secretas: `MANTENIMIENTO`, `POLAR_SERVER`, `POLAR_PRODUCT_ID`, `POLAR_ORGANIZATION_ID`, `OPENWA_API_URL`, `OPENWA_SESSION_NAME`.
- Servidor, SECRETAS (SSM): `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `OPENWA_API_KEY`.
- No usar `SUPABASE_TEST_*` en Amplify.

## Compatibilidad
Next `^15.5` con Route Handlers (`runtime = "nodejs"`) y `middleware.ts` (CSP con nonce, runtime por defecto) están soportados por Amplify WEB_COMPUTE.
`next.config.ts` no usa `output: "standalone"/"export"` (correcto: Amplify lo gestiona él). Riesgos a vigilar en el primer build:
(1) `headers()` del config (HSTS, sw.js, manifest) — comprobar con `curl -I`; (2) `/api/polar/webhook` necesita el cuerpo crudo: probar con el modo prueba de Polar;
(3) `generateBuildId` = SHA: correcto; (4) `outputFileTracingRoot: __dirname` sin problema. `.node-version`/`engines` no existen: `amplify.yml` fija Node 22 (el de CI).
