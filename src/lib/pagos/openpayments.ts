import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createAuthenticatedClient,
  isPendingGrant,
  type AuthenticatedClient,
  type Grant,
  type PendingGrant,
} from "@interledger/open-payments";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPEN PAYMENTS — PAGAR DE UNA BILLETERA A OTRA, EN CUALQUIER MONEDA
 *
 * Esta es la pieza que vuelve viable el comercio internacional de YAM. Lo que
 * hoy frena vender de Medellín a Lyon o de Lagos a Medellín no es el software:
 * es que cobrar cruzando monedas exige pasarela, contrato por país y una cuenta
 * que reciba. Open Payments —el estándar abierto de la Interledger
 * Foundation, la misma que respalda Beyond Access— cambia esa pregunta: cada
 * comercio llega con la billetera que ya tiene, y el pago viaja entre
 * billeteras con el cambio de divisa resuelto por la red, no por nosotros.
 *
 * ── Las cuatro piezas, en orden ──────────────────────────────────────────
 *
 *   1. BILLETERA (wallet address). Una URL pública, como un correo pero para
 *      dinero: `https://billetera.example/henry`. Dice en qué moneda opera y
 *      con qué servidor de autorización hablar. Es lo único que un comercio
 *      tiene que darnos.
 *   2. INCOMING PAYMENT. Se crea EN la billetera de quien cobra: «aquí espero
 *      tanto». Es el destino del pago.
 *   3. QUOTE. Se crea en la billetera de quien paga: «para que allá lleguen
 *      50 EUR, de aquí salen tantos COP». Aquí es donde aparece el cambio de
 *      divisas, y aquí es donde hay que mirar: la cotización tiene fecha de
 *      vencimiento y después de eso no vale.
 *   4. OUTGOING PAYMENT. El pago mismo, que exige permiso del dueño del
 *      dinero. Ese permiso NO lo damos nosotros: se lo pide su billetera a él,
 *      en su propia pantalla, y vuelve con un `interact_ref`. Por eso el flujo
 *      se parte en dos funciones —`pedirPermisoDePago` y `rematarPago`— con
 *      una visita del comprador a otra página en medio.
 *
 * ── Lo que este archivo NO hace, y hay que saberlo ───────────────────────
 *
 *   · No guarda nada. Los `continue` (URI y token) que devuelve
 *     `pedirPermisoDePago` hay que guardarlos: sin ellos el pago no se puede
 *     rematar cuando el comprador vuelva, y el dinero se queda en el limbo de
 *     un permiso concedido que nadie usó.
 *   · No es idempotente. Si `rematarPago` se llama dos veces con el mismo
 *     `interact_ref`, el segundo intento falla en el servidor de autorización
 *     —no cobra dos veces—, pero el código de arriba tiene que distinguir ese
 *     fallo de uno de verdad.
 *   · No concilia. Saber que un pago salió no es saber que llegó: eso se
 *     consulta sobre el incoming payment, y esa parte está por escribir.
 *
 * ── La llave ─────────────────────────────────────────────────────────────
 * Firma cada petición. Es Ed25519, vive en SSM/Vercel como base64 y no se
 * acerca al navegador: `server-only` arriba hace que el build reviente si
 * alguien importa esto desde un componente de cliente, que es mejor que
 * enterarse por el paquete publicado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Un importe en Open Payments: entero + escala, nunca coma flotante. */
export interface Importe {
  value: string;
  assetCode: string;
  assetScale: number;
}

let cliente: AuthenticatedClient | null = null;

/**
 * Un permiso sin interacción tiene que traer token, pero el tipo lo da como
 * opcional porque el mismo tipo cubre los permisos que todavía esperan a una
 * persona. Esto resuelve las dos cosas de una vez y con un mensaje que dice
 * cuál de los dos casos se dio, en vez de un `!` que esconde los dos.
 */
function tokenDe(permiso: Grant | PendingGrant, queEs: string): string {
  if (isPendingGrant(permiso)) {
    throw new Error(
      `La billetera exige interacción para ${queEs}, y aquí no hay ninguna ` +
        "persona delante a quien enseñarle una pantalla."
    );
  }
  if (!permiso.access_token?.value) {
    throw new Error(`El permiso para ${queEs} llegó sin token de acceso.`);
  }
  return permiso.access_token.value;
}

/**
 * El cliente de YAM contra la red. Se construye una vez por proceso: armarlo
 * descarga y valida las especificaciones OpenAPI, y hacerlo en cada pago
 * metería ese costo en la cara del comprador.
 */
