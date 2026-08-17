# Infraestructura en AWS

Dos pilas, con estado separado y numeradas por el orden en que se aplican.

| | Qué monta | Riesgo | Cuándo |
| --- | --- | --- | --- |
| **`1-hibrido/`** | Route 53, SES, S3+CloudFront para logos, Lambda del reloj de Shopify, presupuesto | Bajo. No toca la base ni la app | **Hoy** |
| **`2-plataforma/`** | Aurora + RDS Proxy + la pila de Supabase en ECS, ALB, WAF, alarmas | Alto. Mueve la base y la autenticación | Cuando la Fase 0 esté verificada |

El paso a paso para el dominio está en `docs/paso-a-paso-dominio.md`.

## Por qué separadas

Porque tienen ritmos distintos. La primera se aplica hoy y se olvida; la segunda
exige una ventana de mantenimiento, verificación contra el retrato de la base y
la decisión de si se termina antes la mudanza de Supabase pendiente.

Con el estado en el mismo archivo, un `apply` para cambiar un registro DNS
tocaría también la base de datos. Separadas, no.

La zona de Route 53 la crea `1-hibrido` y `2-plataforma` la **lee** con un
`data`. Dos zonas para el mismo dominio es la forma más rápida de que el DNS
deje de resolver.

## Coste

| Pila | Al volumen de hoy |
| --- | --- |
| `1-hibrido` | < 5 USD/mes. La zona de Route 53 son 0,50; el resto cabe en la capa gratuita |
| `2-plataforma` | Del orden de 250-400 USD/mes en reposo, y sube con el tráfico |

El grueso de la segunda son cosas que se pagan estén o no en uso: el mínimo de
Aurora Serverless, el NAT Gateway, el ALB y las ocho tareas de Fargate en
reposo. **Compáralo con lo que hoy cuesta Supabase Pro + Vercel Pro antes de
aplicarla**, porque a 9 comercios la cuenta no sale — se paga en control, no en
dinero. Las cifras son un orden de magnitud, no un presupuesto: mételas en el
AWS Pricing Calculator con tus números.

## Lo que este Terraform no se ha validado

Se escribió sin `terraform` disponible ni salida de red a AWS. La estructura de
los bloques está comprobada, pero **el primer `terraform plan` es la primera
verificación de verdad**. Léelo entero, con esa idea.

Puntos donde es más probable que salte:

- La versión de Aurora (`16.4`) puede no estar disponible en tu región; el plan
  lo dice y se ajusta en una línea.
- Los nombres de bucket de S3 son únicos en todo AWS.
- Las variables de entorno de los contenedores de la pila de Supabase están
  puestas en común para los cuatro servicios. Funciona porque cada imagen ignora
  las que no conoce, pero conviene revisarlas contra la documentación de cada
  versión antes del primer arranque.
- `use_lockfile` en el backend de S3 exige Terraform ≥ 1.10.
