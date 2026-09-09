---
name: migracion-aws
description: Conduce la migración de A Tiempo Logística (YAM) de Supabase a AWS, fase por fase, hasta el punto máximo (camino A y luego camino B nativo). Úsalo siempre que se trabaje en esta migración — montar staging o los tests de base de la Fase 0, aplicar el Terraform de infra/aws/1-hibrido o infra/aws/2-plataforma, planear o ejecutar el corte a Aurora/ECS, mover Realtime a IoT Core, pasar las RPC a una API propia, migrar GoTrue a Cognito — o cuando Henry diga "seguí con lo de AWS", "la migración", "camino A/B", "Fase 0/1/2", "el cutover", "staging", "Aurora", "RDS Proxy" o "IoT Core". También para saber por dónde va y qué sigue.
---

# Conducir la migración a AWS de YAM

Esta migración se decidió el 2026-09-08 (Vía 5). El plan completo, sus fases y
sus puertas están en **`docs/migracion-aws/plan-maestro.md`**. El estado vivo —
qué está hecho y qué sigue — está en **`docs/migracion-aws/estado.md`**. El
porqué y la alternativa descartada, en **`20 Decisiones/ADR-0008`** de la bóveda
(`C:\Users\tabor\CLAUDE_CDH`).

## Lo primero, cada vez

1. Lee `CLAUDE.md` del repo (dónde está cada cosa) y la bóveda del frente (por
   qué es como es). Es la rutina normal del proyecto, no una excepción.
2. Lee `docs/migracion-aws/estado.md` de arriba abajo. **La "Fase actual" y el
   primer `[ ]` sin marcar es lo que toca.** No empieces trabajo de una fase
   posterior aunque parezca fácil.
3. Lee la sección de esa fase en `plan-maestro.md`: tiene **entrada**, **trabajo**
   y **puerta**.
4. Comprueba que la **entrada** de la fase está cumplida. Si no, el trabajo real
   es cerrar la fase anterior.

## Las reglas que no se saltan

- **Las puertas entre fases son verificación, no formalismo.** No marques una
  puerta como cerrada sin que *cada* guardián de esa fase esté en verde y
  comprobado (no «escrito», no «debería funcionar»). Un `[x]` en `estado.md`
  significa que lo viste pasar.
- **Fase 0 es bloqueante.** No se aplica **nada** de AWS que sirva tráfico —
  nada de `2-plataforma/` — hasta que la Puerta 0 esté cerrada. La Fase 1
  (`1-hibrido/`) sí puede ir en paralelo porque no toca la base ni la app.
- **El retrato-control manda.** Después de cualquier restauración o corte, corre
  `scripts/retrato.sql` y compara con el bloque de `estado.md`. **Si un número
  baja, PARA** y dilo. No sigas «a ver si se arregla».
- **Confirma el ref de Supabase antes de cada `execute_sql` o `apply_migration`.**
  Hay dos proyectos activos en la organización; producción es
  `uhbtivaepyhwfdvtpfjq`. Una migración en el equivocado toca datos de otro
  negocio. Los tests de BD **nunca** apuntan a un ref de producción
  (`tests/db/harness.ts` lo rechaza, pero léelo dos veces igual).
- **Cada cambio de esquema es una migración nueva y numerada.** No se edita una
  aplicada. Mira la carpeta antes de numerar (ya hubo una colisión en 0101; y
  faltan 0031/0039/0078/0079/0097 — parte del trabajo de la Fase 0 es aclararlo).
- **Antes de empujar: `npm run verificar`.** Tipos + lint + tests + build +
  paquete, en el orden de CI.
- **Commits**: en español, en indicativo, contando el efecto para quien usa la
  app. Autor siempre Henry:
  `git -c user.name="Henry Taborda" -c user.email="henrytaborda57@gmail.com" commit -m "..."`
- **Secretos**: en Vercel, en Supabase, en AWS Secrets Manager. Nunca en el
  repo ni en la bóveda ni en el chat. Ahí solo se escribe **dónde** están.

## Lo que NO haces sin que Henry lo diga en el momento

Estas acciones cambian producción, cuestan dinero o son difíciles de revertir.
Se explican, se pide confirmación y se espera un sí claro:

- Cualquier `terraform apply` (de `1-hibrido/` o de `2-plataforma/`).
- Crear recursos en AWS a mano (buckets de estado, secretos, salida de sandbox
  de SES).
- Tocar los NS del dominio en el registrador.
- `MANTENIMIENTO=1` / la ventana de corte de la Fase 2.
- Transferir el proyecto de Supabase o cambiarlo de organización (Fase 0.5).
- Apagar el `cron` viejo de Shopify, o cualquier `cron.unschedule`.
- Borrar el proyecto de Supabase (nunca antes de 7 días del corte, y solo si
  Henry lo pide).
- Cambiar `NEXT_PUBLIC_SUPABASE_URL` o la llave anónima en Vercel.

Lo que **sí** haces sin preguntar: leer la base y los advisors, escribir y
revisar el Terraform, montar staging local, escribir y arreglar los tests,
redactar runbooks, actualizar `estado.md` y la bitácora.

## El acceso de Claude a Supabase puede cortarse

En la Fase 0.5 (transferir el proyecto) y otra vez en la Fase 5 (apagar
Supabase), el MCP de Supabase de Claude **probablemente deja de funcionar**. Si
vas a trabajar en la base, comprueba primero que el MCP responde
(`get_project` sobre el ref). Si no, el trabajo es de código y Terraform hasta
que alguien reconecte el MCP con la cuenta destino.

## Después de la extensión de RLS a IoT Core y a la API propia

En la Fase 4, la lógica de dominio dura (la máquina de estados de la guía, los
2 intentos, la evidencia obligatoria, el límite de capacidad) **se queda en
Postgres**. ADR-0001 no se revierte del todo: lo que cambia es *quién expone la
API*, no dónde viven las reglas. Si en la Fase 4 alguien propone mover una regla
de negocio a la capa de aplicación, eso es un ADR nuevo, no un detalle de
implementación.

## Al terminar cada sesión

1. Marca en `docs/migracion-aws/estado.md` lo que cambió (con el detalle de qué
   se verificó y cómo).
2. Si cerraste una puerta de fase, actualiza la "Fase actual" de la cabecera.
3. Añade la línea del día a `40 Bitácora/AAAA-MM-DD.md` de la bóveda y su enlace
   en `00 Índice/Índice.md`.
4. Si se tomó una decisión con alternativa descartada (p. ej. Cognito sí/no,
   Vercel/Amplify), créale su ADR en `20 Decisiones/` antes de cerrar.
