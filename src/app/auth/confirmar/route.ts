import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Canjea el enlace del correo de confirmación por una sesión y lleva a la
 * bienvenida. Al confirmarse el correo, el trigger at_activate_on_confirm ya
 * le asignó su rol, así que la persona aterriza con la cuenta lista.
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
  const next = searchParams.get("next") ?? "/bienvenido";

  // Solo rutas internas: evita que un enlace manipulado nos use de redirector.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/bienvenido";

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
