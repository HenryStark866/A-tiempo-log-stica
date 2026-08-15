import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /auth/* es público porque el enlace del correo llega sin sesión: es
// justamente la ruta que la crea.
// /pagar/<token> lo abre el destinatario desde el QR, sin cuenta.
// /recuperar es pública por lo mismo que /login: la abre quien no puede entrar.
// Ojo: /nueva-clave NO va aquí. Se llega desde el enlace del correo, que pasa
// por /auth/confirmar y deja sesión abierta; es esa sesión la que autoriza el
// cambio de contraseña. Dejarla pública permitiría abrirla sin haber probado
// nunca que se tiene acceso al correo.
// /api/version no dice nada de nadie —qué versión está publicada y qué hora
// es en el servidor— y lo consulta también la pantalla de login para poner el
// reloj en hora. Si pasara por el guardia, respondería un redirect a /login en
// vez de JSON.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/registro",
  "/rastreo",
  "/auth",
  "/pagar",
  "/recuperar",
  "/api/version",
  // Sin esto, el guardia de sesión mandaría /mantenimiento a /login, y el modo
  // mantenimiento manda /login a /mantenimiento: un bucle que deja la pantalla
  // inalcanzable justo cuando es la única que debería verse.
  "/mantenimiento",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );
}

/**
 * Modo mantenimiento, para la mudanza de base de datos.
 *
 * Se enciende poniendo MANTENIMIENTO=1 en Vercel y volviendo a desplegar. No
 * es NEXT_PUBLIC_ a propósito: se lee aquí, en el servidor, para que no se
 * pueda esquivar desde el navegador.
 *
 * Solo cubre la PLATAFORMA, que es donde la gente escribe. Lo que se queda en
 * pie es lo que solo lee: el rastreo público y la pantalla de pago. Dejar a un
 * destinatario sin saber dónde va su paquete —o sin poder ver a quién pagarle
 * cuando el mensajero ya está en la puerta— sería cerrar justo lo que menos
 * estorba y más se necesita.
 *
 * Por qué existe: mientras la base se mueve de un proyecto a otro, cualquier
 * cosa que alguien guarde se escribiría en la base VIEJA y no llegaría a la
 * nueva. No es que la app se caiga: es que ese trabajo se pierde en silencio y
 * nadie lo nota hasta días después.
 */
const EN_MANTENIMIENTO = process.env.MANTENIMIENTO === "1";

// Lo que sigue abierto durante la mudanza. `/` incluida: la portada lleva el
// buscador de rastreo.
const SIGUE_ABIERTO = ["/", "/rastreo", "/pagar", "/mantenimiento", "/api/version"];

function aguantaElMantenimiento(pathname: string) {
  return SIGUE_ABIERTO.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );
}

const SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
const SUPABASE_WS_ORIGIN = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

