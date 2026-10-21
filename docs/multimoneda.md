# Multimoneda — el trabajo grande

`docs/open-payments.md` cierra con esto: «Hoy todo importe en las tablas `at_`
es un número sin moneda. Cobrar en EUR o NGN de verdad exige moneda por fila».
Este documento es el plan de ese trabajo. **No es la ejecución**: no hay aquí
una sola migración escrita, a propósito.

La frase corta: hoy la base guarda **27 columnas `numeric` de dinero en 14
tablas, y ninguna dice en qué moneda está**. Eran pesos porque todos los
comercios estaban en Medellín. Ese supuesto ya no se sostiene y hay código en
producción que lo asume sin decirlo.

## Lo primero: hay un error de cien veces esperando, y está escrito

Antes del plan, lo que encontré mirando el repo. En
`src/app/api/pagos/openpayments/iniciar/route.ts`:

```ts
/** De pesos (o euros) con decimales al entero con escala que pide el estándar. */
function aImporteEntero(monto: number, escala: number): string {
  return Math.round(monto * 10 ** escala).toString();
}
```

y más abajo:

```ts
const destino = await resolverBilletera(comercio.wallet_address);
const importe = {
  value: aImporteEntero(monto, destino.assetScale),
  assetCode: destino.assetCode,
  assetScale: destino.assetScale,
};
```

`monto` viene de `at_guides.cod_amount`, que son **pesos**. `destino.assetScale`
y `destino.assetCode` vienen de la billetera del comercio, que puede ser **EUR**.
El código toma un número en pesos y lo etiqueta con la moneda de otro. Un
pedido de `50000` contra una billetera en euros pide **50.000 EUR**, no los
~11 EUR que valen 50.000 pesos.

El comentario que hay justo encima dice lo contrario de lo que pasa:

> La escala la manda la red, no nosotros: COP suele ser 2 y hay monedas
> con 0 y con 9. Tomarla de la billetera evita cobrar cien veces de más.

Es verdad para la **escala** y falso para la **moneda**. Tomar la escala de la
billetera evita el factor 100 *si la moneda coincide*; si no coincide, lo que
se cuela no es un factor de 100, es el tipo de cambio entero.

Y hay la pieza que lo haría evidente, sin usar: la ruta ya hace
`select ... wallet_asset_code ...` de `at_clients` y **nunca lo compara** con
`destino.assetCode`. La columna existe desde la 0147 y está ahí sin leerse.

**Esto no está cobrando mal hoy**, por dos razones que no son diseño: no hay
pantalla que llene `wallet_verified_at` (la ruta exige esa columna y falla con
409 antes de llegar al cálculo) y no hay comercios fuera de Colombia. Las dos
cosas se caen el día que alguien verifique la primera billetera en euros. Por
eso la Fase 0 de abajo es un freno, no una mejora.

## Qué hay hoy: el inventario completo

27 columnas `numeric` de dinero en 14 tablas, más 2 columnas de importe ya
bien hechas en `at_pagos_op` (texto + moneda + escala, estilo Open Payments).

### Lo que le cobramos al comercio — el tarifario

| Tabla | Columna | Qué es | Quién la escribe |
| --- | --- | --- | --- |
| `at_clients` | `delivery_rate` | tarifa por entrega, último recurso del tarifario | ops, pantalla `clientes` |
| `at_clients` | `return_rate` | tarifa por devolución (logística inversa) | ops, pantalla `clientes` |
| `at_zones` | `delivery_rate` | tarifa por zona de destino | ops, migraciones 0009/0114/0123 |
| `at_zone_pair_rates` | `delivery_rate` | tarifa por par (zona origen → zona destino) | ops, `TarifarioMatriz.tsx`, migración 0051 |
| `at_zone_costs` | `courier_fee` | lo que se le **paga** al mensajero (no lo que se cobra) | ops; RLS solo-staff para no filtrar el margen |

Las tres `delivery_rate` no son alternativas: son una **cascada**, resuelta en
`at_precio_domicilio` (migración 0072) con un `coalesce` de cuatro niveles —
par de zonas → zona de destino → comercio → `0`. Cualquier diseño de moneda
tiene que respetar esa cascada o romperá el precio en silencio.

