# Lo que falta, y por qué me toca a mí

Estado al cierre del 2026-08-16.

Todo lo que se podía hacer sin credenciales ni terminal en tu máquina está
hecho y verificado. Lo que queda son **tres acciones**, cada una con el motivo
exacto por el que no la pude hacer yo.

---

## 1 · Doble clic en `EJECUTAR-commit.bat`

En la raíz del repo.

Verifica primero —typecheck, lint, 63 tests, build— y **se para al primer fallo
sin commitear nada**. Luego hace los commits **empezando por el arreglo de la
importación**, que va solo para poder desplegarlo y revertirlo aparte del resto.
Al final pregunta si publicar; al hacer push, Vercel despliega solo.

> **Por qué no lo hago yo:** el `.git` del repo está montado en solo lectura
> desde mi entorno — no puedo crear el `index.lock` que git necesita para
> escribir. Lo comprobé también después de mover el repo a `C:\dev`, por si el
> montaje nuevo se comportaba distinto: no.

## 2 · Aplicar las migraciones `0090` y `0091` en Supabase

**El despliegue no las aplica.** Es un paso aparte, y las dos llevan sus
propias aserciones: si algo falla, no se aplican.

[supabase.com/dashboard](https://supabase.com/dashboard) → proyecto
`uhbtivaepyhwfdvtpfjq` (el compartido con TaxiYa, prefijo `at_` — **no** el de
IncubApp) → SQL Editor → pega el contenido de cada archivo, en este orden, y
Run:

1. `supabase/migrations/0090_el_precio_del_csv_no_se_multiplica_por_cien.sql`
   — sin ella, un precio como `89900,00` se sigue guardando como
   **8.990.000**. Después, revisa lo ya cargado con la consulta que está al
   pie del archivo: un precio de siete cifras en el catálogo casi siempre es
   este fallo.
2. `supabase/migrations/0091_el_mensajero_nuevo_puede_subir_sus_documentos.sql`
   — sin ella, nadie que se registre como mensajero de aquí en adelante puede
   subir sus documentos (necesita estar habilitado para subir los papeles que
   hacen falta para habilitarlo).

(Estas dos son las que quedaron pendientes del cierre del 16 de agosto;
renumeradas de 0083/0084 a 0090/0091 porque esos números ya los usó el
trabajo que se hizo mientras tanto en otra sesión.)

> **Por qué no lo hago yo:** no tengo credenciales de base de datos para este
> proyecto en este entorno — ni MCP de Supabase conectado, ni CLI enlazado,
> ni `service_role key` en `.env.local` (solo la `anon key`, que no alcanza
> para DDL).

## 3 · Subir el archivo real que falló hoy

Es **la única prueba que cierra el incidente**. Que entre completo.

Si vuelve a fallar, ahora sí queda registro: busca `[yam]` en los Runtime Logs
de Vercel. Los tres puntos de fallo de la importación reportan telemetría.

> **Por qué no lo hago yo:** no tengo el archivo ni acceso a la cuenta del
> comercio.

---

## Después, sin prisa

| Qué | Por qué importa | Bloqueado en |
| --- | --- | --- |
| El dominio `atiempologistica.com` | `docs/paso-a-paso-dominio.md`, desde el paso 2. Falta la IP de Vercel en `terraform.tfvars` | Panel de Vercel + tu registrador |
| **Staging** (`npx supabase start` + `db reset`) | Enciende los **43 tests de base** que están escritos y esperando. Y dirá si las 78 migraciones aplican desde cero | Docker |
| `AT_CRON_SECRET` en Supabase | Los pedidos de Shopify **no entran solos**: la función responde 401 | Panel de Supabase |
| Decidir lo de la evidencia de entrega | Hoy solo se exige en contraentrega; el README promete que siempre | Decisión tuya |
| Subir la organización de Supabase a Pro | En Free no hay respaldos diarios y el proyecto se pausa | Tu tarjeta |

---

## Lo que quedó hecho y verificado

**El incidente de hoy.** La importación de la base de compradores fallaba porque
el payload llevaba todas las columnas sin mapear del archivo en un campo que
`at_recipients` no tiene. Un export de e-commerce trae 50-70 columnas y el mapeo
usa seis. Arreglado, con lotes por peso del JSON, el bucle de productos ya no se
traga los errores, y una importación a medias dice cuántas entraron.

**63 tests unitarios pasando**, verificados ejecutándolos. Zonas y tarifas, hora
de Medellín, formato de dinero, ordenamiento de ruta, marca, y 13 nuevos de
importación — uno de ellos fija que el payload no vuelva a crecer con columnas
que no se mapean.

**43 tests contra la base**, escritos leyendo el SQL real de las migraciones:
RLS por rol, máquina de estados, cobro, recaudo contraentrega y catálogo. Se
saltan solos hasta que haya staging.

**Observabilidad sin dependencias**: errores del navegador y avisos de CSP a los
Runtime Logs de Vercel. Habría cazado el mapa gris el primer día.

**CI** en GitHub Actions. **Dos pilas de Terraform** para AWS. El repo **fuera
de OneDrive**, que causaba los candados de git. Y **25 notas de memoria** en la
bóveda de Obsidian.

Tres bugs reales encontrados y corregidos: el payload de la importación, el
precio multiplicado por cien, y un regex con caracteres invisibles en
`normalizarBusqueda`. Más dos discrepancias entre el README y el código que
nadie había visto — están en `docs/traspaso-claude-code-2026-08-16.md`.
