"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapaGL,
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  LngLatBounds,
  type StyleSpecification,
  type LayerSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CourierType } from "@/lib/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MAPA DE LA FLOTA, EN TRES DIMENSIONES
 *
 * Antes esto era Leaflet con teselas planas: una lámina de calles vista desde
 * arriba, sin relieve y sin volumen. Para Medellín eso se queda especialmente
 * corto, porque la ciudad es un valle: un mensajero en Robledo y otro en El
 * Poblado pueden verse a dos centímetros en un plano y tener trescientos
 * metros de montaña entre ellos. En plano, quien despacha no ve esa montaña.
 *
 * Ahora el mapa es vectorial y con volumen de verdad (MapLibre GL, WebGL):
 *
 *   · El terreno tiene la elevación real, sacada de un modelo digital de
 *     alturas. Las laderas del valle se ven como laderas.
 *   · Los edificios se levantan con su altura real donde el mapa la conoce.
 *   · La cámara se inclina y gira, así que se mira el valle desde dentro y no
 *     desde el cenit.
 *   · Por defecto entra en satélite: imagen real, que es lo más parecido a
 *     mirar por la ventana. Además evita el problema que tenían las teselas
 *     claras, que en una pantalla oscura eran un rectángulo deslumbrante.
 *
 * ── Por qué aquí sí y en el teléfono del mensajero no ──────────────────
 * WebGL gasta más batería que un mapa de imágenes. Esta pantalla es del CEDI
 * y de coordinación (ver menu.ts: admin, coordinador, operario, admin_cedi),
 * gente que trabaja sentada y enchufada. El mensajero NO entra aquí: él lleva
 * MiniMap, que sigue siendo Leaflet plano y barato, y así se queda.
 *
 * ── De dónde salen los datos del mapa ──────────────────────────────────
 * Todo de fuentes abiertas y sin clave de API, para no atar la operación a una
 * factura ni a una cuota:
 *   · Relieve   → modelo de elevación público de AWS (formato terrarium).
 *   · Vectores  → OpenFreeMap, que sirve OpenStreetMap ya tesela­do.
 *   · Satélite  → imágenes de Esri World Imagery.
 * Los tres dominios están abiertos a mano en la CSP del middleware. Si se
 * cambia un proveedor aquí, hay que abrirlo allá o el mapa se queda en negro.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  titulo: string;
  detalle: string;
  /** naranja = mensajero, azul = sede */
  tipo: "mensajero" | "sede";
  /** Minutos desde el último reporte; por encima de cierto umbral se atenúa. */
  minutos?: number;
  courier_type?: CourierType | null;
  phone?: string | null;
  en_ruta?: number;
  por_salir?: number;
  entregadas_hoy?: number;
  max_capacity?: number;
}

const CENTRO_VALLE: [number, number] = [-75.5812, 6.2442]; // MapLibre va [lng, lat]
const MINUTOS_RANCIO = 10;

const FUENTE_VECTORES = "https://tiles.openfreemap.org/planet";
const ESTILO_CALLES = "https://tiles.openfreemap.org/styles/liberty";
const TESELAS_SATELITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TERRENO = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const ATRIBUCION_SAT =
  'Imágenes &copy; <a href="https://www.esri.com/">Esri</a> · Relieve: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>';

