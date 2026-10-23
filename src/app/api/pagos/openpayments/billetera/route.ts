import { type NextRequest, type NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { ok, fallo } from "@/lib/api/respuesta";
import { frenar } from "@/lib/api/freno";
import { resolverBilletera } from "@/lib/pagos/openpayments";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/pagos/openpayments/billetera — el comercio declara dónde cobra
 *
 * Esta ruta es la que faltaba para que `iniciar` pueda cobrarle a alguien.
 * `iniciar` exige `wallet_verified_at` no nulo (migración 0147: «null = sin
 * verificar: no cobrarle a nadie contra ella») y hasta ahora ninguna pantalla
 * lo llenaba, así que el pago internacional estaba escrito y apagado.
 *
 * ── Verificar es resolver, no validar el texto ────────────────────────────
 * La migración comprueba de mínimos —https y sin interrogante— y dice por qué
 * no comprueba más: una expresión regular no sabe si esa URL existe. Verificar
 * es preguntarle a la red, y eso es `resolverBilletera`. Si la red contesta,
 * la dirección existe, habla Open Payments y dice su moneda; si no contesta,
 * no se guarda nada. Quedarse con una dirección sin resolver y marcarla
 * verificada es exactamente la forma de mandar el dinero de un comprador a
 * ninguna parte.
 *
 * ── La moneda la dice la red, no la persona ──────────────────────────────
 * `wallet_asset_code` se llena con el `assetCode` que devolvió la billetera.
 * Si se tomara de un campo del formulario, un comercio que se equivoca de
 * moneda haría que `iniciar` cotizara en una divisa que su billetera no
 * maneja — y eso no falla al guardar: falla en la cara del comprador.
 *
 * ── Por qué el update va con el cliente de servicio ───────────────────────
 * Lectura y autorización van con el cliente de la persona: de su propio perfil
 * sale el `client_id`, y de ahí el comercio al que puede tocarle la billetera.
 * El update NO puede ir con ese cliente: en `at_clients` la única política de
 * UPDATE es «ops actualiza clientes» (migración 0014), que exige
 * `at_is_ops()`. El dueño del comercio no es ops, así que su update no daría
 * error — daría CERO FILAS y un «guardado» mentiroso en pantalla.
 *
 * Al no haber RLS que ponga el `where`, lo pone este código: `eq("id",
 * perfil.client_id)`, el comercio de quien llama. Nunca un id que venga en el
 * cuerpo — si viniera de ahí, un comercio podría poner su billetera en la
 * ficha de otro y desviarse los cobros ajenos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Verificaciones por persona y por minuto. */
const VERIFICACIONES_POR_MINUTO = 6;

/** El mismo mínimo que el `check` de la 0147, para no estrellarse contra él. */
const FORMA_DE_BILLETERA = /^https:\/\/[^\s?#]+$/;

interface Cuerpo {
  billetera?: string;
}

/**
 * Quién llama, y de qué comercio es. Devuelve o el comercio, o la respuesta
 * que hay que darle a quien no puede estar aquí.
 *
 * Está fuera de los dos manejadores porque los dos necesitan exactamente las
 * mismas tres comprobaciones, y una comprobación de permisos duplicada es una
 * comprobación que algún día solo se arregla en uno de los dos sitios.
 */
async function duenioDelComercio(): Promise<
  { clientId: string } | { respuesta: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { respuesta: fallo("Tu sesión venció.", 401) };
  }

  if (!frenar("op-billetera", `uid:${user.id}`, VERIFICACIONES_POR_MINUTO).pasa) {
    return {
      respuesta: fallo(
        "Vas muy rápido. Espera un momento y vuelve a intentarlo.",
        429
      ),
    };
  }

  // De qué comercio es quien llama lo decide RLS sobre su propio perfil: la
  // política de la 0003 solo le deja ver la fila cuyo `id` es su `auth.uid()`.
  const { data: perfil, error: errorPerfil } = await supabase
    .from("at_profiles")
    .select("client_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (errorPerfil || !perfil) {
    return { respuesta: fallo("No pudimos leer tu perfil.", 404) };
  }
  if (!perfil.client_id) {
    return {
      respuesta: fallo(
        "La billetera es de un comercio, y tu cuenta no tiene uno asociado.",
        403
      ),
    };
  }
  // `client_id` no basta: un asesor lleva el `client_id` de su jefe para que
  // RLS le abra los pedidos de ese comercio (ver src/lib/types.ts). Dónde cobra
  // el negocio lo decide su dueño, igual que los medios de pago y la
  // facturación, que la base tampoco le abre al asesor.
  if (perfil.role !== "cliente") {
    return {
      respuesta: fallo(
        "Solo el dueño del comercio puede cambiar su billetera.",
        403
      ),
    };
  }

  return { clientId: perfil.client_id as string };
}

export async function POST(request: NextRequest) {
  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return fallo("Cuerpo ilegible.", 400);
  }

  const billetera = cuerpo.billetera?.trim();

  if (!billetera) {
    return fallo("Escribe la dirección de tu billetera.", 400);
  }
  if (!FORMA_DE_BILLETERA.test(billetera) || billetera.length > 512) {
    return fallo(
      "Una dirección de billetera es una URL que empieza por https:// y no " +
        "lleva espacios, interrogante ni almohadilla.",
      400
    );
  }

  const quien = await duenioDelComercio();
  if ("respuesta" in quien) return quien.respuesta;

  let moneda: string;
  try {
    const resuelta = await resolverBilletera(billetera);
    if (!resuelta.assetCode) {
      return fallo(
        "Esa dirección respondió, pero no dijo en qué moneda opera. Revísala " +
          "con tu proveedor de billetera.",
        502
      );
    }
    moneda = resuelta.assetCode;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "desconocido";
    console.error("[op-billetera] la red no resolvió la dirección", motivo);
    // El motivo se escribe para enseñarlo tal cual: quien escribe su billetera
    // necesita saber qué hacer con el fallo, no el detalle de la red.
    return fallo(
      "No pudimos encontrar esa billetera en la red. Revisa que esté escrita " +
        "completa, tal como te la dio tu proveedor, y que sea pública.",
      502
    );
  }

  const verificadaEn = new Date().toISOString();
  const servicio = clienteDeServicio();
  const { data: guardado, error: errorGuardar } = await servicio
    .from("at_clients")
    .update({
      wallet_address: billetera,
      wallet_asset_code: moneda,
      wallet_verified_at: verificadaEn,
    })
    // El `where` que RLS no va a poner: el comercio de quien llama, y nada más.
    .eq("id", quien.clientId)
    .select("id")
    .maybeSingle();

  if (errorGuardar || !guardado) {
    console.error(
      "[op-billetera] no se pudo guardar la billetera",
      errorGuardar?.message ?? "ninguna fila"
    );
    return fallo("No se pudo guardar tu billetera. Vuelve a intentarlo.", 502);
  }

  return ok({
    billetera,
    moneda,
    verificada_en: verificadaEn,
  });
}

