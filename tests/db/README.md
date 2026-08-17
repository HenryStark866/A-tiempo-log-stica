# Tests contra la base

## Por qué están aquí y no en `tests/`

La lógica de negocio de YAM vive en Postgres: 111 funciones y 55 políticas RLS.
`npm run build` no las mira. Estos tests son el único filtro posible sobre ellas,
pero necesitan una base de verdad, así que se separan de los tests unitarios —
que corren siempre y en dos segundos.

## Estado

**Escritos, sin ejecutar todavía.** Se saltan solos mientras no haya una base de
pruebas configurada, así que CI está en verde con ellos dentro.

La primera ejecución contra staging **va a fallar en varios**: los nombres de
columnas y los parámetros de las RPC están deducidos desde el frontend, y el
esquema real puede llamarlos de otra forma. Cuadrarlos es trabajo de una tarde,
y es trabajo que solo se puede hacer con la base delante.

## Levantarlos

### Local — no cuesta nada

```bash
npx supabase@latest start
npx supabase@latest db reset     # aplica las 78 migraciones desde cero
```

Imprime `API URL`, `anon key` y `service_role key`. A `.env.local`:

```
SUPABASE_TEST_URL=http://127.0.0.1:54321
SUPABASE_TEST_ANON_KEY=...
SUPABASE_TEST_SERVICE_KEY=...
```

Y luego:

```bash
npm run test:db
```

> El `db reset` local es además la única forma de comprobar que las 78
> migraciones aplican en orden desde cero. Ahí es donde van a aparecer los
> huecos 0078 y 0079, si es que son un problema.

### Staging en la nube

Las mismas tres variables apuntando al proyecto de staging.

## La regla que no se rompe

**Nunca apuntar a producción.** La llave `service_role` se salta RLS entera y
estos tests crean y borran filas. `harness.ts` rechaza los refs conocidos de
producción y aborta, pero eso es una red, no un permiso para ir rápido.

## Qué cubre cada archivo

| Archivo | Qué protege |
| --- | --- |
| `rls.test.ts` | Que nadie sin sesión lea nada, que un comercio no vea lo de otro, que un usuario no se ascienda a admin, que el mensajero no vea la cartera |
| `maquina-de-estados.test.ts` | Reglas 4 y 5: evidencia obligatoria, máximo 2 intentos. Y que el número de guía salga con prefijo `ATL-` y sin repetirse |
| `cobro.test.ts` | `at_cobro_de_guia` (el criterio único de la migración 0062), la devolución contra `return_rate`, el ciclo de 24 h, el estado de cartera, y que **los dos caminos de facturación cobren lo mismo** |
| `recaudo.test.ts` | El efectivo contraentrega: `disponible = bruto − flete_nuestro`, que la deuda de fletes no se descuente sola, y que un comercio no pueda girarse el recaudo a sí mismo |

### Sobre `cobro.test.ts`

`at_cobro_de_guia(g at_guides)` es `stable` y recibe la fila entera, así que la
mayoría de sus casos se prueban con guías **inventadas**: sin fixtures, sin
escribir en la base y en milisegundos. Por eso ese archivo es el más barato de
correr y el que más cubre.

Lo que sí necesita filas reales son las dos pruebas de `return_rate`, porque esa
rama consulta `at_clients`.

> Si PostgREST rechaza el parámetro compuesto pasado como objeto JSON, la salida
> es insertar la guía con `service_role` y pasarle la fila leída. Está anotado
> en el propio archivo.

## Ojo con los permisos

Dos RPC de dinero exigen `at_is_ops()` y **`service_role` NO la cumple**:
`auth.uid()` es null con esa llave, así que la función la rechaza igual que a
cualquiera. `at_generate_invoice` y `at_generate_cod_remittance` necesitan una
**sesión de admin de verdad**; los tests la crean con `crearUsuario` +
`clienteComo`.

Es un detalle que cuesta media hora descubrir por las malas: el error que
devuelven es de negocio, no de permisos, y despista.

## Lo que falta escribir

Por orden de lo que más dinero mueve. Los tres primeros necesitan montar un
escenario de varias tablas encadenadas (guía COD entregada + su `at_settlement`),
y por eso se escriben con la base delante:

1. **Un cierre de caja sin conciliar no se gira.** Es lo que impide pagarle al
   comercio con plata que el mensajero todavía tiene en el bolsillo.
2. **No se gira dos veces.** Tras generar la remesa las guías quedan con
   `remittance_id`; una segunda llamada tiene que dar cero.
3. **El flete cobrado en la puerta se descuenta una sola vez** — ni descontado
   del recaudo *y* cobrado en la factura.
4. **Tarifa por par de zonas** (0051, 0057): que el precio se congele en la guía
   y que un comercio no pague por cruzar el valle si entrega al lado.
5. **La cuota SaaS no para la operación** (0075, 0080).
6. **Capacidad del mensajero** (regla 2): que la asignación bloquee la sobrecarga.
7. **Mínimo de 5 paquetes** (regla 1).
8. **Punto de cruce** (regla 3): las tres condiciones a la vez.
