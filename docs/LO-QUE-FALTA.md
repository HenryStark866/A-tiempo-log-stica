# Lo que falta, y por qué me toca a mí

Estado al 2026-08-16, tarde.

Todo lo que se podía hacer sin credenciales ni terminal en tu máquina está
hecho. Esto es lo que queda, con el motivo exacto por el que no lo pude hacer
yo — no es cautela, es que no alcanzo.

---

## Ahora mismo: dos clics

### 1. Commitear y publicar

**Doble clic en `EJECUTAR-commit.bat`**, en la raíz del repo.

Hace los cinco commits en orden, pero **verifica antes**: `typecheck`, `lint`,
`test:run` y `build`. Si alguno falla, se para y no commitea nada — más vale
quedarse a medias limpio que publicar algo que no compila.

Al final te pregunta si publicar. Si dices que sí, el CI arranca solo por
primera vez: <https://github.com/HenryStark866/A-tiempo-log-stica/actions>

> **Por qué no lo hago yo:** el `.git` del repo está montado en solo lectura
> desde mi entorno. No puedo crear el `index.lock` que git necesita para
> escribir. Lo comprobé también después de mover el repo, por si el montaje
> nuevo se comportaba distinto: no.

### 2. Rellenar dos variables

En `infra/aws/1-hibrido/terraform.tfvars` — ya está creado, con todo lo demás
resuelto. Faltan dos, marcadas con `← RELLENAR`:

| Variable | De dónde sale |
| --- | --- |
| `correo_alertas` | Lo decides tú. Mejor una lista de los tres socios que un correo personal: el punto focal rota cada semana |
| `vercel_ip` | [vercel.com/dashboard](https://vercel.com/dashboard) → proyecto → Settings → Domains → Add `atiempologistica.com` → copiar el registro A de la tarjeta |

> **Por qué no lo hago yo:** la IP hay que leerla del panel de Vercel, que es
> tuyo. Y **no hay una IP única** — los proyectos nuevos toman una de un pool
> según plan y proyecto, así que inventarla o copiarla de un tutorial es
> exactamente como acaban los dominios apuntando a ninguna parte.

---

## Después: el dominio

Sigue `docs/paso-a-paso-dominio.md` desde el paso 2. El resumen:

```powershell
cd C:\dev\a-tiempo-logistica\infra\aws\1-hibrido
terraform init
terraform plan -out=plan.tfplan     # LEELO ENTERO: ~25 recursos, 0 destroy
terraform apply plan.tfplan
terraform output servidores_de_nombres
```

Luego los cuatro servidores de nombres van a tu **registrador**, y después
Vercel y Supabase. El paso de Supabase (`Site URL` + `Redirect URLs`) es el que
siempre se olvida y el que rompe los registros nuevos.

> **Por qué no lo hago yo:** mi entorno **no tiene salida de red a AWS**
> (`sts.amazonaws.com` no responde), ni `terraform`, ni la CLI de AWS, y no
> puedo instalarlos. Y tus credenciales de AWS no debo manejarlas.
>
> Además, este Terraform **nunca ha pasado por un `terraform plan`**. Ese plan
> es su primera verificación real. Léelo con esa idea; es de esperar que algo
> haya que ajustar, y los puntos más probables están listados en
> `infra/aws/README.md`.

---

## Lo que sigue pendiente, sin prisa

| Qué | Por qué importa | Bloqueado en |
| --- | --- | --- |
| **Staging de Supabase** (`npx supabase start` + `db reset`) | Enciende los tests de `tests/db/`, y es lo único que dirá si las 78 migraciones aplican en orden desde cero | Docker, que no tengo |
| **`AT_CRON_SECRET` en Supabase** | Los pedidos de Shopify **no están entrando solos**: la función responde 401 | Panel de Supabase |
| **Decidir lo de la evidencia de entrega** | Hoy solo se exige en contraentrega, y el README promete que siempre. En un e-commerce las prepagadas son la mayoría | Decisión de negocio, tuya |
| **Subir la organización de Supabase a Pro** | En Free no hay respaldos diarios y el proyecto se pausa por inactividad | Tu tarjeta |

---

## Lo que sí quedó hecho

- Auditoría del repo y **25 notas de memoria** en la bóveda de Obsidian.
- **50 tests unitarios**, verificados pasando. Zonas y tarifas, hora de
  Medellín, formato de dinero, ordenamiento de ruta, la marca.
- **6 archivos de tests contra la base**, escritos leyendo el SQL real de las
  migraciones. Se saltan solos hasta que haya staging.
- **Observabilidad sin dependencias**: errores del navegador y avisos de CSP a
  los Runtime Logs de Vercel. Habría cazado el mapa gris el primer día.
- **CI** en GitHub Actions.
- **Dos pilas de Terraform**: la híbrida (dominio, correo, CDN, el reloj de
  Shopify) y la plataforma completa en AWS para cuando toque.
- El repo **fuera de OneDrive**, que es lo que causaba los candados de git.
- Un bug real arreglado: un regex con caracteres invisibles en
  `normalizarBusqueda`.

Y dos discrepancias entre el README y el código que nadie había visto — están
en `docs/traspaso-claude-code-2026-08-16.md`, sección 3.bis.
