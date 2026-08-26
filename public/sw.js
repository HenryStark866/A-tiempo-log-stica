/* ═══════════════════════════════════════════════════════════════════════════
   YAM — service worker

   Deliberadamente corto y desconfiado. Esta app muestra datos que cambian por
   minuto (recogidas, posiciones, guías): servir una versión vieja sería peor
   que no funcionar. Por eso:

     · La red manda siempre para las páginas. La caché solo entra cuando la red
       falla de verdad.
     · Nada que venga de Supabase se guarda jamás. Ni datos ni sesiones.

   ── Por qué ahora sí se guarda el armazón de la app ──
   La versión anterior devolvía un aviso honesto de "sin conexión" para
   cualquier navegación sin red. Honesto, sí, pero dejaba en nada todo el
   trabajo sin conexión que la app ya sabía hacer: la ruta del día está
   guardada en el teléfono y la cola de entregas sabe esperar a que vuelva la
   señal, pero nada de eso sirve si la pantalla no abre siquiera.

   Así que se guardan dos cosas más, y solo esas dos:

     · `/_next/static/…` — el JS y el CSS del paquete. Llevan el hash del
       contenido en el nombre, así que una URL nunca cambia de contenido:
       servirlos de la caché no puede dar una versión equivocada.
     · El HTML de un puñado de pantallas de campo (abajo, PAGINAS_DE_CAMPO).
       Es el armazón: los datos los pone después el JS desde el teléfono.

   Ese HTML se pide con sesión iniciada, así que sale del aparato al cerrar
   sesión — AppShell le manda el aviso al SW (`yam:cerrar-sesion`).

   Lo demás sigue igual: una pantalla de administración sin red muestra el
   aviso de siempre, porque nadie factura desde una moto.

   Al publicar una versión nueva, el SW toma el control de inmediato
   (skipWaiting + clients.claim) y borra las cachés de versiones anteriores.

   ── Sobre VERSION ──
   Subir este número cambia el nombre de la caché de iconos y obliga a
   rehacerla. NO es lo que mantiene la app al día: de eso se encarga
   `/api/version`, que compara el commit publicado contra el que está corriendo
   (ver RegistrarSW.tsx). Este archivo solo hay que tocarlo si cambia lo que se
   precarga o el aviso de sin conexión.
   ═══════════════════════════════════════════════════════════════════════════ */

const VERSION = "yam-v4";
const ESTATICOS = `${VERSION}-estaticos`;
/** El paquete de Next: JS y CSS con hash en el nombre. */
const PAQUETE = `${VERSION}-paquete`;
/** El HTML de las pantallas de campo. */
const PAGINAS = `${VERSION}-paginas`;

/**
 * Las únicas pantallas cuyo HTML se guarda.
 *
 * El criterio es «¿se usa en la calle, sin wifi?». La ruta del mensajero y las
 * recogidas, sí. El CEDI, sí: es una bodega y la señal adentro es mala. Crear
 * un pedido, sí: la cola ya sabe subirlo después. Facturación, usuarios o el
 * mapa de flota, no — se usan sentados, con conexión, y guardar su HTML solo
 * sería dejar datos de más en un teléfono.
 */
const PAGINAS_DE_CAMPO = [
  "/entregas",
  "/recogidas",
  "/cedi",
  "/pedidos/nueva",
  "/inicio",
  // Las dos del conductor faltaban, y eran justo las que más lo necesitan:
  // `/conductor/recogida` se usa DENTRO del comercio, que es donde peor entra
  // la señal, y es donde se confirma que el paquete salió. `esDeCampo` cubre
  // las subrutas, así que con el prefijo basta.
  "/conductor",
];

/**
 * Techo del paquete guardado.
 *
 * Cada despliegue trae archivos con hash nuevo y los viejos quedan ahí. Sin un
 * tope, un teléfono que lleve meses con la app instalada acumularía todas las
 * versiones. Cuando se pasa, se borran los más viejos: `keys()` devuelve en
 * orden de entrada, así que los primeros son los que llevan más tiempo sin
 * renovarse.
 */
