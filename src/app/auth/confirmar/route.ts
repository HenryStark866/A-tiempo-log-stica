import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Canjea el enlace del correo de confirmación por una sesión y lleva a la
 * portada pública. Al confirmarse el correo, el trigger at_activate_on_confirm
 * ya le asignó su rol, así que si la sesión prende —abrió el enlace en el
 * mismo navegador— la cuenta ya está lista para usarse.
 *
 * Por qué la portada y no directo a la plataforma: el enlace del correo se
 * abre donde sea que alguien revise su bandeja, y ese no es necesariamente el
 * navegador —ni el teléfono— desde el que va a trabajar. Mandarlo a la
 * portada le da las dos salidas: entrar con la sesión que sí quedó activa, o
 * instalar la app e iniciar sesión ahí. `next` sigue existiendo para el caso
 * distinto de este flujo: /recuperar manda aquí con next=/nueva-clave, porque
 * ese enlace sí tiene que aterrizar en una pantalla concreta.
 *
 * Acepta las DOS formas en que Supabase puede mandar a la gente, porque
 * dependen de qué plantilla de correo esté puesta en el dashboard:
 *
 *  - `token_hash` + `type`: lo que manda nuestra plantilla propia
 *    (supabase/templates/confirmar-cuenta.html).
 *  - `code`: lo que manda la plantilla por defecto de Supabase, que usa el
 *    flujo PKCE.
 *
 * Soportar ambas evita que el enlace se rompa si alguien todavía no pegó la
 * plantilla propia, o si vuelve a la de fábrica.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Solo rutas internas: evita que un enlace manipulado nos use de redirector.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
    }
    return NextResponse.redirect(`${origin}${destino}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
    }
    return NextResponse.redirect(`${origin}${destino}`);
  }

  return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
}