### El pedido

| Tabla | Columna | Qué es | Quién la escribe |
| --- | --- | --- | --- |
| `at_guides` | `declared_value` | valor declarado del contenido | quien crea la guía |
| `at_guides` | `cod_amount` | lo que el mensajero recauda contraentrega | quien crea la guía; `check (not is_cod or cod_amount > 0)` desde la 0087 |
| `at_guides` | `shipping_fee` | el precio del domicilio **congelado** en la guía | el trigger `at_set_guide_shipping_fee`, nunca a mano |
| `at_guides` | `package_contents` (jsonb) | `[{product_id, name, sku, qty, unit_price}]` — copia congelada, no referencia viva | quien crea la guía, migración 0042 |
| `at_products` | `price` | precio del catálogo del comercio | el comercio; también el CSV y Shopify |

`cod_includes_shipping` (booleano, 0051) decide si dentro del `cod_amount` va
el flete. De ahí sale `le_corresponde` en la 0069 y el reparto de la remesa.
No es dinero, pero manda sobre quién se queda con qué.

### El dinero ya movido

| Tabla | Columna | Qué es | Quién la escribe |
| --- | --- | --- | --- |
| `at_settlements` | `expected_amount` | lo que el mensajero debería consignar | trigger, `sum(cod_amount)` de sus guías |
| `at_settlements` | `deposited_amount` | lo que consignó de verdad | `at_report_deposit` |
| `at_invoices` | `subtotal` | `sum(amount)` de sus ítems | trigger; seis migraciones lo recalculan igual |
| `at_invoices` | `total` | hoy idéntico a `subtotal` | igual |
| `at_invoice_items` | `amount` | una línea de la factura (una guía, o la cuota SaaS) | `at_facturar_guia`, `at_cobrar_cuota_saas`, edición manual (0055) |
| `at_invoice_payments` | `amount` | un pago reportado contra una factura, `check (amount > 0)` | el comercio reporta, ops verifica |
| `at_cod_remittances` | `gross_amount` | todo lo que el comprador pagó, sin tocar | `at_girar_remesa`, migración 0053 |
| `at_cod_remittances` | `shipping_kept` | la parte del recaudo que es nuestra | idem |
| `at_cod_remittances` | `invoice_offset` | lo abonado a facturas pendientes con ese mismo recaudo | idem |
| `at_cod_remittances` | `net_amount` | lo que efectivamente se le gira al comercio | idem |
| `at_facility_settlements` | `gross_amount` | base de la comisión de red de un CEDI afiliado | migración 0048 |
| `at_facility_settlements` | `commission_amount` | la comisión, calculada con `commission_bps` | idem |
| `at_facility_settlements` | `net_amount` | lo que queda para el CEDI | idem |

Nótese `at_facilities.commission_bps`: un **entero en puntos base**
(`1500` = 15,00 %), con el comentario de la 0046 explicando por qué no es un
`numeric(5,2)` — «evita el error clásico de un 15% guardado como 0.15 en una
columna y como 15 en otra». Ese razonamiento es exactamente el que este
documento aplica a las monedas, y ya está aceptado en el repo.

### Las dos tablas que ya son multimoneda

| Tabla | Columnas | Cómo lo hace |
| --- | --- | --- |
| `at_saas_config` | `usd_mensual`, `trm_cop` | la cuota en USD; `trm_cop` **nace vacía** y sin ella no se cobra nada |
| `at_saas_charges` | `usd`, `trm`, `total_cop` | guarda las tres: el importe de origen, la tasa usada y el resultado |
| `at_pagos_op` | `debit_value` / `receive_value` + `_asset_code` + `_asset_scale` | entero como texto, con moneda y escala al lado, «nunca coma flotante» |

**Estos son los precedentes y el plan se apoya en ellos, no los deroga.**

- La **0075** ya resolvió el problema entero para un caso: importe en su
  moneda, tasa guardada en la fila del cobro, resultado en COP guardado
  también. Y la decisión de que *sin tasa no se cobra* en vez de inventarse un
  4.000 («es preferible una cuota sin cobrar y avisada, a nueve cobros mal
  hechos»). Esa es la postura de toda la Fase 0.