export async function clienteOpenPayments(): Promise<AuthenticatedClient> {
  if (cliente) return cliente;

  const walletAddressUrl = process.env.OP_WALLET_ADDRESS;
  const keyId = process.env.OP_KEY_ID;
  const llaveB64 = process.env.OP_PRIVATE_KEY;

  if (!walletAddressUrl || !keyId || !llaveB64) {
    throw new Error(
      "Faltan OP_WALLET_ADDRESS, OP_KEY_ID u OP_PRIVATE_KEY. Son la " +
        "identidad de YAM ante la red de Open Payments; se configuran en el " +
        "entorno, nunca en el repo. Ver docs/open-payments.md."
    );
  }

  cliente = await createAuthenticatedClient({
    walletAddressUrl,
    keyId,
    // Llega en base64 para que quepa en una variable de entorno de una línea.
    privateKey: Buffer.from(llaveB64, "base64").toString("utf8"),
  });

  return cliente;
}

/**
 * Qué hay detrás de una dirección de billetera: su moneda, su escala y sus dos
 * servidores. Es la primera llamada de todo y la que valida que un comercio
 * escribió bien su billetera — conviene hacerla al registrarlo, no al primer
 * pago.
 */
export async function resolverBilletera(url: string) {
  const op = await clienteOpenPayments();
  return op.walletAddress.get({ url });
}

/**
 * Lo que va a cobrar el que vende. Se crea en SU billetera, así que primero
 * hay que pedirle permiso a SU servidor de autorización — sin interacción:
 * crear un cobro no mueve dinero de nadie, y por eso el estándar no obliga a
 * molestar a su dueño.
 */
export async function crearCobro(args: {
  billeteraDestino: string;
  importe: Importe;
  descripcion?: string;
  /** Lo nuestro, para reconciliar después: número de guía, id del pedido. */
  referencia?: Record<string, string>;
}) {
  const op = await clienteOpenPayments();
  const destino = await op.walletAddress.get({ url: args.billeteraDestino });

  const permiso = await op.grant.request(
    { url: destino.authServer },
    {
      access_token: {
        access: [{ type: "incoming-payment", actions: ["create", "read"] }],
      },
    }
  );

  return op.incomingPayment.create(
    {
      url: destino.resourceServer,
      accessToken: tokenDe(permiso, `cobrar en ${args.billeteraDestino}`),
    },
    {
      walletAddress: destino.id,
      incomingAmount: args.importe,
      metadata: { descripcion: args.descripcion, ...args.referencia },
    }
  );
}

/**
 * El cambio de divisas, en firme y con fecha de vencimiento.
 *
 * Devuelve dos importes que casi nunca coinciden: `debitAmount` (lo que sale
 * de quien paga, en SU moneda) y `receiveAmount` (lo que entra a quien cobra,
 * en la suya). La diferencia es la tasa más lo que cobre la red, y es el
 * número que hay que enseñarle al comprador ANTES de que autorice: un pago
 * donde el comprador descubre el cambio después es una devolución esperando a
 * pasar.
 */
export async function cotizar(args: {
  billeteraPagador: string;
  cobro: string;
}) {
  const op = await clienteOpenPayments();
  const pagador = await op.walletAddress.get({ url: args.billeteraPagador });

  const permiso = await op.grant.request(
    { url: pagador.authServer },
    { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } }
  );

  return op.quote.create(
    {
      url: pagador.resourceServer,
      accessToken: tokenDe(permiso, "cotizar el cambio"),
    },
    { walletAddress: pagador.id, receiver: args.cobro, method: "ilp" }
  );
}

/**
 * Paso 1 de 2 del pago: pedirle permiso al dueño del dinero.
 *
 * Devuelve a dónde mandarlo (`redirect`) y con qué volver (`continuar`). Esos
 * dos datos hay que GUARDARLOS antes de redirigir: si se pierden, el permiso
 * queda concedido y sin usar, y la única salida es empezar de cero.
 */
