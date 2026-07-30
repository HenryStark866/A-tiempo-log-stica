"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
// Del paquete instalado, no de un CDN: si unpkg se cae, el mapa se vería roto
// (los tiles quedan descuadrados sin este CSS) y sería un fallo silencioso.
import "leaflet/dist/leaflet.css";

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
}

/** Centro por defecto: el Área Metropolitana, si todavía no hay nadie en el mapa. */
const CENTRO_VALLE: [number, number] = [6.2442, -75.5812];

/** Un punto más viejo que esto es una posición dudosa, no una posición actual. */
const MINUTOS_RANCIO = 10;

function icono(p: MapPoint): string {
  const rancio = p.tipo === "mensajero" && (p.minutos ?? 0) > MINUTOS_RANCIO;
  const color = p.tipo === "sede" ? "#334155" : rancio ? "#94a3b8" : "#ff812c";
  const letra = p.tipo === "sede" ? "C" : p.titulo.trim().charAt(0).toUpperCase();
  return `
    <div style="
      background:${color};color:#fff;width:34px;height:34px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font:700 15px system-ui,sans-serif;border:3px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.35);">${letra}</div>`;
}

/**
 * Mapa propio de la flota.
 *
 * Usa Leaflet directo y no react-leaflet a propósito: una capa menos que pueda
 * romperse con cada versión de React, y aquí solo hacen falta marcadores.
 *
 * Se importa dentro del efecto porque Leaflet toca `window` al cargarse y
 * revienta en el render del servidor.
 */
export function FleetMap({ puntos, alto = 420 }: { puntos: MapPoint[]; alto?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const marcadores = useRef<Record<string, Marker>>({});
  const encuadrado = useRef(false);

  useEffect(() => {
    let cancelado = false;

    const pintar = async () => {
      const L = await import("leaflet");
      if (cancelado || !contenedor.current) return;

      if (!mapa.current) {
        mapa.current = L.map(contenedor.current, {
          center: CENTRO_VALLE,
          zoom: 12,
          scrollWheelZoom: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(mapa.current);
      }

      const vivos = new Set(puntos.map((p) => p.id));

      // Se quitan los que ya no vienen (un mensajero que terminó su jornada).
      for (const [id, m] of Object.entries(marcadores.current)) {
        if (!vivos.has(id)) {
          m.remove();
          delete marcadores.current[id];
        }
      }

      for (const p of puntos) {
        const html = `<strong>${p.titulo}</strong><br/>${p.detalle}`;
        const existente = marcadores.current[p.id];

        if (existente) {
          // Mover el marcador en vez de recrearlo: así el mapa no parpadea en
          // cada refresco y el popup abierto no se cierra solo.
          existente.setLatLng([p.lat, p.lng]);
          existente.setIcon(
            L.divIcon({ html: icono(p), className: "", iconSize: [34, 34], iconAnchor: [17, 17] })
          );
          existente.setPopupContent(html);
        } else {
          marcadores.current[p.id] = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              html: icono(p),
              className: "",
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            }),
          })
            .addTo(mapa.current!)
            .bindPopup(html);
        }
      }

      // El encuadre automático solo la primera vez: después, si el operario
      // movió el mapa para mirar una zona, cada refresco se lo devolvería.
      if (!encuadrado.current && puntos.length > 0) {
        const bounds = L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number]));
        mapa.current!.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        encuadrado.current = true;
      }
    };

    // Un mapa que no se pinta es una molestia; una excepción aquí se llevaría
    // la pantalla entera y con ella la lista de mensajeros, que es lo que el
    // CEDI de verdad necesita. Leaflet revienta, por ejemplo, si le toca un
    // contenedor que ya tenía un mapa encima.
    pintar().catch(() => {
      /* sin mapa, pero la pantalla y la lista siguen en pie */
    });

    return () => {
      cancelado = true;
    };
  }, [puntos]);

  // Se destruye solo al desmontar, no en cada cambio de puntos.
  useEffect(() => {
    return () => {
      try {
        mapa.current?.remove();
      } catch {
        /* ya estaba destruido */
      }
      mapa.current = null;
      marcadores.current = {};
    };
  }, []);

  return (
    <div
      ref={contenedor}
      style={{ height: alto }}
      className="w-full overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800"
    />
  );
}