- La **0140** ya convierte a unidades mínimas enteras —
  `at_solv_minimas(p_pesos) → round(pesos * 100)::bigint::text` — con
  `asset_code: 'COP'` y `asset_scale: 2` **escritos a mano en el JSON**. Es
  decir: la conversión está hecha y la moneda está cableada. Cuando la moneda
  entre en la fila, esa función toma la escala de la fila y el literal `'COP'`
  del `jsonb_build_object` desaparece. No hay que inventar nada nuevo.
- La **0148** ya demuestra la forma correcta de guardar un importe de varias
  monedas, y lo justifica: «entero y escala, nunca coma flotante — para que al
  conciliar se comparen sin sorpresas».

### La UI: un solo punto, y es una buena noticia

| Dónde | Cuánto |
| --- | --- |
| `Intl.NumberFormat` en todo `src/` | **2 veces** |
| `formatCOP` en `src/lib/utils.ts` | la implementación, con `currency: "COP"` y `maximumFractionDigits: 0` |
| Archivos que la importan | **29** |
| Llamadas en total | **128** |

El segundo `Intl.NumberFormat` está en `destinatarios/page.tsx`. Y hay seis
sumas de dinero en el cliente, con `reduce`, en `facturacion`, `novedades`,
`recaudo`, `pedidos/nueva` y `pedidos/[id]`.

Que haya **un solo formateador** cambia el tamaño del trabajo de front: no son
128 ediciones, es cambiar una firma (`formatCOP(valor)` →
`formatDinero(valor, moneda)`) y pasar el segundo argumento desde donde ya se
tiene la fila. `maximumFractionDigits: 0` es correcto para COP y **falso para
EUR**: un euro con céntimos truncados se ve mal y suma distinto que lo que se
cobró.

`src/lib/zones.ts` (144 líneas) **no tiene ni un número de dinero**: solo
resuelve un barrio a su zona. El tarifario entero vive en la base. Eso también
simplifica: no hay precios en el código.

`src/lib/types.ts` declara ~28 campos de dinero como `number` plano. Ese tipo
es lo que hace que `aImporteEntero(monto, escala)` compile sin queja: un
`number` en pesos y un `number` en euros son el mismo tipo para TypeScript.

## Las decisiones

### 1. ¿Moneda por fila, por comercio, o las dos en capas?

**Las dos en capas, y la fila manda.**

`iniciar/route.ts` ya toma la moneda del comercio. Eso **no se deroga**: se
reconoce como lo que es —un valor por omisión— y se le pone encima la columna
de la fila.

| Opción | A favor | El precio |
| --- | --- | --- |
| Solo por comercio | cero columnas nuevas en `at_guides`; ya está escrito | un comercio con dos monedas es imposible; peor: cambiar la billetera del comercio **reinterpreta el histórico** y seis meses de facturas cambian de significado sin que nadie toque una fila |
| Solo por fila | correcto y explícito | cada `insert` de dinero tiene que decidir la moneda, y hay unas quince rutas y triggers que lo hacen; sin un valor por omisión, el primer olvido mete un `null` |
| En capas | el valor por omisión cubre el 100 % de los casos de hoy; la fila cubre el caso raro y **congela el histórico** | hay dos sitios donde mirar, y hay que escribir qué pasa cuando no coinciden |

El argumento que decide es el histórico. La moneda de una factura emitida es un
hecho pasado, no una propiedad vigente del comercio. Por la misma razón por la
que `at_guides.shipping_fee` congela el precio en vez de recalcularlo, y por la
que `package_contents` es «una copia congelada, no una referencia viva».

Concretamente: `at_clients.billing_currency` (el valor por omisión, hermano de
`wallet_asset_code`) y una columna `currency` en cada tabla de dinero, con
`default 'COP'`, llenada en el `insert` desde el comercio y **nunca actualizada
después**.

**La regla que hay que escribir una sola vez y no repetir:** una fila de dinero
tiene **una** moneda. No `cod_amount` en euros y `shipping_fee` en pesos en la
misma guía. Un `check` lo garantiza; sin él, `cod_includes_shipping` resta un
euro de un peso y la remesa queda mal con todas las columnas «correctas».