/**
 * CSP con nonce por request, siguiendo la receta oficial de Next.js: el nonce
 * viaja en `x-nonce` para que el layout se lo pase a next-themes (que inyecta
 * un script inline para poner el tema antes del primer pintado — sin nonce,
 * `script-src` tendría que abrir 'unsafe-inline' y perder el sentido).
 *
 * Solo corre en producción: en dev, React Refresh y el HMR de webpack
 * necesitan eval() y conexiones que una CSP estricta bloquearía, y esta app
 * no tiene forma de distinguir "es HMR" de "es un script inyectado" en modo
 * desarrollo.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    // Los tres servidores de teselas que usa FleetMap, y solo esos.
    //
    // Aquí estaba el mapa gris en producción: la lista solo abría
    // tile.openstreetmap.org, pero el código pide las teselas a CARTO (claro y
    // oscuro) y a Esri (satélite). El navegador las bloqueaba todas y el mapa
    // se quedaba en blanco, sin un error visible en pantalla — el aviso solo
    // sale en la consola, donde nadie que use la app está mirando.
    //
    // La regla se rompió sola cuando alguien cambió el proveedor de teselas sin
    // que nada obligara a actualizar esta línea. Si mañana se cambia otra vez,
    // hay que volver aquí.
    `img-src 'self' data: blob: https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com ${SUPABASE_ORIGIN}`,
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN}`,
    // /seguimiento embebe el mapa de OpenStreetMap en un iframe mientras el
    // mensajero va en ruta: sin frame-src explícito, cae en default-src
    // 'self' y lo bloquea.
    "frame-src https://www.openstreetmap.org",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const csp = process.env.NODE_ENV === "production" ? buildCsp(nonce) : null;

  // El nonce va en un header de REQUEST (no de response): así llega a los
  // Server Components vía `headers()`, que es de donde lo lee el layout raíz.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const requestConNonce = { headers: requestHeaders };

  function conCsp(res: NextResponse): NextResponse {
    if (csp) res.headers.set("Content-Security-Policy", csp);

    // Estas no dependen del entorno: valen igual en desarrollo, y así no se
    // descubre en producción que faltaba una.
    //
    // nosniff: sin ella, un archivo subido por un usuario —un comprobante de
    //   pago, la foto de una cédula— puede servirse como HTML si el navegador
    //   "adivina" el tipo, y ejecutarse en nuestro dominio.
    // Referrer-Policy: los enlaces de rastreo y pago llevan el token EN LA URL.
    //   Sin esto, al tocar un enlace externo el token viaja entero en el
    //   Referer hasta un sitio ajeno.
    // Permissions-Policy: solo el mensajero necesita ubicación, y la pide desde
    //   la app; nada más debería poder pedir cámara, micrófono ni GPS.
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    // Iba cerrada del todo: camera=() sin "self" bloquea getUserMedia incluso
    // para el propio sitio, y dejaba muerto el escáner QR del CEDI (EscanerQR.tsx)
    // en cualquier entorno — no es que fallara el permiso, es que ni se podía
    // pedir. Los <input capture="environment"> de entregas y pedidos no se ven
    // afectados: abren la app de cámara del sistema, no esta API.
    res.headers.set("Permissions-Policy", "camera=(self), microphone=(), payment=(), geolocation=(self)");
    if (process.env.NODE_ENV === "production") {
      res.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload"
      );
    }
    return res;
  }

  // La mudanza se comprueba ANTES de hablar con Supabase: durante la ventana
  // la base puede estar a medio restaurar, y no tiene sentido preguntarle por
  // una sesión para acabar mandando a la misma pantalla de todos modos.
  if (EN_MANTENIMIENTO && !aguantaElMantenimiento(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/mantenimiento";
    url.search = "";
    // 307 y no 308: esto se acaba en media hora. Con una permanente, el
    // navegador de un mensajero se seguiría yendo a /mantenimiento durante
    // días aunque la app ya estuviera arriba.
    return conCsp(NextResponse.redirect(url, 307));
  }

  let supabaseResponse = NextResponse.next({ request: requestConNonce });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: requestConNonce });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // La plantilla de correo de fábrica de Supabase manda al Site URL con
  // ?code=..., o sea a la portada, que no sabe qué hacer con eso. Se reenvía a
  // la ruta que sí lo canjea, para que el enlace funcione con cualquiera de
  // las dos plantillas.
  if (
    request.nextUrl.pathname === "/" &&
    request.nextUrl.searchParams.has("code")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirmar";
    return conCsp(NextResponse.redirect(url));
  }

  // IMPORTANTE: mantiene la sesión fresca en cada request
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return conCsp(NextResponse.redirect(url));
  }

  return conCsp(supabaseResponse);
}

export const config = {
  // El manifest y el service worker quedan fuera a propósito: el navegador los
  // pide sin sesión y, si el middleware los manda al login, la app deja de ser
  // instalable y el SW nunca llega a registrarse.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
