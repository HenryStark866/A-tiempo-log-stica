# Lo que falta, y por qué me toca a mí

Estado al cierre del 2026-08-16. Cerrado del todo el 2026-08-24 desde `C:\dev`.

## 1 y 2 · Hechos: commits, push, y las tres migraciones en Supabase

Lo que el cierre del 16 de agosto dejó pendiente por un `.git` de solo
lectura en aquel entorno ya está resuelto — `C:\dev` no tiene ese problema.
Commiteado, pusheado a `origin/main` y desplegado en producción (Vercel
despliega solo al hacer push).

Las migraciones `0090` (precio del CSV), `0091` (documentos del mensajero
nuevo) y `0092` (rótulo: «Atendido por» + código de seguimiento en texto) ya
están aplicadas en el proyecto `uhbtivaepyhwfdvtpfjq` de Supabase — el
compartido con TaxiYa. Se corrieron desde el SQL Editor del dashboard, con
sesión iniciada por Henry, y se verificaron en vivo después de aplicarlas:
`at_parse_money('89900,00')` devuelve `89900.00`, no `8990000`; las tres
funciones (`at_parse_money`, `at_register_courier_doc`, `at_label_data`)
existen en `pg_proc`.

No hay `service_role key` ni CLI de Supabase enlazado en este entorno — por
eso se aplicaron a mano por el editor SQL en vez de con `supabase db push`.
Si en algún momento se enlaza el CLI, reaplicar estas tres migraciones es
inofensivo: todas usan `create or replace` / `if not exists`, están escritas
para poder correr dos veces sin romper nada.

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