/**
 * DELETE — el comercio deja de cobrar por billetera.
 *
 * Hacía falta por una razón práctica: una billetera escrita mal pero que
 * resuelve —la de otra cuenta del mismo proveedor, por ejemplo— no se podía
 * quitar, solo reemplazar por otra que también resolviera. Y hacía falta por
 * una razón de fondo: un comercio tiene que poder dejar de recibir pagos sin
 * pedirle permiso a nadie.
 *
 * Borra las tres columnas juntas. Dejar la dirección y quitar solo
 * `wallet_verified_at` sería peor que no borrar nada: la dirección seguiría
 * ahí, pareciendo configurada, sin cobrar.
 */
export async function DELETE() {
  const quien = await duenioDelComercio();
  if ("respuesta" in quien) return quien.respuesta;

  const servicio = clienteDeServicio();
  const { data: guardado, error } = await servicio
    .from("at_clients")
    .update({
      wallet_address: null,
      wallet_asset_code: null,
      wallet_verified_at: null,
    })
    .eq("id", quien.clientId)
    .select("id")
    .maybeSingle();

  if (error || !guardado) {
    console.error(
      "[op-billetera] no se pudo quitar la billetera",
      error?.message ?? "ninguna fila"
    );
    return fallo("No se pudo quitar tu billetera. Vuelve a intentarlo.", 502);
  }

  // Los pagos que ya estaban en curso no se tocan: se armaron contra la
  // billetera de entonces y esa sigue siendo la que los tiene que recibir.
  return ok({ billetera: null });
}
