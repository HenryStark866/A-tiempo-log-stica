# Open Payments — el diferenciador

El comercio de YAM va a ser mundial, y lo que nos separa de cualquier otra app
de última milla no es el mapa ni el escáner: es **cobrar entre monedas sin
pasarela**. Un comercio en Lyon le vende a alguien en Medellín y el dinero
viaja de la billetera de uno a la del otro, con el cambio resuelto por la red.

Eso es [Open Payments](https://openpayments.dev), el estándar abierto de la
**Interledger Foundation** — la misma fundación que respalda
[Beyond Access](beyond-access.md), la iniciativa de la que ya hacemos parte.
No es casualidad que las dos cosas lleguen juntas: el hackathon de pagos
abiertos de Beyond Access es sobre esto.

## La idea, sin jerga

Una **dirección de billetera** es una URL pública, como un correo pero para
dinero: `https://billetera.example/panaderia-norte`. Dice en qué moneda opera
esa cuenta y con qué servidor hay que hablar para pagarle. Es lo único que un
comercio de cualquier país tiene que darnos.

Un pago son cuatro pasos:

| Paso | Dónde se crea | Qué dice |
| --- | --- | --- |
| **Incoming payment** | en la billetera de quien **cobra** | «aquí espero 50 EUR» |
| **Quote** | en la billetera de quien **paga** | «para que allá lleguen 50 EUR, de aquí salen 238.400 COP» |
| **Grant** (permiso) | en el servidor de autorización de quien paga | el dueño del dinero autoriza, **en su propia pantalla** |
| **Outgoing payment** | en la billetera de quien paga | el pago, ya autorizado |

El tercero es el que obliga a partir el flujo en dos: nosotros nunca
autorizamos en nombre de nadie. Mandamos al comprador a su billetera, él
autoriza allá, y vuelve con una referencia con la que rematamos el pago.

## Qué hay escrito ya

- **[`src/lib/pagos/openpayments.ts`](../src/lib/pagos/openpayments.ts)** — los
  cuatro pasos, cada uno en su función: `resolverBilletera`, `crearCobro`,
  `cotizar`, `pedirPermisoDePago` y `rematarPago`. Es `server-only`: la llave
  privada firma cada petición y no se acerca al navegador.
- **Migración `0147`** — `wallet_address` en `at_clients` (donde cobra el
  comercio) y en `at_profiles`. Con `check` de formato mínimo y **fuera** de
  las columnas que la 0143 abrió al público.
- **Migración `0148`** — `at_pagos_op`, donde vive el permiso mientras el
  comprador está autorizando. Nace con RLS y **sin una sola política**: la
  tabla guarda un token portador (`continuar_token`) y solo la toca el cliente
  de servicio. El comprador no consulta aquí el estado de su pago; el día que
  haga falta enseñárselo se expone una vista sin los tokens.
- **Las dos rutas** que parten el flujo en los dos tramos que el estándar
  obliga:
  - `POST /api/pagos/openpayments/iniciar` — arma cobro, cotización y permiso,
    guarda la fila **antes** de devolver el enlace, y contesta con el cambio
    (`sale` / `llega`) para enseñárselo al comprador antes de que autorice.
  - `GET /api/pagos/openpayments/volver` — comprueba el `hash` de GNAP
    (`verificarRegreso`), remata el pago y redirige a `/rastreo`. No pide
    sesión a propósito: quien autoriza en el móvil lo que empezó en el
    escritorio volvería a otro navegador, y lo que autoriza es el hash, no la
    cookie.

**La moneda sale de la billetera del comercio.** `iniciar` toma `assetCode` y
`assetScale` de la billetera verificada del destino: un comercio cotiza en su
propia moneda, que es lo que hace cualquiera, y el cambio lo resuelve la red.
Es un paso intermedio honesto —moneda por comercio, no por fila— y se cae el
día que un mismo comercio venda en dos monedas.

Lo que **no** está hecho, y hace falta antes de mover un peso real:

1. **Conciliar.** Saber que un pago salió no es saber que llegó. Hay que
   consultar el incoming payment y marcar la guía. Hoy un remate que falla
   justo al enterarse deja la fila en `autorizando` a propósito: marcarla
   fallida invitaría a cobrar dos veces.
2. **Verificar la billetera al registrarla.** `iniciar` exige
   `wallet_verified_at`, y todavía no hay pantalla que lo llene: falta el
   formulario del comercio que resuelva la dirección contra la red y guarde la
   moneda. **Sin eso, esta ruta no cobra a nadie** — y así tiene que ser.
3. **Multimoneda en la base.** Hoy todo importe en las tablas `at_` es un
   número sin moneda. Cobrar en EUR o NGN de verdad exige moneda por fila, y
   eso toca `at_guides`, `at_invoices`, `at_settlements` y el tarifario. **Es
   el trabajo grande de verdad**, más que el pago en sí.
4. **Barrer lo vencido.** `at_op_vencer_pagos()` existe y nadie la llama
   todavía: hay que colgarla del cron del buzón.

## Lo que necesito de ti para encenderlo

Tres variables de entorno. Ninguna va al repo: se cargan en el entorno del
servidor (Vercel hoy, SSM en la instancia).

| Variable | Qué es |
| --- | --- |
| `OP_WALLET_ADDRESS` | la dirección de billetera **de YAM** |
| `OP_KEY_ID` | el identificador de la llave que registraste en esa billetera |
| `OP_PRIVATE_KEY` | la llave privada Ed25519, en base64 |

Para probar sin dinero real existe la
[billetera de pruebas de Interledger](https://wallet.interledger-test.dev):
se abre una cuenta, se genera el par de llaves y se juega con dinero de
mentira contra la red de prueba. Es exactamente el mismo código.

## La parte honesta

- **Esto no mueve mercancía.** Resuelve el cobro, no la aduana ni el flete
  internacional. Los tres informes de `docs/internacional/` coinciden en que el
  bloqueante no es el dinero: en la UE es el importador obligatorio para
  etiquetar alimentos, en Asia el tramo aéreo, en África la vía de cobro local.
- **Open Payments todavía no está en todas partes.** Depende de que la
  billetera del otro lado lo hable. Hoy eso es un puñado de proveedores, no
  todos los bancos del mundo.
- **Cobrar plata ajena tiene regulación.** Si YAM recibe el dinero del
  comprador y después le paga al comercio, en Colombia eso se parece mucho a
  administrar recursos de terceros, que es territorio de la Superintendencia
  Financiera. El diseño de arriba lo esquiva a propósito: el pago va **de la
  billetera del comprador a la del comercio**, y nosotros solo armamos la
  operación. Mantenerlo así no es un detalle técnico, es lo que evita necesitar
  licencia.
