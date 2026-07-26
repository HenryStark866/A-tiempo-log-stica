import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Canjea el token del correo de confirmación por una sesión y lleva a la
 * bienvenida. Al confirmarse el correo, el trigger at_activate_on_confirm ya
 * le asignó su rol, así que la persona aterriza con la cuenta lista.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/bienvenido";

  // Solo rutas internas: evita que un enlace manipulado nos use de redirector.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/bienvenido";

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
