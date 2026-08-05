/* ═══════════════════════════════════════════════════════════════════════════
   YAM — service worker

   Deliberadamente corto y desconfiado. Esta app muestra datos que cambian por
   minuto (recogidas, posiciones, guías): servir una versión vieja sería peor
   que no funcionar. Por eso:

     · La red manda siempre para las páginas. La caché solo entra cuando la red
       falla de verdad, y lo que devuelve es un aviso de "sin conexión", no una
       pantalla desactualizada que parezca al día.
     · Nada que venga de Supabase se guarda jamás. Ni datos ni sesiones.
     · Solo se cachean los iconos y el manifest, que no cambian nunca.

   Al publicar una versión nueva, el SW toma el control de inmediato
   (skipWaiting + clients.claim) y borra las cachés de versiones anteriores.

   ── Sobre VERSION ──
   Subir este número cambia el nombre de la caché de iconos y obliga a
   rehacerla. NO es lo que mantiene la app al día: de eso se encarga
   `/api/version`, que compara el commit publicado contra el que está corriendo
   (ver RegistrarSW.tsx). Este archivo solo hay que tocarlo si cambia lo que se
   precarga o el aviso de sin conexión.
   ═══════════════════════════════════════════════════════════════════════════ */

const VERSION = "yam-v3";
const ESTATICOS = `${VERSION}-estaticos`;

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
  try {
    const precargada = await event.preloadResponse;
    if (precargada) return precargada;
    return await fetch(event.request);
  } catch {
    return avisoSinConexion();
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
  if (url.origin !== self.location.origin) return; // Supabase, mapas, fuentes…

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
  }
  // Todo lo demás (incluido el JS de Next) va directo a la red: lo gobiernan
  // las cabeceras de caché que ya manda el servidor.
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