const TOPE_PAQUETE = 400;

/**
 * Las teselas del mapa. Es lo único de fuera que se guarda.
 *
 * Un mapa sin teselas es un cuadro gris con puntos flotando: la posición de
 * cada moto se sabe —eso viene de la base—, pero sin las calles debajo no
 * significa nada. Guardar lo que ya se vio hace que la pantalla del mapa
 * siga sirviendo sobre la zona donde se ha estado trabajando.
 *
 * Cache-first, como el paquete de Next, y por la misma razón: una tesela de
 * `/14/4681/6220.pbf` es siempre ese pedazo de mundo. Las calles de Medellín
 * no se mueven de un día para otro.
 */
const TESELAS = `${VERSION}-teselas`;
const SERVIDORES_DE_MAPA = [
  "tiles.openfreemap.org",
  "server.arcgisonline.com",
  "s3.amazonaws.com",
];

/**
 * Techo de teselas guardadas.
 *
 * Mil doscientas cubren de sobra el Valle de Aburrá en los acercamientos que
 * se usan, y ocupan unas pocas decenas de megas. Pasado el tope se van las más
 * viejas, que son las de las zonas que ya no se miran.
 */
const TOPE_TESELAS = 1200;

function esDeCampo(pathname) {
  return PAGINAS_DE_CAMPO.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

// Lo único que se precarga: cosas que no caducan.
const PRECARGA = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
];

