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
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
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
    `img-src 'self' data: blob: https://tile.openstreetmap.org ${SUPABASE_ORIGIN}`,
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
    return res;
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