### 2. ¿`numeric` + `text`, tipo compuesto, o entero + escala?

**`numeric` + `text` de moneda, con la escala derivada de una tabla de monedas.
No entero + escala. No tipo compuesto.**

Esta es la decisión en la que es tentador imitar Open Payments y sería un error.

| Opción | A favor | El precio |
| --- | --- | --- |
| Entero + escala (estilo Open Payments) | exacto por construcción; es lo que habla la red; `at_pagos_op` ya lo hace | **toca las 27 columnas con una conversión de datos reales**, y cada `sum()`, `check`, trigger y `reduce` del front pasa a operar sobre números cien veces mayores. Un solo sitio que se olvide de dividir cobra cien veces de más — exactamente el fallo que este documento abre denunciando. Y no es reversible |
| Tipo compuesto `(monto, moneda)` | imposible guardar un importe sin moneda | PostgREST no lo expone de forma usable; se rompen los `select` del navegador, que hablan directo con Supabase; adiós a `sum()` nativo |
| `numeric` + `text` | `numeric(14,2)` **ya es exacto** (no es coma flotante); las 27 columnas se quedan como están; `sum()`, los `check` y los triggers siguen funcionando; la migración es `add column`, reversible | hace falta disciplina para que las dos columnas viajen juntas; la escala no está en la fila, hay que derivarla |

Lo que inclina la balanza: **`numeric(14,2)` no tiene el problema que entero +
escala resuelve.** La razón de ser de entero + escala en el estándar es que
JSON no tiene decimales exactos. Postgres sí. Pagar el riesgo de una
conversión irreversible sobre datos reales para resolver un problema que no
tenemos es el peor trato de este documento.

Dónde sí hace falta la escala: en la frontera con la red. Ahí ya está resuelto
dos veces (`at_solv_minimas` en la 0140, `aImporteEntero` en la ruta) y lo que
falta no es cambiar el almacenamiento, es **que esas dos funciones dejen de
cablear la escala**. Para eso, una tabla `at_monedas (codigo, escala, decimales_que_se_muestran, nombre)` —
tres o cuatro filas, un `foreign key` desde cada columna `currency`. Esa `fk`
hace algo que un `check` no: impide que entre `"eur"`, `"EURO"` o `"€"`. Dos
grafías de la misma moneda parten un total en dos y nadie se entera.

Y lo que falta de verdad, más que el tipo: **`numeric(14,2)` con dos decimales
no sirve para toda moneda.** Hay monedas con escala 0 (JPY, y de hecho la 0114
y la 0123 ya pasaron las tarifas colombianas a «miles cerrados») y con escala
hasta 9. `numeric(14,2)` deja fuera un importe con tres decimales. La tabla de
monedas es lo que permite rechazarlo con un mensaje claro en vez de redondearlo
en silencio.

### 3. Los totales que hoy suman filas de distintas monedas

**Hoy no hay ninguna suma correcta que sobreviva a la segunda moneda.** Las
verifiqué: `sum(cod_amount)` aparece en seis migraciones,
`sum(amount) from at_invoice_items` en siete, `sum(total) from at_invoices` en
dos, y `sum(le_corresponde)` cuatro veces en la 0069. Ninguna agrupa por nada
parecido a una moneda.

Una suma de monedas distintas no da un número equivocado: da un número **que
parece bien**. 50.000 + 45 = 50.045, y ese 50.045 se imprime con el signo de
pesos y cuadra con nada.

La recomendación, en tres piezas, por orden de importancia:

**a) Separar antes de sumar, no después.** Toda suma pasa a llevar
`group by currency`, y lo que hoy devuelve un escalar devuelve una fila por
moneda. En SQL es mecánico. En el front, `at_mi_recaudo` (0069) devuelve hoy
un `Record<EstadoDelDinero, {pedidos, monto}>` y pasaría a tener una dimensión
más. Es el cambio de front más grande de todo el plan, mayor que los 128
`formatCOP`.

