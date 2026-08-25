/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL PUENTE CON WHATSAPP
 *
 * Habla con el gateway OpenWA que Henry ya tiene montado: un servicio que
 * mantiene abierta una sesión de WhatsApp Web —la del número de la operación—
 * y expone una API REST para mandar mensajes por ella. El mismo que usa
 * PrivacyCheck; aquí solo se adapta.
 *
 * ── Por qué esto vive en el servidor y no en el navegador ──────────────────
 * La llave del gateway (OPENWA_API_KEY) no puede salir al cliente: quien la
 * tenga puede mandar WhatsApp desde el número de la empresa. Por eso todo pasa
 * por /api/whatsapp/*, que corre en el servidor de Vercel. De paso, así la CSP
 * no estorba: la petición no la hace el navegador.
 *
 * ── Lo que hay que saber antes de confiar en esto ──────────────────────────
 * · El gateway corre en el PC de la oficina. Si ese equipo está apagado o el
 *   túnel se cayó, no sale ningún mensaje. Por eso el envío por aquí NUNCA
 *   reemplaza al botón manual: lo adelanta cuando funciona y se aparta cuando
 *   no. Ver `enviarPorWhatsApp`, que devuelve el motivo en vez de reventar.
 * · Es WhatsApp Web automatizado, no la API oficial de Meta. Funciona y no
 *   cuesta, pero WhatsApp no lo bendice: un volumen alto de mensajes a números
 *   que nunca han escrito puede costar el bloqueo del número. Para códigos de
 *   entrega —pocos, esperados y a clientes que acaban de comprar— el riesgo es
 *   bajo, pero conviene saberlo antes de mandar mil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const URL_GATEWAY = process.env.OPENWA_API_URL ?? "";
const LLAVE = process.env.OPENWA_API_KEY ?? "";
const SESION = process.env.OPENWA_SESSION_NAME || "walle";

/** Cuánto se espera al gateway antes de rendirse y dejar el envío manual. */
const TIEMPO_LIMITE_MS = 12_000;

export interface ResultadoEnvio {
  ok: boolean;
  /** Para el operario, en español y sin jerga. */
  motivo?: string;
}

function cabeceras() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": LLAVE,
    // Los túneles tipo localtunnel meten una página de aviso por delante si no
    // se manda esta cabecera, y la respuesta deja de ser JSON.
    "Bypass-Tunnel-Reminder": "true",
  };
}

/** 3001234567 → 573001234567@c.us, que es como WhatsApp identifica un chat. */
export function aChatId(telefono: string): string {
  if (telefono.includes("@")) return telefono;
  const digitos = telefono.replace(/\D/g, "");
  // Un número colombiano de 10 dígitos viene sin indicativo; se le pone.
  const conIndicativo = digitos.length === 10 ? `57${digitos}` : digitos;
  return `${conIndicativo}@c.us`;
}

/** ¿Está configurado el puente? Sin URL no hay nada que intentar. */
export function hayGateway(): boolean {
  return URL_GATEWAY.trim().length > 0;
}

/**
 * Un gateway en localhost sirve en el portátil de quien programa, pero NO desde
 * Vercel: el servidor de la nube no puede llegar a la red de la oficina. Se
 * detecta para poder decirlo claro en vez de dejar un fallo sin explicación.
 */
export function esLocal(): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
    URL_GATEWAY
  );
}

async function pedir(ruta: string, init?: RequestInit): Promise<Response> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);
  try {
    return await fetch(`${URL_GATEWAY}${ruta}`, {
      ...init,
      headers: cabeceras(),
      cache: "no-store",
      signal: control.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Manda un mensaje. No lanza: devuelve por qué no se pudo, porque quien llama
 * siempre tiene un plan B (el envío manual) y necesita explicárselo a alguien.
 */
export async function enviarPorWhatsApp(
  telefono: string,
  texto: string
): Promise<ResultadoEnvio> {
  if (!hayGateway()) {
    return { ok: false, motivo: "El envío automático no está configurado todavía." };
  }
  if (esLocal()) {
    return {
      ok: false,
      motivo:
        "El puente de WhatsApp apunta a una dirección local, y desde la nube no se puede llegar ahí. Hay que exponerlo con un túnel.",
    };
  }

  try {
    const res = await pedir(`/api/sessions/${SESION}/messages/send-text`, {
      method: "POST",
      body: JSON.stringify({ chatId: aChatId(telefono), text: texto }),
    });

    if (res.ok) return { ok: true };

    const detalle = (await res.text()).slice(0, 200);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, motivo: "El puente rechazó la llave de acceso." };
    }
    if (res.status === 404) {
      return {
        ok: false,
        motivo: `El puente no encuentra la sesión «${SESION}». Revisa que WhatsApp siga conectado allí.`,
      };
    }
    return { ok: false, motivo: `El puente respondió ${res.status}: ${detalle}` };
  } catch (e) {
    const abortado = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      motivo: abortado
        ? "El puente no respondió a tiempo. Puede que el equipo esté apagado."
        : "No se pudo llegar al puente de WhatsApp.",
    };
  }
}

export interface EstadoGateway {
  configurado: boolean;
  local: boolean;
  conectado: boolean;
  sesion: string;
  detalle?: string;
}

/** Para que el CEDI pueda ver de un vistazo si el envío automático está vivo. */
export async function estadoDelGateway(): Promise<EstadoGateway> {
  const base: EstadoGateway = {
    configurado: hayGateway(),
    local: esLocal(),
    conectado: false,
    sesion: SESION,
  };
  if (!base.configurado) return { ...base, detalle: "Sin configurar" };
  if (base.local) return { ...base, detalle: "Apunta a una dirección local" };

  try {
    const res = await pedir("/api/sessions");
    if (!res.ok) return { ...base, detalle: `El puente respondió ${res.status}` };

    const sesiones = (await res.json()) as { name?: string; status?: string }[];
    const mia = Array.isArray(sesiones) ? sesiones.find((s) => s.name === SESION) : undefined;
    const estado = (mia?.status ?? "").toLowerCase();
    const viva = ["ready", "working", "connected"].includes(estado);

    return {
      ...base,
      conectado: viva,
      detalle: mia ? `Sesión «${SESION}»: ${mia.status}` : `No existe la sesión «${SESION}»`,
    };
  } catch {
    return { ...base, detalle: "El puente no respondió" };
  }
}
