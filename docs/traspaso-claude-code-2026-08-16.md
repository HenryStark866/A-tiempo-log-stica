# Traspaso a Claude Code — 2026-08-16

Este archivo es un **encargo**, no documentación. Lo escribió una sesión de
Claude en Cowork (cuenta `cdhmaker@gmail.com`) para la sesión de Claude Code que
corre en Antigravity (cuenta `henrytaborda57@gmail.com`).

El reparto es por lo que cada uno **puede hacer**, no por preferencia:

| | Cowork | Claude Code en Antigravity |
| --- | --- | --- |
| Editar el repo | sí | sí |
| `npm install`, `npm run build`, `tsc` | **no** — npm bloqueado y `node_modules` es de Windows | **sí** |
| Docker / `supabase start` | **no** | **sí** |
| Leer y escribir `C:\Users\tabor\.claude\` | **no** — la plataforma lo protege | **sí** |
| `git commit` / `push` | no | sí |

Todo lo que sigue está en la segunda columna. Por eso te toca a ti.

---

## Contexto: qué se hizo hoy y no has visto

Se auditó el repo entero y se ejecutó la «Fase 0» (red de seguridad). Resumen de
lo **nuevo o modificado**, todo sin commitear:

| Archivo | Qué es |
| --- | --- |
| `.gitattributes` | **nuevo** — normaliza finales de línea a LF |
| `.github/workflows/ci.yml` | **nuevo** — CI: typecheck → lint → tests → build |
| `.env.example` | reescrito — documenta todas las variables, no solo las dos de Supabase |
| `vitest.config.ts` | **nuevo** |
| `package.json` | scripts `typecheck`/`test`/`test:run`/`test:db` + devDep `vitest` |
| `tests/*.test.ts` | **nuevo** — 50 tests unitarios de `src/lib`, todos pasando |
| `tests/db/` | **nuevo** — harness + tests de RLS, máquina de estados y **cobro**. Se saltan solos sin staging |
| `src/lib/observabilidad.ts` | **nuevo** — reporte de errores sin dependencias |
| `src/app/api/telemetria/route.ts` | **nuevo** — recibe errores y avisos de CSP → Runtime Logs de Vercel |
| `src/components/CapturaDeErrores.tsx` | **nuevo** — captura errores async y promesas sin catch |
| `src/middleware.ts` | `/api/telemetria` público + `report-uri`/`report-to` en la CSP + `Reporting-Endpoints` |
| `src/components/PantallaError.tsx`, `src/app/global-error.tsx` | reportan al boundary |
| `src/app/layout.tsx` | monta `<CapturaDeErrores />` |
| `src/lib/utils.ts` | arreglado un regex con caracteres invisibles (ver tarea 4) |

**No se pudo verificar `npm run build`, `npm run lint` ni `tsc --noEmit`.** Se
verificó que todos los módulos parsean y que los 50 tests pasan, con un runner
improvisado sobre `node --experimental-strip-types`. El build real es tuyo.

---

## Tareas, en orden

### 1. Finales de línea — primero, y solo

`git status` marca **31 archivos modificados que nadie tocó**: 9.575 líneas
insertadas y 9.476 borradas, todas idénticas. Es CRLF contra LF. El repo se
guardó con LF, se abrió en Windows sin `core.autocrlf` y no había
`.gitattributes`.

Con ese ruido `git diff` no sirve y ningún PR es revisable — o sea que bloquea
todo lo demás.

```bash
git add --renormalize .
git commit -m "chore: finales de linea en LF, para que los diffs se lean"
```

**Ese commit va solo, sin nada más dentro.** Toca muchos archivos y no cambia un
carácter de código. Verifica antes con `git diff --stat` que efectivamente no
hay cambios de contenido.

### 2. Instalar, verificar y commitear la Fase 0

```bash
npm install          # entra vitest
npm run typecheck
npm run lint
npm run test:run     # esperado: 50 passed
npm run build
```

Si algo falla, **arréglalo** — es código nuevo sin estrenar, es lo esperable.
Los puntos donde más probable es que salte:

- `vitest.config.ts` importa de `vitest/config`; el `tsconfig.json` incluye
  `**/*.ts`, así que también lo typechequea.
- `tests/db/harness.ts` importa `@supabase/supabase-js`, que ya es dependencia.
- `src/app/api/telemetria/route.ts` exporta `runtime = "nodejs"`.

Commits separados y en español, contando el efecto (la convención del repo):

- `feat: la app avisa cuando algo se rompe, en vez de esperar el reclamo`
- `test: red de seguridad sobre zonas, tarifas y hora de Medellin`
- `chore: verificacion automatica en cada cambio`

### 3. Staging y los tests de base — lo que más vale

```bash
npx supabase@latest start
npx supabase@latest db reset     # aplica las 78 migraciones desde cero
```

Pon las tres variables que imprime en `.env.local`
(`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_KEY`) y
corre `npm run test:db`.

**Van a fallar varios la primera vez.** Los nombres de columnas y los parámetros
de las RPC están deducidos leyendo el frontend, no el esquema. Cuadrarlos contra
la base real es el trabajo. Detalle en `tests/db/README.md`.

Dos cosas que este paso responde y hoy nadie sabe:

- Si las **78 migraciones aplican en orden desde cero**. Faltan la `0078` y la
  `0079` en la numeración — averigua si es intencional.
- Si las **55 políticas RLS** aguantan lo que dicen aguantar.

**`tests/db/cobro.test.ts` ya está escrito** y leído contra el SQL real de las
migraciones 0051, 0057, 0058 y 0062 — no adivinado. Cubre `at_cobro_de_guia`
(el criterio único), la devolución contra `return_rate`, el ciclo de 24 h y
`at_estado_cartera`.

También está **`tests/db/recaudo.test.ts`**, sobre el efectivo contraentrega:
el invariante `disponible = bruto − flete_nuestro`, que la deuda de fletes se
informe pero no se descuente sola, y que un comercio no pueda girarse el
recaudo a sí mismo.

**Dato que te va a ahorrar media hora:** `at_generate_invoice` y
`at_generate_cod_remittance` exigen `at_is_ops()`, y **`service_role` no la
cumple** — `auth.uid()` es null con esa llave. Hace falta una sesión de admin
de verdad. Los tests ya la crean, pero si escribes más, tenlo presente: el
error que devuelven es de negocio y despista.

Lo que falta está anotado al pie de cada archivo y en `tests/db/README.md`, por
orden de lo que más dinero mueve. Los tres primeros son del recaudo y necesitan
montar una guía COD entregada con su `at_settlement`: que un cierre de caja sin
conciliar no se gire, que no se gire dos veces, y que el flete cobrado en la
puerta no se descuente y se cobre a la vez.

### 3.bis Dos discrepancias entre el README y el código — **decisión de Henry**

Salieron de leer el SQL para escribir los tests. En los dos casos el código es
coherente consigo mismo (base y frontend dicen lo mismo); lo que falla es lo que
el README promete. **No las "arregles" tú**: son decisiones de negocio.

**a) La evidencia de entrega solo se exige en contraentrega.**
`at_confirm_delivery` (migración 0047):

```sql
if v_guide.is_cod and coalesce(length(trim(p_evidence_url)), 0) = 0 then
```

Una guía prepagada se cierra sin foto, sin firma y sin código. El frontend hace
lo mismo: en `entregas/page.tsx` el asterisco de obligatorio y el `disabled` del
botón llevan los dos `modal.guide.is_cod`. Pero el README (Regla 4) dice que
*ninguna* guía se cierra sin prueba, y lo marca como hecho.

En un SaaS de e-commerce las prepagadas son la mayoría del volumen: de todas
esas entregas hoy no queda ninguna prueba ante un «no me llegó».

**b) La capacidad del mensajero no distingue vehículo.** El README promete
25-30 kg en moto y 10 kg en bicicleta; la base tiene un solo
`at_profiles.max_capacity` en **paquetes** (default 30). El bloqueo por
sobrecarga sí funciona — lo que no existe es el peso ni el tipo de vehículo.

Los tests de `maquina-de-estados.test.ts` **documentan el hueco** en vez de
fingir que no está: escribirlos según el README solo daría rojos que nadie
sabría interpretar. Cuando Henry decida, se cambian con la decisión y se crea
el ADR.

### 4. Revisar un arreglo pequeño

`src/lib/utils.ts` → `normalizarBusqueda` tenía el rango de marcas combinantes
escrito con los **caracteres literales** (U+0300, U+036F) dentro del regex, en
vez del escape `\u0300-\u036f` que sí usa `zones.ts`. Invisibles en el editor.

Funcionaba, pero cualquier herramienta que normalice Unicode al guardar podía
cambiarle el significado sin verse en el diff — y esa función decide qué
encuentra la gente al buscar. Se igualó a `zones.ts` y hay un test que fija la
equivalencia entre las dos. **Confírmalo y déjalo.**

### 5. Consolidar las dos bóvedas de memoria — importante

Hay **dos**, y eso es un problema:

| Bóveda | Qué tiene |
| --- | --- |
| `C:\Users\tabor\MR Stark` | La tuya. Junctions a las carpetas reales de `C:\Users\tabor\.claude\`. 29 notas en 7 proyectos — pero **`A-TIEMPO-LIGISTIC` tiene 1 sola nota** |
| `C:\Users\tabor\CLAUDE_CDH` | Creada hoy desde Cowork. **22 notas, todas de YAM**: arquitectura, modelo de datos y RLS, reglas de negocio, perfiles, estado de producción, auditoría técnica, plan de migración a AWS, plan de apps nativas, backlog priorizado, 3 ADR y bitácora |

Se creó una segunda por desconocimiento: Henry apuntó a una carpeta vacía y no
se sabía que `MR Stark` existía. **Tú sí puedes escribir en `.claude\`; Cowork
no.** Así que la consolidación te toca:

1. Lee `C:\Users\tabor\MR Stark\Inicio.md` — ahí está el formato que usas:
   frontmatter con `name`, `description`, `metadata.type` (`user`, `feedback`,
   `project`, `reference`), y **una línea por nota en el `MEMORY.md`** de la
   carpeta.
2. Lee las 22 notas de `C:\Users\tabor\CLAUDE_CDH` (léelas enteras, no por
   encima: son el resultado de auditar el repo completo).
3. Pásalas a la carpeta real de memoria de `A-TIEMPO-LIGISTIC`, **adaptadas a tu
   formato**, y añade sus líneas al `MEMORY.md`.
4. Contrasta con la nota que ya tenías: si se contradicen, gana lo que puedas
   verificar contra el repo, y deja anotada la discrepancia.
5. Cuando esté, dile a Henry que puede borrar `C:\Users\tabor\CLAUDE_CDH` — una
   sola bóveda o volvemos a estar igual.

**No copies secretos.** Ni llaves `service_role`, ni contraseñas de base, ni
tokens de Shopify, ni `AT_CRON_SECRET`. Viven en Vercel y Supabase.

### 6. Limpieza

- Borrar la carpeta vacía `scratch\` (Cowork no tuvo permiso).
- El PDF del flujograma ya se movió a `docs\`.

---

## Lo que NO hay que hacer

- **No migrar a AWS todavía.** Hay un plan en la bóveda; la recomendación es
  híbrida y con la escala de hoy (9 comercios, 28 pedidos) no se paga sola. Y
  hay una mudanza de Supabase a medias — encadenar dos es pagar el riesgo dos
  veces.
- **No reescribir el frontend.** La calidad del código es alta. Lo que faltaba
  era red de seguridad, y es justo lo que estás terminando de poner.
- **No tocar el prefijo `ATL-`** de las guías. Está decidido y hay un test que
  lo fija: viaja impreso en rótulos en circulación.

---

## Si algo de esto no cuadra

Este archivo lo escribió una sesión que **no pudo leer tu memoria** (`.claude`
está protegido para ella) ni correr el build. Si encuentras que algo aquí
contradice lo que tú sí sabes, **gana lo tuyo** — y déjalo escrito en la memoria
del proyecto para que no se repita el malentendido.