**b) El agrupador no es `currency`: es la *fuente* del total.** Una factura no
puede tener ítems en dos monedas, porque un `total` por moneda en una factura
no es una factura, son dos. Lo mismo una remesa y un cierre de caja. Así que la
moneda **sube a la cabecera** (`at_invoices.currency`,
`at_cod_remittances.currency`, `at_settlements.currency`) con un `check` de que
los hijos coinciden, y el agrupado por moneda se vuelve innecesario dentro de
cada documento. Donde sí queda es en los informes que cruzan documentos: el
dashboard, `/facturacion`, `/recaudo`.

Esto tiene una consecuencia operativa que hay que decir en voz alta: **un
comercio que venda en dos monedas recibe dos facturas y dos remesas por
periodo**. Y el cierre de caja de un mensajero que recaudó en dos monedas el
mismo día choca con `unique (courier_id, settlement_date)` de la 0001. Esa
clave única tendría que pasar a `(courier_id, settlement_date, currency)`.

**c) Los informes que ya existen no se convierten: se marcan.** Mientras todo
sea COP, un total sin agrupar es correcto. Lo que no se puede es que el día que
entre un euro el informe siga dando un número. Un `check` de inventario —en la
línea de `at_inventario_de_rls()` (0108) y de `at_salud()` (0106)— que avise si
existe alguna fila con moneda distinta de `'COP'` en una tabla cuyos informes
todavía no agrupan. El guardián es la base, no la memoria de quien despliegue.

### 4. ¿Se guarda la tasa de cambio?

**Sí, y ya está decidido: la 0075 lo hace.** `at_saas_charges` guarda `usd`,
`trm` y `total_cop` — los tres. La misma forma, generalizada.

La tasa **no va en una tabla de tasas que se consulte en el momento de leer**.
Va **en la fila del cobro**, junto al importe. Una tabla de tasas vigentes
contesta «¿a cómo está el euro hoy?», que no es la pregunta. La pregunta es
«¿a cómo estaba cuando le cobramos esto?», y esa solo la contesta la fila.

Concretamente, en cada documento de dinero (factura, remesa, cierre):

| Columna | Qué guarda |
| --- | --- |
| `currency` | la moneda en la que se cobró |
| `fx_rate` | cuántas unidades de la moneda de reporte vale una de `currency` |
| `fx_source` | de dónde salió esa tasa: `'manual'`, `'openpayments-quote'`, `'trm-oficial'` |
| `fx_at` | cuándo |

`fx_source` no es adorno: una tasa puesta a mano por un administrador y una
tasa que vino de una cotización de la red no tienen el mismo valor probatorio,
y a los seis meses nadie se acuerda de cuál fue. La 0075 ya tiene esta
distinción implícita (su `trm_cop` es siempre manual) y el campo la hace
explícita.

Y el precedente que hay que copiar entero: **sin tasa no se convierte, se
avisa.** La 0075 notifica a los administradores una vez por periodo y no cobra.
Un informe consolidado al que le falte una tasa enseña las monedas por separado
y dice que falta la tasa. No estima.

`fx_rate` **nunca** se usa para cobrar. Se cobra en `currency` por el importe
de `currency`. La tasa es para que un informe pueda enseñar un consolidado y
para que una factura se pueda explicar después. Quien convierte de verdad es la
red, en la cotización, y lo que ella diga es lo que queda en `at_pagos_op`.

### 5. La compatibilidad: 148 migraciones aplicadas y datos reales

**`default 'COP'` y adelante. Conversión explícita, no.**

| Opción | A favor | El precio |
| --- | --- | --- |
| `default 'COP'` + `not null` | `add column` con valor por omisión es instantáneo en Postgres moderno, no reescribe la tabla, no bloquea la operación; todo lo que existe queda **correctamente** etiquetado, porque de verdad son pesos; reversible con un `drop column` | se arrastra el supuesto de que lo nuevo también es COP hasta que alguien lo cambie |
| Conversión explícita (a entero + escala, o a moneda obligatoria sin valor por omisión) | obliga a mirar cada sitio que escribe dinero | reescribe tablas con datos reales, con ventana de parada; **no es reversible**; y para nada: hoy todo es COP y el valor por omisión acierta en el 100 % de las filas |

