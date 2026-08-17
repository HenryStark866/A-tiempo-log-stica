import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL RELOJ DE SHOPIFY
 *
 * Sustituye al `cron.schedule('at-shopify', '*​/15 * * * *')` de la migración
 * 0082, que llama a la edge function con `net.http_post`.
 *
 * ── Por qué se mueve ────────────────────────────────────────────────────
 *
 * No es por gusto de usar AWS. Es porque el de ahora **falla callado**.
 *
 * Hoy mismo, en producción, esa llamada responde 401 porque falta el secreto
 * `AT_CRON_SECRET` en los secretos de la edge function (está documentado en
 * docs/arranque-produccion.md, punto 1). O sea que los pedidos de Shopify NO
 * están entrando solos. Y la única forma de enterarse es entrar al editor SQL
 * y mirar `net._http_response` a mano — nadie lo hace, y menos a diario.
 *
 * Con esto, ese mismo 401 hace fallar la Lambda, salta una alarma de
 * CloudWatch y llega un correo. La diferencia no es la nube: es que el fallo
 * se ve.
 *
 * Lo que se gana además:
 *   · Reintentos automáticos, y lo que agote los reintentos cae a una cola
 *     muerta en vez de evaporarse.
 *   · Los logs quedan en CloudWatch, con el detalle de cada corrida.
 *   · El secreto vive en Secrets Manager: rotable y auditable, en vez de solo
 *     dentro de Vault de Supabase.
 *
 * ── Lo que NO cambia ────────────────────────────────────────────────────
 *
 * La sincronización sigue ocurriendo en la edge function de Supabase, que es
 * quien habla con Shopify y escribe en la base. Esta Lambda solo la despierta.
 * Es deliberado: mover también la lógica sería reescribir el sync entero, y
 * eso no es lo que hace falta hoy.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const sm = new SecretsManagerClient({});

/**
 * El secreto se cachea entre invocaciones: la Lambda se reutiliza y pedirlo
 * cada 15 minutos a Secrets Manager es una llamada de red y un cobro por nada.
 * Si la Lambda se recicla, la caché se va con ella y se vuelve a pedir.
 */
let secretoCache = null;

async function leerSecreto() {
  if (secretoCache) return secretoCache;
  const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRETO_ARN }));
  secretoCache = JSON.parse(r.SecretString);
  return secretoCache;
}

export const handler = async () => {
  const inicio = Date.now();
  const { cron_secret, anon_key } = await leerSecreto();

  if (!cron_secret) {
    // Fallo seguro, igual que la edge function: antes de mandar una llamada
    // que va a rebotar con 401, se para aquí con un mensaje que dice qué falta.
    throw new Error(
      "Falta cron_secret en Secrets Manager. Tiene que ser EL MISMO valor que " +
        "AT_CRON_SECRET en Supabase → Edge Functions → Secrets. " +
        "Se lee con: select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret';"
    );
  }

  const url = `${process.env.SUPABASE_URL}/functions/v1/shopify-sync`;

  // 120 s, lo mismo que tenía el `timeout_milliseconds` de pg_cron: recorre
  // TODAS las tiendas conectadas en una sola llamada, y cada una habla con un
  // servidor de Shopify que puede tardar lo suyo.
  const corte = AbortSignal.timeout(120_000);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: corte,
      headers: {
        "Content-Type": "application/json",
        // La edge function exige las dos: el Bearer para pasar el portero de
        // Supabase, y x-at-cron para probar que quien llama es el reloj.
        Authorization: `Bearer ${anon_key}`,
        "x-at-cron": cron_secret,
      },
      body: "{}",
    });
  } catch (e) {
    throw new Error(`No se pudo hablar con la edge function: ${e.message}`);
  }

  const cuerpo = await res.text();

  if (!res.ok) {
    // El caso que hoy no se ve. Un 401 aquí significa que cron_secret y
    // AT_CRON_SECRET no coinciden — y desde este momento se entera alguien.
    const pista =
      res.status === 401
        ? " · cron_secret no coincide con AT_CRON_SECRET en Supabase"
        : "";
    throw new Error(`shopify-sync respondió ${res.status}${pista}: ${cuerpo.slice(0, 400)}`);
  }

  let datos;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    throw new Error(`shopify-sync respondió algo que no es JSON: ${cuerpo.slice(0, 400)}`);
  }

  const { tiendas = 0, creadas = 0, fallaron = [] } = datos;
  const ms = Date.now() - inicio;

  // Una línea por corrida, buscable en CloudWatch Logs Insights.
  console.log(JSON.stringify({ nivel: "info", tiendas, creadas, fallaron, ms }));

  if (fallaron.length > 0) {
    // No se lanza excepción: las demás tiendas SÍ se sincronizaron y reintentar
    // la corrida entera volvería a procesarlas. Se emite una métrica propia y
    // es la alarma la que avisa. Suele ser un token de Shopify vencido, y eso
    // lo arregla el comercio reconectando su tienda, no un reintento.
    console.error(
      JSON.stringify({
        nivel: "error",
        mensaje: "Hay tiendas que no sincronizaron",
        fallaron,
      })
    );
  }

  // Formato de métrica embebida: CloudWatch saca métricas de estas líneas sin
  // que haya que llamar a PutMetricData, que se cobra aparte.
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "YAM/Shopify",
            Dimensions: [[]],
            Metrics: [
              { Name: "TiendasFallidas", Unit: "Count" },
              { Name: "PedidosCreados", Unit: "Count" },
              { Name: "DuracionMs", Unit: "Milliseconds" },
            ],
          },
        ],
      },
      TiendasFallidas: fallaron.length,
      PedidosCreados: creadas,
      DuracionMs: ms,
    })
  );

  return { tiendas, creadas, fallaron, ms };
};