const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · YAM</title>
<style>
  body{margin:0;height:100dvh;display:grid;place-items:center;
       background:#1C1C1E;color:#fff;
       font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
  h1{font-size:20px;margin:16px 0 8px}
  p{color:#98989D;font-size:15px;line-height:1.5;max-width:34ch;margin:0 auto}
  .p{color:#ff812c;font-size:44px;font-weight:700}
  button{margin-top:24px;min-height:48px;padding:0 24px;border:0;border-radius:14px;
         background:#ff812c;color:#1C1C1E;font-weight:700;font-size:15px}
</style></head>
<body><div>
  <div class="p">&#187;</div>
  <h1>Te quedaste sin señal</h1>
  <p>No pudimos cargar la pantalla. Tu trabajo no se pierde: en cuanto
     vuelva la conexión, sigue donde ibas.</p>
  <button onclick="location.reload()">Reintentar</button>
</div></body></html>`;

function avisoSinConexion() {
  return new Response(SIN_CONEXION, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: 503,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ESTATICOS);
      // Uno por uno y tolerando fallos: con `addAll`, que un solo icono
      // devuelva 404 aborta la instalación entera y la app se queda sin SW
      // nuevo — el peor final posible para una actualización.
      await Promise.all(PRECARGA.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Con un SW de por medio, cada navegación espera a que el worker
      // arranque antes de tocar la red. La precarga lanza la petición en
      // paralelo a ese arranque: es gratis y se nota en un teléfono de gama
      // baja con 3G, que es el escenario real del mensajero.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      const claves = await caches.keys();
      await Promise.all(
        claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function responderNavegacion(event) {
  const url = new URL(event.request.url);
  const guardable = esDeCampo(url.pathname);

  try {
    const precargada = await event.preloadResponse;
    const res = precargada || (await fetch(event.request));
    // Solo se guarda una respuesta buena, y de la dirección que se pidió.
    //
    // `res.redirected` es el filtro que importa: con la sesión vencida, el
    // middleware manda a /login y el navegador sigue el desvío, así que lo que
    // llega es la pantalla de entrar con un 200 perfecto. Guardarla bajo
    // /entregas dejaría al mensajero abriendo el formulario de inicio de
    // sesión cada vez que se quede sin señal, para siempre.
    if (guardable && res && res.ok && !res.redirected && res.type !== "opaqueredirect") {
      const copia = res.clone();
      caches.open(PAGINAS).then((c) => c.put(url.pathname, copia)).catch(() => {});
    }
    return res;
  } catch {
    if (guardable) {
      const guardado = await caches.match(url.pathname, { cacheName: PAGINAS });
      // El armazón guardado abre la pantalla; los datos los pone el JS desde
      // lo que haya en el teléfono. Es la diferencia entre un mensajero que
      // sigue trabajando y uno parado esperando señal.
      if (guardado) return guardado;
    }
    return avisoSinConexion();
  }
}

/**
 * El paquete de Next: de la caché si está, y se guarda la primera vez.
 *
 * Cache-first sin miramientos porque estas URL llevan el hash del contenido:
 * `/_next/static/chunks/abc123.js` es siempre el mismo archivo. Si el
 * despliegue cambia el contenido, cambia el nombre.
 */
async function responderPaquete(request) {
  const guardado = await caches.match(request, { cacheName: PAQUETE });
  if (guardado) return guardado;
  const res = await fetch(request);
  if (res.ok) {
    const copia = res.clone();
    const cache = await caches.open(PAQUETE);
    await cache.put(request, copia).catch(() => {});
    void podar(cache, TOPE_PAQUETE);
  }
  return res;
}

/**
 * Una tesela: de la caché si está; si no, de la red y se guarda.
 *
 * Si no hay red y tampoco está guardada, se responde un 504 vacío en vez de
 * dejar que reviente: MapLibre pinta el hueco y sigue con las demás. Un
 * pedazo del mapa en blanco es mucho mejor que un mapa que no carga.
 */
async function responderTesela(request) {
  const guardada = await caches.match(request, { cacheName: TESELAS });
  if (guardada) return guardada;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copia = res.clone();
      const cache = await caches.open(TESELAS);
      await cache.put(request, copia).catch(() => {});
      void podar(cache, TOPE_TESELAS);
    }
    return res;
  } catch {
    return new Response("", { status: 504 });
  }
}

async function podar(cache, tope) {
  try {
    const claves = await cache.keys();
    if (claves.length <= tope) return;
    const sobran = claves.slice(0, claves.length - tope);
    await Promise.all(sobran.map((k) => cache.delete(k)));
  } catch {
    /* podar es higiene, no función: si falla, no pasa nada hoy */
  }
}

async function responderEstatico(request) {
  const guardado = await caches.match(request);
  if (guardado) return guardado;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copia = res.clone();
      const cache = await caches.open(ESTATICOS);
      await cache.put(request, copia);
    }
    return res;
  } catch {
    // Un icono que no llega no debe romper la pantalla que lo pedía.
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Fuera todo lo que no sea una lectura simple del propio origen.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    // De fuera solo el mapa. Supabase jamás: sus respuestas traen datos y
    // sesiones, y servir una vieja sería mentir sobre el estado de la
    // operación.
    if (SERVIDORES_DE_MAPA.includes(url.hostname)) {
      event.respondWith(responderTesela(req));
    }
    return;
  }

  // La versión y la hora del servidor jamás se cachean: son justamente el
  // dato que sirve para saber que lo demás está viejo.
  if (url.pathname.startsWith("/api/")) return;

  // Navegación: la red primero. Si no hay señal, un aviso honesto.
  if (req.mode === "navigate") {
    event.respondWith(responderNavegacion(event));
    return;
  }

  // Iconos y manifest: de la caché si están, y se guardan la primera vez.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(responderEstatico(req));
    return;
  }

  // El paquete de Next. Sin esto, el HTML guardado abriría una pantalla en
  // blanco: el armazón sin el JS que lo llena no es nada.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(responderPaquete(req));
    return;
  }

  // Todo lo demás va directo a la red: lo gobiernan las cabeceras de caché
  // que ya manda el servidor.
});

/**
 * Al cerrar sesión, fuera el HTML guardado.
 *
 * Es lo único que se guarda pedido con sesión iniciada. El paquete de Next y
 * los iconos son públicos y se quedan: volver a bajarlos en el próximo inicio
 * de sesión sería castigar al que apenas está entrando.
 */
self.addEventListener("message", (event) => {
  if (event.data?.tipo === "yam:cerrar-sesion") {
    event.waitUntil(caches.delete(PAGINAS));
  }
});

// Tocar una notificación del sistema abre la app donde corresponde.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.link || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) {
          c.navigate(destino);
          return c.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