No hay dilema aquí. Lo que hay que cuidar es otra cosa: **el `default` hace que
olvidarse no dé error.** Un `insert` nuevo que no diga la moneda escribe `'COP'`
y no se queja — es el mismo fallo que ya está documentado en la memoria del
proyecto para los clientes de Supabase, «equivocarse no da error: da cero
filas». Aquí sería «da pesos». El antídoto no es quitar el `default`: es que la
guía nazca con la moneda del comercio desde un trigger, igual que
`shipping_fee` nace del trigger `at_set_guide_shipping_fee`, y no del `insert`
de cada ruta.

Qué se rompe en el camino, concretamente:

- **Nada en la Fase 1**, que es solo `add column` con valor por omisión. La app
  de hoy ignora columnas que no pide: `select` nombra sus columnas.
- `unique (courier_id, settlement_date)` de la 0001, cuando un mensajero
  recaude en dos monedas el mismo día. Hasta entonces, no.
- Los `check` que comparan importes entre tablas (`at_cod_remittances` restando
  `shipping_fee` de `cod_amount`) pasan a necesitar que las monedas coincidan.
- `formatCOP` con `maximumFractionDigits: 0`, en cuanto haya una moneda con
  decimales visibles.
- **La app móvil** (`Escritorio\yam-movil`, otro repo) lee estas tablas. No la
  revisé — no está en este repo. Si lee `cod_amount` y lo pinta con un `$`
  cableado, hereda el problema entero.

Y el despliegue, en una frase: **el front tolerante va antes que la columna.**
Primero una `formatDinero(valor, moneda)` que ante `undefined` se comporta
exactamente como `formatCOP` hoy; después la columna. Al revés, cualquier fila
con moneda distinta se pinta con el signo equivocado durante la ventana entre
los dos despliegues — y el front vive en Vercel mientras la base está en AWS,
así que esa ventana existe de verdad y no es atómica.

## El orden de ejecución

La numeración está en la **0149** (`0149_saber_que_el_pago_llego.sql`, la
conciliación, recién salida y todavía sin aplicar; la última ya aplicada es la
0148). Hay 135 archivos en `supabase/migrations/`, con huecos en la
numeración. Esto empieza en la **0150**.

### Fase 0 — tapar el agujero (0150) · reversible · **HECHA**

Lo único de este documento que **no puede esperar**, porque es un fallo de cobro
latente, no una mejora.

Está hecha, en la migración `0150` y en `iniciar/route.ts`: existen
`at_monedas` y `at_clients.billing_currency` (con `fk`, toda fila en `'COP'`),
y la ruta compara las tres monedas —la que dice la red, la copia que se guardó
al verificar la billetera y la de los precios del comercio— y contesta 409 si
alguna no cuadra. **Falta aplicarla**: la 0150 sigue siendo un archivo.

1. `at_clients.billing_currency text not null default 'COP'`, con `fk` a una
   `at_monedas` nueva (`codigo`, `escala`, `decimales_visibles`, `nombre`).
2. En `iniciar/route.ts` —y esto lo hace otro, no yo: la ruta es de otro
   agente— comparar `destino.assetCode` con `at_clients.wallet_asset_code` y
   con `billing_currency`, y **negarse con un 409 si no coinciden los tres**.
   Hoy la columna se lee y no se usa.

**Al final de esta fase:** la app funciona exactamente igual, en pesos, y un
comercio con billetera en otra moneda **no puede cobrar** en vez de cobrar mal.
Es el mismo criterio de la 0075: preferible un cobro que no sale y avisa, a un
cobro mal hecho.

### Fase 1 — la moneda existe y nadie la mira (0151) · reversible

`add column currency text not null default 'COP'` con `fk` a `at_monedas` en
las 14 tablas de dinero. Más `fx_rate`, `fx_source`, `fx_at` en las tres
cabeceras de documento (`at_invoices`, `at_cod_remittances`, `at_settlements`).
Ningún `check` nuevo todavía. Ninguna lectura cambia.

**Al final de esta fase:** la base sabe que todo lo que tiene son pesos, y lo
dice. Cero cambios visibles. `get_advisors` de seguridad y de rendimiento, como
manda `docs/estandares-de-plataforma.md` tras cada cambio de esquema; ojo con
los índices, porque `group by currency` llega después y las columnas nuevas no
están en los nueve índices de la 0107.

### Fase 2 — el front deja de cablear la moneda · reversible

