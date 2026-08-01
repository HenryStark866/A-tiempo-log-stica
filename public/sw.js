/* ═══════════════════════════════════════════════════════════════════════════
   A TIEMPO LOGÍSTICA — service worker

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
   ═══════════════════════════════════════════════════════════════════════════ */

const VERSION = "atl-v1";
const ESTATICOS = `${VERSION}-estaticos`;

// Lo único que se precarga: cosas que no caducan.
const PRECARGA = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ESTATICOS)
      .then((c) => c.addAll(PRECARGA))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Fuera todo lo que no sea una lectura simple del propio origen.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, mapas, fuentes…

  // Navegación: la red primero. Si no hay señal, un aviso honesto.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            `<!doctype html><html lang="es"><head><meta charset="utf-8">
             <meta name="viewport" content="width=device-width,initial-scale=1">
             <title>Sin conexión · JAM</title>
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
             </div></body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          )
      )
    );
    return;
  }

  // Iconos y manifest: de la caché si están, y se refrescan por detrás.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copia = res.clone();
            caches.open(ESTATICOS).then((c) => c.put(req, copia));
            return res;
          })
      )
    );
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