// ── Iconos ────────────────────────────────────────────────────────────────
const ICON_MOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11.5 17 3.5-3.5"/><path d="m14 14.5-3.5-3.5"/><path d="M14 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M22 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M12 7h5l1.5 4"/><path d="M17 11h2.5"/><path d="m5 13-2-2.5 1-1"/></svg>`;
const ICON_BICI = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>`;
const ICON_PIE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4v16"/><path d="M14 15l-4 5"/><path d="M10 15l4 5"/><circle cx="12" cy="4" r="1"/></svg>`;
const ICON_SEDE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>`;

function getIconSvg(tipo: string, courier_type?: string | null) {
  if (tipo === "sede") return ICON_SEDE;
  if (courier_type === "bici") return ICON_BICI;
  if (courier_type === "a_pie") return ICON_PIE;
  return ICON_MOTO;
}

/**
 * El elemento del marcador.
 *
 * Se devuelve un nodo del DOM y no una cadena porque MapLibre ancla marcadores
 * a elementos reales: así el mismo nodo se puede reutilizar cuando el punto se
 * mueve, en vez de crear uno nuevo en cada latido del realtime.
 */
function nodoMarcador(p: MapPoint): HTMLDivElement {
  const rancio = p.tipo === "mensajero" && (p.minutos ?? 0) > MINUTOS_RANCIO;
  const colorBg = p.tipo === "sede" ? "#334155" : rancio ? "#94a3b8" : "#ff812c";

  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:34px;height:34px;cursor:pointer;";
  el.innerHTML = `
    ${
      !rancio && p.tipo === "mensajero"
        ? `<div style="position:absolute;inset:-4px;border-radius:50%;background:#ff812c;opacity:.4;animation:atl-latido 2s infinite;"></div>`
        : ""
    }
    <div style="
      position:absolute;inset:0;
      background:${colorBg};color:#fff;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.45);z-index:10;">
      ${getIconSvg(p.tipo, p.courier_type)}
    </div>`;
  return el;
}

function popupHtml(p: MapPoint): string {
  if (p.tipo === "sede") {
    return `
      <div style="font-family:system-ui,sans-serif;padding:4px;">
        <h3 style="margin:0 0 4px;font-size:16px;font-weight:700;">${p.titulo}</h3>
        <p style="margin:0;font-size:14px;color:#64748b;">${p.detalle}</p>
      </div>`;
  }

  const letra = p.titulo.trim().charAt(0).toUpperCase();
  const entregadas = p.entregadas_hoy || 0;
  const capacidad = p.max_capacity || 10;
  const porcentaje = Math.min(100, Math.round((entregadas / Math.max(capacidad, 1)) * 100));

  let html = `
    <div style="font-family:system-ui,sans-serif;min-width:220px;padding:2px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="width:40px;height:40px;border-radius:50%;background:#ff812c;color:white;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;flex-shrink:0;">
          ${letra}
        </div>
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${p.titulo}</h3>
          <p style="margin:2px 0 0;font-size:13px;color:#64748b;line-height:1.3;">${p.detalle}</p>
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:4px;">
          <span>Carga completada</span>
          <span style="font-weight:600;">${entregadas}/${capacidad}</span>
        </div>
        <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
          <div style="height:100%;background:#10b981;width:${porcentaje}%;"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:#f1f5f9;color:#334155;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Maps</a>`;

  if (p.phone) {
    html += `<a href="tel:${p.phone}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:#ff812c;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Llamar</a>`;
  }

  return html + `</div></div>`;
}

/** El estilo de satélite se arma a mano: imagen real + edificios + relieve. */
function estiloSatelite(): StyleSpecification {
  return {
    version: 8,
    // Las etiquetas del estilo vectorial necesitan sus tipografías, y salen
    // del mismo servidor que las teselas.
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      satelite: {
        type: "raster",
        tiles: [TESELAS_SATELITE],
        tileSize: 256,
        maxzoom: 19,
        attribution: ATRIBUCION_SAT,
      },
      vectores: { type: "vector", url: FUENTE_VECTORES },
      relieve: {
        type: "raster-dem",
        tiles: [TERRENO],
        tileSize: 256,
        maxzoom: 15,
        encoding: "terrarium",
      },
    },
    layers: [
      { id: "satelite", type: "raster", source: "satelite" },
      capaEdificios(),
      capaNombres(),
    ],
    sky: {
      "sky-color": "#0b1a33",
      "horizon-color": "#7796b8",
      "fog-color": "#c8d6e8",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.2,
    },
  } as StyleSpecification;
}

/**
 * Los edificios, levantados con su altura real.
 *
 * `render_height` viene en los datos de OpenStreetMap para los edificios que
 * alguien se tomó el trabajo de medir. Los que no la tienen se quedan en la
 * altura por defecto del dato, no en cero: un bloque bajo es más parecido a la
 * realidad que un solar vacío.
 */
function capaEdificios(): LayerSpecification {
  return {
    id: "edificios-3d",
    type: "fill-extrusion",
    source: "vectores",
    "source-layer": "building",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "render_height"], 8],
        0, "#8f9aa8",
        40, "#b9c2cd",
        120, "#e6ebf1",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14, 0,
        // Sube desde el suelo al entrar: aparecer de golpe se ve como un salto.
        16, ["coalesce", ["get", "render_height"], 8],
      ],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.9,
    },
  } as LayerSpecification;
}