Sin migración. `formatCOP` → `formatDinero(valor, moneda?)`, que ante
`undefined` hace lo de hoy. Los 29 archivos pasan el segundo argumento desde
la fila que ya tienen. `src/lib/types.ts` gana el campo `currency` en los ~28
tipos de dinero.

**Al final de esta fase:** la app pinta la moneda que diga la fila, y como todas
dicen COP, se ve idéntica. Es el despliegue que tiene que ir **antes** que
cualquier fila con moneda distinta.

### Fase 3 — la moneda nace donde nace el dinero (0152) · reversible

Trigger que llena `at_guides.currency` desde `at_clients.billing_currency`, al
lado de `at_set_guide_shipping_fee`. Los triggers de facturación, remesa y
cierre propagan la moneda del origen. `at_products.currency` desde el comercio.
Más los `check` de coherencia: los ítems de una factura comparten la moneda de
su cabecera, `cod_includes_shipping` solo resta si las monedas coinciden.

**Al final de esta fase:** una guía nueva no puede nacer sin moneda, ni con una
moneda que choque con su comercio. Y el `default 'COP'` deja de ser lo que
decide, porque siempre hay alguien que lo llena antes.

### Fase 4 — los informes agrupan (0153) · **el punto de no retorno**

`at_mi_recaudo` (0069), `at_cobro_de_guia`, los `sum()` de facturación y el
dashboard pasan a agrupar por moneda. Cambia la **forma** de lo que devuelven
las RPC: donde había un escalar hay una fila por moneda.

**Esta es la fase que no es reversible**, y no por la base: por el contrato de
las RPC. Un `json` que antes traía `{monto: 50000}` y ahora trae
`[{currency:'COP', monto:50000}]` rompe a todo el que lo lea — incluida la app
móvil de otro repo, que no revisé. Las fases 0 a 3 se revierten con un
`drop column`; esta hay que desplegarla con el front al mismo tiempo, o
versionar la RPC y dejar las dos vivas un rato.

`unique (courier_id, settlement_date)` → `(courier_id, settlement_date, currency)`.

**Al final de esta fase:** `/facturacion`, `/recaudo` y el dashboard enseñan
los totales por moneda, y nunca más suman un euro con un peso.

### Fase 5 — la frontera con la red deja de cablear (0154) · reversible

`at_solv_minimas` toma la escala de `at_monedas` en vez del `× 100` fijo, y el
`jsonb_build_object` de `at_solv_encolar` toma `asset_code` y `asset_scale` de
la fila en vez de los literales `'COP'` y `2`. `aImporteEntero` en la ruta usa
la escala de la moneda **de la fila**, y el `check` de la Fase 0 garantiza que
coincide con la de la billetera.

**Al final de esta fase:** un comercio con billetera en euros puede cobrar, y
cobra lo que dice su fila. Aquí se cierra el punto 4 de `docs/open-payments.md`.

## Lo que NO hay que hacer

- **No convertir a entero + escala.** Es la tentación grande: es lo que habla
  Open Payments, es lo que `at_pagos_op` ya hace, y es «más correcto» en
  abstracto. Pero `numeric(14,2)` ya es exacto, la conversión toca 27 columnas
  con datos reales de nueve negocios, no es reversible, y multiplica por cien
  todos los números que hoy cuadran. El problema que resuelve —decimales
  binarios— no lo tenemos en Postgres: lo tenemos en el JSON de la red, y ahí
  se resuelve en la frontera, que es donde ya está resuelto.

- **No montar una tabla de tasas vigentes con un `cron` que las refresque.** Es
  la pieza que más parece hacer falta y menos sirve: nada de lo que hacemos
  necesita saber a cómo está el euro *hoy*. La tasa que importa es la del
  momento del cobro, y esa la guarda la fila. Quien convierte de verdad es la
  cotización de la red, que ya devuelve `debitAmount` y `receiveAmount`. Un
  `cron` de tasas sería un servicio más que mantener, y la 0109/0112 ya
  cuentan lo que cuesta un `cron` que llama en balde — la base cayó cuatro
  horas por eso.

