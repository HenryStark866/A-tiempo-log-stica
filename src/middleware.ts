import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /auth/* es público porque el enlace del correo llega sin sesión: es
// justamente la ruta que la crea.
// /pagar/<token> lo abre el destinatario desde el QR, sin cuenta.
const PUBLIC_PATHS = ["/", "/login", "/registro", "/rastreo", "/auth", "/pagar"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
    return NextResponse.redirect(url);
  }

  // IMPORTANTE: mantiene la sesión fresca en cada request
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // El manifest y el service worker quedan fuera a propósito: el navegador los
  // pide sin sesión y, si el middleware los manda al login, la app deja de ser
  // instalable y el SW nunca llega a registrarse.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