/** Nombres de barrios y municipios sobre el satélite, que si no es adivinar. */
function capaNombres(): LayerSpecification {
  return {
    id: "nombres",
    type: "symbol",
    source: "vectores",
    "source-layer": "place",
    minzoom: 9,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 16, 15],
      "text-anchor": "center",
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,.85)",
      "text-halo-width": 1.6,
    },
  } as LayerSpecification;
}

function interpolarMarcador(
  marcador: Marker,
  destino: [number, number],
  duracionMs = 1200
) {
  const inicio = marcador.getLngLat();
  const dLng = destino[0] - inicio.lng;
  const dLat = destino[1] - inicio.lat;

  // Un salto enorme es un dato nuevo, no un movimiento: se teletransporta en
  // vez de dibujar un viaje que nadie hizo.
  if (Math.abs(dLng) > 0.15 || Math.abs(dLat) > 0.15) {
    marcador.setLngLat(destino);
    return;
  }

  const t0 = performance.now();
  const paso = (t: number) => {
    const avance = Math.min((t - t0) / duracionMs, 1);
    const suave = 1 - Math.pow(1 - avance, 3);
    marcador.setLngLat([inicio.lng + dLng * suave, inicio.lat + dLat * suave]);
    if (avance < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

export function FleetMap({ puntos, alto = 420 }: { puntos: MapPoint[]; alto?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const marcadores = useRef<Record<string, Marker>>({});
  const encuadrado = useRef(false);
  const [vista, setVista] = useState<"satelite" | "calles">("satelite");
  const [listo, setListo] = useState(false);
  // Si el mapa no arranca, hay que decirlo. Un WebGL que falla no lanza
  // ningun error: simplemente no carga, y sin esto la pantalla se queda con
  // el aviso de "cargando" puesto para siempre y nadie sabe por que.
  const [tardando, setTardando] = useState(false);

  // ── Crear el mapa una sola vez ──────────────────────────────────────────
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = new MapaGL({
      container: contenedor.current,
      style: estiloSatelite(),
      center: CENTRO_VALLE,
      zoom: 12.5,
      // Inclinada de entrada: si arranca plana, nadie descubre que se puede
      // inclinar y el 3D no existe para quien lo mira.
      pitch: 55,
      bearing: -18,
      maxPitch: 80,
      attributionControl: { compact: true },
      // La rueda mueve la página, no el mapa, hasta que se toca el mapa: es
      // una pantalla que se desplaza y el zoom accidental la dejaba clavada.
      scrollZoom: false,
    });

    m.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    m.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    m.addControl(new FullscreenControl(), "top-right");

    // Un mapa que no carga se veia como un rectangulo con el aviso puesto para
    // siempre, sin una sola pista de por que. Ahora dice que paso.
    m.on("error", (e) => {
      console.error("[mapa] ", e?.error?.message ?? e);
    });

    m.on("load", () => {
      m.setTerrain({ source: "relieve", exaggeration: 1.15 });
      setListo(true);
    });

    // Doce segundos es mucho mas de lo que tarda en cargar con una conexion
    // mala; si a esas alturas no arranco, es que no va a arrancar.
    const rescate = window.setTimeout(() => setTardando(true), 12000);
    m.on("load", () => window.clearTimeout(rescate));

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __mapaYam?: MapaGL }).__mapaYam = m;
    }

    // Sin esto la rueda hace zoom mientras alguien solo quería bajar por la
    // página; se enciende al entrar con un clic y se apaga al salir.
    const nodo = contenedor.current;
    const encender = () => m.scrollZoom.enable();
    const apagar = () => m.scrollZoom.disable();
    nodo.addEventListener("click", encender);
    nodo.addEventListener("mouseleave", apagar);

    mapa.current = m;

    return () => {
      nodo.removeEventListener("click", encender);
      nodo.removeEventListener("mouseleave", apagar);
      m.remove();
      mapa.current = null;
      marcadores.current = {};
    };
  }, []);

  // ── Cambiar entre satélite y calles ─────────────────────────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    const alCargar = () => {
      // Cada estilo trae sus propias capas: el relieve y los edificios hay que
      // volver a ponerlos encima del estilo nuevo.
      if (!m.getSource("relieve")) {
        m.addSource("relieve", {
          type: "raster-dem",
          tiles: [TERRENO],
          tileSize: 256,
          maxzoom: 15,
          encoding: "terrarium",
        });
      }
      m.setTerrain({ source: "relieve", exaggeration: 1.15 });
      if (!m.getLayer("edificios-3d")) {
        if (!m.getSource("vectores")) {
          m.addSource("vectores", { type: "vector", url: FUENTE_VECTORES });
        }
        m.addLayer(capaEdificios());
      }
    };

    if (vista === "calles") {
      m.setStyle(ESTILO_CALLES);
    } else {
      m.setStyle(estiloSatelite());
    }
    m.once("styledata", alCargar);
  }, [vista, listo]);

  // ── Marcadores ──────────────────────────────────────────────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;

    const vivos = new Set(puntos.map((p) => p.id));
    for (const [id, marcador] of Object.entries(marcadores.current)) {
      if (!vivos.has(id)) {
        marcador.remove();
        delete marcadores.current[id];
      }
    }

    for (const p of puntos) {
      const existente = marcadores.current[p.id];
      if (existente) {
        interpolarMarcador(existente, [p.lng, p.lat]);
        existente.getPopup()?.setHTML(popupHtml(p));
      } else {
        const marcador = new Marker({ element: nodoMarcador(p) })
          .setLngLat([p.lng, p.lat])
          .setPopup(new Popup({ offset: 22, maxWidth: "280px" }).setHTML(popupHtml(p)))
          .addTo(m);
        marcadores.current[p.id] = marcador;
      }
    }

    if (!encuadrado.current && puntos.length > 0) {
      const limites = new LngLatBounds();
      puntos.forEach((p) => limites.extend([p.lng, p.lat]));
      m.fitBounds(limites, { padding: 80, maxZoom: 15, pitch: 55, duration: 900 });
      encuadrado.current = true;
    }
  }, [puntos, listo]);

  function centrarFlota() {
    const m = mapa.current;
    const ids = Object.keys(marcadores.current);
    if (!m || ids.length === 0) return;
    const limites = new LngLatBounds();
    puntos.forEach((p) => limites.extend([p.lng, p.lat]));
    m.fitBounds(limites, { padding: 80, maxZoom: 15, duration: 900 });
  }

  return (
    <div className="relative w-full" style={{ height: alto }}>
      <div ref={contenedor} className="atl-mapa h-full w-full overflow-hidden rounded-3xl" />

      {/* Los mandos van en HTML y no como controles de MapLibre para que sigan
          el mismo lenguaje visual que el resto de la app. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <div className="pointer-events-auto flex overflow-hidden rounded-xl border border-white/[0.14] bg-black/55 backdrop-blur-md">
          {(["satelite", "calles"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`px-3 py-2 text-[13px] font-semibold transition-colors ${
                vista === v ? "bg-[#ff812c] text-[#1C1C1E]" : "text-white/80 hover:text-white"
              }`}
            >
              {v === "satelite" ? "Satélite" : "Calles"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={centrarFlota}
          className="pointer-events-auto rounded-xl border border-white/[0.14] bg-black/55 px-3 py-2 text-[13px] font-semibold text-white/90 backdrop-blur-md transition-colors hover:text-white"
        >
          Centrar flota
        </button>
      </div>

      {!listo && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-3xl bg-[#0b1a33]/85 px-6 text-center backdrop-blur-sm">
          {tardando ? (
            <div className="max-w-sm">
              <p className="text-[15px] font-semibold text-white">
                El mapa en 3D no arrancó en este navegador
              </p>
              <p className="mt-2 text-[13px] leading-snug text-white/70">
                Necesita aceleración por hardware. Prueba a recargar; si sigue igual,
                el navegador la tiene desactivada.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 min-h-[44px] rounded-xl bg-[#ff812c] px-5 text-[14px] font-bold text-[#1C1C1E]"
              >
                Recargar
              </button>
            </div>
          ) : (
            <p className="text-[14px] text-white/70">Levantando el valle…</p>
          )}
        </div>
      )}
    </div>
  );
}
