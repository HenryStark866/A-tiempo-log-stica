import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estadoDelGateway } from "@/lib/whatsapp";

/**
 * GET /api/whatsapp/estado
 *
 * Dice si el puente de WhatsApp está vivo, SIN mandarle un mensaje a nadie.
 *
 * Existe porque la alternativa para saberlo era mandarle un código de verdad a
 * un comprador de verdad y ver qué pasaba. Aquí se pregunta por la sesión y se
 * responde en español: si está apagado, si apunta a una dirección local que
 * desde la nube no se alcanza, o si WhatsApp se desconectó de la sesión.
 *
 * Solo para el CEDI: la respuesta dice a qué host apunta el puente, y eso no
 * tiene por qué saberlo un comercio.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Tu sesión venció." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("at_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const rol = (perfil as { role?: string } | null)?.role;
  if (!rol || !["admin", "coordinador", "operario"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  return NextResponse.json(await estadoDelGateway());
}
