// SMS por un celular Android con «SMS Gateway for Android» (sms-gate.app).
//
// Va en su propio archivo, sin tocar `Deno`, para que los tests de Node
// (tests/smsgate-mock.test.ts) puedan ejercitarlo contra un servidor simulado
// sin mandar ningún SMS de verdad.

export type ConfigCelular = {
  url: string;
  usuario: string;
  clave: string;
  /**
   * Lista de números permitidos (E.164, separados por coma). Si viene, el
   * envío a cualquier otro número se rechaza ANTES de salir de la función.
   * Es el seguro para pruebas reales: solo el celular de Henry.
   */
  soloA?: string;
};

export function numerosPermitidos(soloA: string | undefined): string[] | null {
  const lista = (soloA ?? "").split(",").map((s) => s.replace(/[^\d+]/g, "")).filter(Boolean);
  return lista.length ? lista : null;
}

export async function enviarPorCelular(cfg: ConfigCelular, to: string, body: string): Promise<string> {
  const permitidos = numerosPermitidos(cfg.soloA);
  if (permitidos && !permitidos.includes(to)) {
    throw new Error(`Celular SMS: ${to} no está en SMSGATE_SOLO_A (modo de pruebas)`);
  }
  const res = await fetch(`${cfg.url.replace(/\/+$/, "")}/message`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${cfg.usuario}:${cfg.clave}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [to] }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Celular SMS: ${json?.message ?? json?.error ?? `HTTP ${res.status}`}`);
  }
  // La app acepta el envío y lo pone en cola en el teléfono; el id sirve para
  // rastrearlo en la propia app si un comprador dice que no le llegó.
  return String(json?.id ?? "celular");
}
