# Dejar todo bajo atiempologistica.com

Paso a paso, en orden. Cada bloque termina con **cómo comprobar que quedó** —
si esa comprobación no da lo que dice, no sigas al siguiente.

Los pasos 1 a 4 se pueden hacer **hoy**: son baratos, reversibles en minutos y
dejan el dominio funcionando. El paso 5 es la migración de la plataforma y es
otra conversación: no lo empieces el mismo día.

---

## Antes de nada: hay un candado de git colgado

`.git/index.lock` existe y bloquea cualquier `git add` o `git commit`. Viene de
un commit interrumpido — en Antigravity el estado decía `In COMMIT_EDITMSG`.

```bash
# Comprueba que no hay ningún git corriendo de verdad, y bórralo:
rm -f ".git/index.lock"
git status
```

---

## Paso 1 — Commitear lo de hoy

Dos commits, y el primero va **solo**.

```bash
# 1.a — Finales de línea. Toca 31 archivos y no cambia un carácter de código.
git add --renormalize .
git diff --cached --stat        # confirma que solo hay cambios de espacios
git commit -m "chore: finales de linea en LF, para que los diffs se lean"

# 1.b — Lo demás, verificando primero
npm install
npm run typecheck && npm run lint && npm run test:run && npm run build
```

Si el build falla, **arréglalo antes de commitear**: nada de esto se ha
compilado nunca. Cuando pase:

```bash
git add src/ tests/ vitest.config.ts package.json package-lock.json .env.example
git commit -m "test: red de seguridad sobre zonas, tarifas y hora de Medellin"

git add .github/ .gitattributes
git commit -m "chore: verificacion automatica en cada cambio"

git add infra/ docs/
git commit -m "feat: infraestructura de AWS para el dominio propio y el reloj de Shopify"

git push
```

**Comprobar:** el CI arranca solo en GitHub y pasa en verde. Es la primera vez
que corre.

---

## Paso 2 — La zona de DNS en Route 53

**Primero saca la IP de Vercel**, que es obligatoria y no tiene valor por
defecto. No hay una IP única: los proyectos nuevos toman una de un pool según
plan y proyecto. Entra a **Vercel → tu proyecto → Settings → Domains**, añade
`atiempologistica.com` y **copia el valor del registro A que te muestre la
tarjeta**. Puede ser `76.76.21.21` o `216.198.79.1` u otra.

```bash
cd infra/aws/1-hibrido
cp terraform.tfvars.example terraform.tfvars
# Completar correo_alertas, supabase_url y vercel_ip

terraform init
terraform plan -out=plan.tfplan     # léelo entero: ~25 recursos, 0 destroy
terraform apply plan.tfplan

terraform output servidores_de_nombres
```

**Esto todavía no cambia nada.** La zona existe pero no la consulta nadie:
quien manda sigue siendo tu registrador. Por eso es seguro hacerlo primero.

**Comprobar:** `terraform output` devuelve cuatro servidores tipo
`ns-123.awsdns-45.com`.

---

## Paso 3 — Apuntar el registrador

En el panel donde compraste `atiempologistica.com`, sustituye los servidores de
nombres por los cuatro del paso anterior.

Tarda entre minutos y unas horas.

**Comprobar:**

```bash
dig +short NS atiempologistica.com     # los cuatro de AWS
dig +short A  atiempologistica.com     # la IP que te dio Vercel
```

Hasta que el primero devuelva los de AWS, no sigas.

---

## Paso 4 — El dominio sirviendo la app

Tres sitios, en este orden. **El tercero es el que siempre se olvida.**

### 4.a Vercel

Settings → Domains → Add:
- `atiempologistica.com`
- `www.atiempologistica.com`

Vercel emite el certificado HTTPS solo cuando el dominio ya resuelve, así que
esto va después del paso 3, no antes.

### 4.b Comprobar que carga

```bash
curl -sI https://atiempologistica.com | head -1          # HTTP/2 200
curl -s https://atiempologistica.com/api/version         # {"version":"...","hora":...}
```

### 4.c Supabase — sin esto, los registros nuevos se rompen

Authentication → URL Configuration:

| Campo | Valor |
| --- | --- |
| `Site URL` | `https://atiempologistica.com` |
| `Redirect URLs` | añadir `https://atiempologistica.com/**` |

**Deja también `https://atiempo-logistica.vercel.app/**` en la lista.**

Si te saltas esto, el correo de confirmación sigue mandando al dominio viejo y
el enlace falla para quien entre por el nuevo. La cuenta se crea pero nunca se
activa, y el comercio se queda fuera sin entender por qué.

**Comprobar, y esto hazlo de verdad:** registra una cuenta de prueba en
`https://atiempologistica.com/registro`, abre el correo, confirma, y entra.

> **Las guías impresas siguen funcionando.** Vercel mantiene vivo el
> `.vercel.app` junto al dominio nuevo, así que los QR ya pegados a cajas no hay
> que reimprimirlos.

---

## Paso 5 — La plataforma en AWS *(otro día)*

Esto mueve la base de datos y la autenticación. **No lo hagas el mismo día que
lo anterior**, y no lo hagas hasta que:

- Los tests de `tests/db/` hayan corrido contra staging y estén en verde.
- El CI lleve unos días pasando.
- Hayas decidido si terminas antes la mudanza de Supabase pendiente
  (`docs/reconstruir-en-el-proyecto-nuevo.md`).

El detalle está en `infra/aws/2-plataforma/README.md`. El resumen del corte:

```
1. terraform apply            → levanta la pila sirviendo a nadie
2. Replicación lógica         → días corriendo, hasta retardo de segundos
3. Verificar contra el retrato → 28 tablas, 111 funciones, 55 políticas…
                                 Si un número baja, PARAR
4. MANTENIMIENTO=1 en Vercel  → desde aquí nadie escribe
5. Última sincronización, cambiar las dos variables de Supabase
6. MANTENIMIENTO=0            → un solo despliegue para las dos cosas
7. Supabase se deja intacto días
```

La vuelta atrás son dos variables de entorno y un redespliegue: dos minutos.
Por eso el proyecto viejo no se borra hasta que pasen unos días.

Ventana real de escritura bloqueada: minutos. Lo que se alarga es verificar, y
eso se hace sin prisa, de noche y sin reparto, avisando antes a los comercios.

---

## Qué queda en cada dominio al final

| Dirección | Qué sirve | Desde cuándo |
| --- | --- | --- |
| `atiempologistica.com` | La app (Vercel) | Paso 4 |
| `www.atiempologistica.com` | Redirige a la anterior | Paso 4 |
| `atiempo-logistica.vercel.app` | Sigue viva: los QR impresos | Siempre |
| `correo.atiempologistica.com` | Remitente de SES | Paso 2 |
| `api.atiempologistica.com` | La pila de Supabase en AWS | Paso 5 |

---

## Si algo sale mal

| Qué pasó | Vuelta atrás |
| --- | --- |
| El dominio no resuelve | Devuelve los servidores de nombres viejos en el registrador |
| Los correos de confirmación no llegan | Devuelve `Site URL` al `.vercel.app` en Supabase |
| El reloj de Shopify falla | `select cron.schedule('at-shopify', …)` de la migración 0082 |
| La plataforma en AWS da problemas | Las dos variables de Supabase al proyecto viejo + redesplegar |

Ninguno de estos pasos es de una sola dirección. Eso es a propósito.