export async function pedirPermisoDePago(args: {
  billeteraPagador: string;
  /** Lo que sale de su cuenta, tal como lo dijo la cotización. */
  debitAmount: Importe;
  /** Lo que entra a destino, tal como lo dijo la cotización. */
  receiveAmount: Importe;
  /** A dónde vuelve el comprador cuando autorice. */
  urlDeRegreso: string;
  /** Lo nuestro, para reconocerlo al volver. */
  nonce: string;
}) {
  const op = await clienteOpenPayments();
  const pagador = await op.walletAddress.get({ url: args.billeteraPagador });

  const permiso = await op.grant.request(
    { url: pagador.authServer },
    {
      access_token: {
        access: [
          {
            type: "outgoing-payment",
            actions: ["create", "read"],
            identifier: pagador.id,
            // El tope es exactamente lo cotizado: un permiso por más de lo que
            // se va a cobrar es un permiso que alguien puede gastar.
            //
            // Va `debitAmount` y no `receiveAmount` porque el estándar deja
            // poner uno de los dos, no los dos a la vez (`limits-outgoing` es
            // una unión). Se topa lo que SALE de la cuenta de quien paga, que
            // es lo que esa persona está autorizando: si la tasa se mueve
            // entre la cotización y el pago, el estándar prefiere que el
            // pago falle a que salga de su cuenta un peso más del que vio.
            limits: { debitAmount: args.debitAmount },
          },
        ],
      },
      interact: {
        start: ["redirect"],
        finish: {
          method: "redirect",
          uri: args.urlDeRegreso,
          nonce: args.nonce,
        },
      },
    }
  );

  if (!("interact" in permiso)) {
    // Sin interacción no hay consentimiento del dueño del dinero. Que el
    // servidor lo conceda igual no nos autoriza a usarlo.
    throw new Error(
      "El servidor concedió el pago sin pedir autorización a su dueño. " +
        "No se continúa."
    );
  }

  return {
    redirect: permiso.interact.redirect,
    continuar: {
      uri: permiso.continue.uri,
      token: permiso.continue.access_token.value,
    },
    // El nonce del servidor de autorización y su dirección. Los dos entran en
    // el hash que hay que recalcular cuando el comprador vuelva, así que hay
    // que guardarlos ahora: después no se pueden volver a pedir.
    asNonce: permiso.interact.finish,
    authServer: pagador.authServer,
  };
}

/**
 * ¿Este regreso lo manda de verdad la billetera?
 *
 * Cuando el comprador autoriza, su servidor de autorización lo devuelve a
 * nuestra URL con `interact_ref` y `hash`. Sin comprobar ese hash, cualquiera
 * que adivine la URL de regreso puede mandarnos un `interact_ref` inventado y
 * hacernos intentar rematar un pago que nadie autorizó. El hash es
 * base64url(sha256) de los cuatro datos separados por saltos de línea, en
 * este orden y sin nada más — lo fija GNAP, no nosotros.
 *
 * Se compara en tiempo constante por el mismo motivo que la firma del
 * gateway de SMS: un `===` filtra, por lo que tarda, cuántos caracteres
 * acertó quien prueba.
 */
export function verificarRegreso(args: {
  /** El nonce que generamos nosotros y viajó en `finish.nonce`. */
  nonce: string;
  /** El que devolvió el servidor de autorización al conceder el permiso. */
  asNonce: string;
  interactRef: string;
  /** La dirección del servidor de autorización, tal como se guardó. */
  authServer: string;
  /** El `hash` que trae la URL de regreso. */
  hash: string;
}): boolean {
  const base = `${args.nonce}\n${args.asNonce}\n${args.interactRef}\n${args.authServer}`;
  const esperado = createHash("sha256").update(base).digest("base64url");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(args.hash.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Paso 2 de 2: el comprador volvió con un `interact_ref`. Se canjea el permiso
 * por un token y con él se crea el pago.
 */
export async function rematarPago(args: {
  continuarUri: string;
  continuarToken: string;
  interactRef: string;
  billeteraPagador: string;
  cotizacion: string;
  referencia?: Record<string, string>;
}) {
  const op = await clienteOpenPayments();

  const concedido = await op.grant.continue(
    { url: args.continuarUri, accessToken: args.continuarToken },
    { interact_ref: args.interactRef }
  );

  if (!("access_token" in concedido) || !concedido.access_token?.value) {
    // Sigue pendiente: el comprador abrió el enlace pero no terminó de
    // autorizar. No es un error que haya que esconder — es «todavía no».
    throw new Error("El pago no está autorizado todavía.");
  }

  const pagador = await op.walletAddress.get({ url: args.billeteraPagador });

  return op.outgoingPayment.create(
    { url: pagador.resourceServer, accessToken: concedido.access_token.value },
    {
      walletAddress: pagador.id,
      quoteId: args.cotizacion,
      metadata: args.referencia,
    }
  );
}
