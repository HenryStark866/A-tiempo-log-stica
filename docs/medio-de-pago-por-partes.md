# El medio de pago se captura por partes

**Fecha:** 25 de agosto de 2026. Sustituye las dos notas anteriores del mismo día.

| Archivo | Qué cambia |
| --- | --- |
| `src/lib/types.ts` | `PaymentKind` suma `billetera` y `otro` |
| `src/lib/constants.ts` | categorías, listas, traducción pantalla ↔ base, revisión |
| `src/components/MiComercioPanel.tsx` | modal «Nuevo medio de pago» (se abre desde `/mi-perfil`) |
| `src/app/pagar/[token]/page.tsx` | vista pública del QR |
| `supabase/migrations/0099_el_medio_de_pago_se_captura_por_partes.sql` | la misma regla, exigida por la base |

## La forma nueva

El modal pregunta primero **Tipo de medio** y de ahí sale todo lo demás:

- **Cuenta Bancaria** → Banco (lista de 15 con «Otro»), Tipo de cuenta
  (Ahorros / Corriente), Número (solo dígitos).
- **Billetera Digital / Llave** → Plataforma (Nequi, Daviplata, Transfiya,
  Dale!, Otra), Número / Llave (alfanumérico).
- **Enlace de Pago / Otro** → Nombre, Enlace o dato (opcional).

Y al final, siempre: **Titular** y **Nota**, ambos opcionales.

## El ensamblaje

Las columnas no cambiaron. Lo que cambió es qué se escribe en ellas:

| En pantalla | `kind` | `identifier` |
| --- | --- | --- |
| Bancolombia / Ahorros / 12345678 | `bancolombia` | `Ahorros - 12345678` |
| Davivienda / Corriente / 987654321 | `otro_banco` | `Davivienda - Corriente - 987654321` |
| Nequi / 3001234567 | `nequi` | `3001234567` |
| Dale! / 3001234567 | `billetera` | `Dale! - 3001234567` |
| Link de Wompi / https://… | `link` | `Link de Wompi - https://…` |
| Efectivo, sin enlace | `efectivo` | `Efectivo al mensajero` |

**La regla, en una frase: la última parte es el dato con el que se paga y todo
lo de antes es contexto.** De ahí sale todo el comportamiento público — título,
detalle, qué se copia — sin que nadie tenga que volver a interpretar el texto.

`kind` deja de ser la marca y pasa a ser una casilla gruesa. La marca de verdad
—Davivienda, Dale!, Wompi— viaja en el identificador, así que la base no
necesita conocer todas las marcas del país para que el destinatario lea la
suya.

## Lo que hubo que tocar del esquema, y por qué no se pudo evitar

`kind` tiene un CHECK desde la migración 0017 con seis valores. Tres de ellos
son marcas concretas. **Una billetera Dale! o un cobro por Wompi no caben en
ninguno.** Meterlos a la fuerza haría que el QR le dijera «Otro banco» a quien
va a pagarle a una billetera, o que pusiera un botón «Abrir link de pago»
apuntando a un número de celular.

La migración 0099 le agrega dos valores al CHECK: `billetera` y `otro`. **No
agrega columnas, no quita valores, no toca ninguna fila, y `at_payment_info`
devuelve exactamente los mismos campos** — la vista pública no cambió de
contrato. Si aun así se prefiere no tocarlo, revertirlo es una migración.

## Los cuatro detalles que no son obvios

1. **El botón «copiar» del QR no copia lo que se ve.** Copia solo la última
   parte. Pegar «Davivienda - Ahorros - 987654321» en la app del banco no
   sirve, y quien está en la puerta con el paquete en la mano no está para
   editar texto.

2. **El botón «Abrir link» sale cuando el dato ES una URL, no cuando el medio
   se llama «link».** Un medio mal clasificado no puede terminar en un enlace
   roto delante de quien está por pagar.

3. **Las marcas se guardan sin guiones.** El separador es ` - `, así que un
   «Banco - Popular» rompería la partición al editar. `limpiarMarca` los quita.

4. **`null ~ '…'` en SQL no es falso, es `null`, y un CHECK que da `null` se
   aprueba.** Cada rama de la restricción lleva su `is not null` explícito.

## Medios viejos

Un medio guardado antes (por ejemplo «Bancolombia ahorros 4567 890», todo en
una línea) no se puede repartir en los campos nuevos. En vez de adivinar, al
abrirlo a editar sale un aviso ámbar con el texto anterior para que el comercio
lo reescriba. No se borra nada hasta que él guarde. Los medios de Nequi y
Daviplata sí pasan solos: su dato ya era un dato suelto.

## Verificación hecha

- **31 casos** de la restricción contra un PostgreSQL 16 real, aplicando 0097,
  0098 y 0099 en fila —el escenario peor, con las tres ya en la nube—: 31/31.
- Las 3 filas viejas que no cumplen sobrevivieron a las tres migraciones.
- **70 casos** de los ayudantes de TypeScript, incluida la **ida y vuelta
  completa** de las nueve formas (guardar → volver a abrir a editar): 70/70.
- **Cruce cliente ↔ base:** se generaron todas las combinaciones que el
  formulario dejaría guardar (**236**, con 195 frenadas antes por la revisión),
  se insertaron en la base y se volvieron a leer. Las 236 pasan la restricción
  y las 236 recuperan su categoría al editar. La primera vuelta encontró un
  desacuerdo real —un dato «otro» de más de 120 caracteres que el formulario
  aceptaba y la base rechazaba— y se corrigió subiendo el tope de la base a
  360: **la base tiene que ser al menos tan ancha como el formulario; el que
  aprieta es el formulario.**

## Orden de despliegue

**Primero `supabase db push`, después la app.** Aquí el orden se invierte
respecto de las notas anteriores, y la razón es el CHECK de `kind`: la app
nueva escribe `billetera` y `otro`, valores que la base todavía no acepta. Si
se despliega la app primero, un comercio que registre un Dale! se lleva un
error crudo de Postgres.

Al revés no hay riesgo: la migración solo **agrega** valores permitidos y
relaja la regla del identificador, así que la app vieja sigue funcionando
mientras tanto.

## Qué revisar después

- [ ] `/mi-perfil` → Medios de pago → Nuevo. Cambiar «Tipo de medio» entre las
      tres opciones: los campos de abajo cambian completos.
- [ ] **Cuenta Bancaria** → banco «Otro»: aparece «¿Cuál?». En Número no deja
      escribir letras.
- [ ] **Billetera** → «Otra»: aparece «¿Cuál?».
- [ ] **Enlace / Otro** sin enlace: aparece la línea que explica que servirá
      para cobros sin dato, como el efectivo.
- [ ] Guardar «Davivienda / Corriente / 987654321», reabrir a editar: los tres
      campos vuelven llenos y en su sitio.
- [ ] Abrir un medio viejo escrito en una línea: sale el aviso ámbar.
- [ ] Escanear el QR de pago: título «Davivienda», debajo «Corriente», el
      número grande, y el botón de copiar entrega **solo** `987654321`.
- [ ] Un medio de Wompi muestra el botón «Abrir link de pago» y **no** el de
      copiar. Uno de Dale! muestra el de copiar y **no** el de abrir.

## Lo que no se tocó

`at_payment_info` y su contrato, la tabla `at_payment_methods` fuera de sus dos
CHECK, el rótulo de `/pedidos`, y el conteo de medios activos que hace
`/pedidos/nueva` (solo cuenta filas, no mira `kind`).