- **No tocar `at_zone_costs.courier_fee` todavía.** Lo que se le paga a un
  mensajero de Medellín es en pesos y va a seguir siendo en pesos mucho después
  de que un comercio de Lyon cobre en euros. Ponerle moneda a la tabla de
  costos internos añade una columna que nadie va a usar distinta de `'COP'`, y
  encima está detrás de RLS solo-staff por el margen. Cuando haya mensajeros
  fuera de Colombia, se hablará.

- **No «aprovechar» para arreglar `at_invoices.total`.** `subtotal` y `total`
  son idénticos hoy —seis migraciones los recalculan con el mismo `sum()`— y es
  tentador meter ahí el IVA, el descuento o la retención mientras se está
  tocando la tabla. Es otro trabajo, con otro riesgo, y mezclarlo hace que un
  fallo de impuestos parezca un fallo de monedas.

- **No ponerle moneda a `at_guides.declared_value` por separado.** Es la misma
  guía y el mismo comercio: una moneda por fila, no una por columna. La
  tentación aparece porque `declared_value` es para el seguro y `cod_amount`
  para el recaudo, y suena razonable que vayan en monedas distintas. No lo es:
  es la puerta por la que entran las restas entre monedas.

- **No esperar a tener todo el plan para hacer la Fase 0.** Las fases 1 a 5 son
  trabajo de semanas y pueden esperar a que haya un comercio real fuera de
  Colombia. La Fase 0 es un `check` que impide un cobro mal hecho, y el día que
  alguien verifique la primera billetera en euros ya es tarde.

## Lo que hace falta decidir, y no puedo decidir yo

1. **¿Cuál es la moneda de reporte?** El consolidado del dashboard y de
   `/facturacion` tiene que estar en *algo*. ¿COP?
2. **Un comercio que venda en dos monedas, ¿recibe dos facturas y dos remesas
   por periodo?** Es la consecuencia de subir la moneda a la cabecera. Yo diría
   sí. ¿Confirmas?
3. **¿Hay algún comercio real, hoy o en los próximos tres meses, que vaya a
   cobrar en algo que no sea COP?** Si la respuesta es no, todo esto es la
   Fase 0 y nada más, y las fases 1 a 5 se quedan escritas esperando.
4. **La cuota SaaS de 10 USD, ¿se le sigue cobrando en pesos a todo el mundo, o
   un comercio europeo la paga en euros?** Cambia si `at_saas_config` se
   generaliza o se deja como está.
5. **¿Qué moneda se le paga a un mensajero que entregó un pedido cobrado en
   euros?** Pesos, supongo, pero entonces hace falta una tasa para liquidarle y
   alguien tiene que ponerla.
6. **¿`yam-movil` lee `cod_amount` y lo pinta con un `$` cableado?** No pude
   mirarlo: es otro repo. Si sí, la Fase 2 también va allá y la Fase 4 lo rompe.
7. **La 0149 (conciliación) está sin aplicar mientras escribo esto.** Si entra
   otra migración antes que la Fase 0, los números de arriba se corren.

## La parte honesta

- **Esto no es la multimoneda: es la mitad de abajo.** Lo que queda cuando todo
  esto esté hecho es que la base y la app sepan que el dinero tiene moneda. La
  otra mitad —a quién se le factura en qué, qué dice la DIAN de una factura en
  euros, cómo se declara el recaudo de un pedido francés— no es de este
  documento y probablemente no es de un programador.

- **El agujero de la Fase 0 lleva escrito desde la 0147 y nadie lo había
  visto**, yo incluido hasta hoy, porque el comentario de encima dice que está
  resuelto. Un comentario que afirma lo contrario de lo que hace el código es
  peor que ningún comentario. Vale la pena mirar si hay más de esos en la
  frontera de los pagos.

- **Lo único verificado aquí es este repo.** Las 27 columnas, los 128
  `formatCOP`, los 29 archivos, los dos `Intl.NumberFormat`, el `coalesce` de
  cuatro niveles de `at_precio_domicilio`: todo eso lo leí. Lo que no está
  verificado y lo digo en voz alta: no me conecté a la base, así que **no sé
  cuántas filas hay** en ninguna de esas tablas; y no abrí `yam-movil`. Si en
  este documento no hay una cifra de filas de producción es por eso, no por
  olvido.
