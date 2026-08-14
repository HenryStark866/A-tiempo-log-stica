"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
// Del paquete instalado, no de un CDN
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Marker } from "leaflet";
import type { CourierType } from "@/lib/types";

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

const CENTRO_VALLE: [number, number] = [6.2442, -75.5812];
const MINUTOS_RANCIO = 10;

// SVG icons for couriers
const ICON_MOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11.5 17 3.5-3.5"/><path d="m14 14.5-3.5-3.5"/><path d="M14 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M22 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M12 7h5l1.5 4"/><path d="M17 11h2.5"/><path d="m5 13-2-2.5 1-1"/></svg>`;
const ICON_BICI = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>`;
const ICON_PIE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4v16"/><path d="M14 15l-4 5"/><path d="M10 15l4 5"/><circle cx="12" cy="4" r="1"/></svg>`;
const ICON_SEDE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>`;

function getIconSvg(tipo: string, courier_type?: string | null) {
  if (tipo === "sede") return ICON_SEDE;
  if (courier_type === "bici") return ICON_BICI;
  if (courier_type === "a_pie") return ICON_PIE;
  return ICON_MOTO; // Default to moto
}

function icono(p: MapPoint): string {
  const rancio = p.tipo === "mensajero" && (p.minutos ?? 0) > MINUTOS_RANCIO;
  const colorBg = p.tipo === "sede" ? "#334155" : rancio ? "#94a3b8" : "#ff812c";
  
  const animacion = !rancio && p.tipo === "mensajero" 
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;background:#ff812c;opacity:0.4;animation:pulse 2s infinite;"></div>
       <style>@keyframes pulse { 0% { transform: scale(0.95); opacity: 0.5; } 50% { transform: scale(1.3); opacity: 0; } 100% { transform: scale(0.95); opacity: 0; } }</style>`
    : "";

  return `
    <div style="position:relative; width:34px; height:34px;">
      ${animacion}
      <div style="
        position:absolute;inset:0;
        background:${colorBg};color:#fff;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        border:3px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.35);z-index:10;">
        ${getIconSvg(p.tipo, p.courier_type)}
      </div>
    </div>`;
}

function popupHtml(p: MapPoint): string {
  if (p.tipo === "sede") {
    return `
      <div style="font-family:system-ui,sans-serif;padding:4px;">
        <h3 style="margin:0 0 4px;font-size:16px;font-weight:700;">${p.titulo}</h3>
        <p style="margin:0;font-size:14px;color:#64748b;">${p.detalle}</p>
      </div>
    `;
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
        <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:#f1f5f9;color:#334155;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Maps
        </a>
  `;
  
  if (p.phone) {
    html += `
        <a href="tel:${p.phone}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:#ff812c;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Llamar
        </a>
    `;
  }
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

function slideTo(marker: L.Marker, dest: [number, number], durationMs = 1000) {
  const start = marker.getLatLng();
  const end = L.latLng(dest);
  
  // Si está a más de 10km (salto gigante), teleportar
  if (start.distanceTo(end) > 10000) {
    marker.setLatLng(end);
    return;
  }

  const startTime = performance.now();

  function step(time: number) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    
    const lat = start.lat + (end.lat - start.lat) * ease;
    const lng = start.lng + (end.lng - start.lng) * ease;
    
    marker.setLatLng([lat, lng]);
    
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  
  requestAnimationFrame(step);
}

export function FleetMap({ puntos, alto = 420 }: { puntos: MapPoint[]; alto?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcadores = useRef<Record<string, Marker>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterGroup = useRef<any>(null);
  const encuadrado = useRef(false);

  useEffect(() => {
    let cancelado = false;

    const pintar = () => {
      if (cancelado || !contenedor.current) return;

      if (!mapa.current) {
        mapa.current = L.map(contenedor.current, {
          center: CENTRO_VALLE,
          zoom: 12,
          scrollWheelZoom: true, // Accesibilidad: permitir zoom con rueda
        });

        // Capas gratuitas
        const cartoLight = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        });

        const cartoDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        });

        const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
          maxZoom: 19,
        });

        // Elegir tema según el sistema (modo oscuro)
        const isDarkMode = document.documentElement.classList.contains("dark") || window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isDarkMode) {
          cartoDark.addTo(mapa.current);
        } else {
          cartoLight.addTo(mapa.current);
        }

        // Control de capas
        const baseMaps = {
          "Plano (Claro)": cartoLight,
          "Plano (Oscuro)": cartoDark,
          "Satélite": esriSat,
        };
        L.control.layers(baseMaps, undefined, { position: 'bottomright' }).addTo(mapa.current);

        // Escala
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa.current);

        // Control Center
        const CenterControl = L.Control.extend({
          options: { position: 'topleft' },
          onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            container.style.backgroundColor = 'white';
            container.style.width = '34px';
            container.style.height = '34px';
            container.style.cursor = 'pointer';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.title = 'Centrar en mi flota';
            container.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>';
            
            container.onclick = function(e){
              e.stopPropagation();
              if (Object.keys(marcadores.current).length > 0 && mapa.current) {
                const markersArr = Object.values(marcadores.current);
                const group = L.featureGroup(markersArr);
                mapa.current.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 15 });
              }
            }
            return container;
          }
        });
        mapa.current.addControl(new CenterControl());

        clusterGroup.current = L.markerClusterGroup({
          maxClusterRadius: 40,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iconCreateFunction: function(cluster: any) {
            const childCount = cluster.getChildCount();
            return L.divIcon({ 
              html: `<div style="background:#334155;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 14px system-ui,sans-serif;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);">${childCount}</div>`, 
              className: 'marker-cluster-custom', 
              iconSize: [34, 34] 
            });
          }
        });
        mapa.current.addLayer(clusterGroup.current);
      }

      const vivos = new Set(puntos.map((p) => p.id));

      for (const [id, m] of Object.entries(marcadores.current)) {
        if (!vivos.has(id)) {
          clusterGroup.current.removeLayer(m);
          delete marcadores.current[id];
        }
      }

      for (const p of puntos) {
        const html = popupHtml(p);
        const existente = marcadores.current[p.id];

        if (existente) {
          // Movimiento fluido del marcador
          slideTo(existente, [p.lat, p.lng], 1200);
          existente.setIcon(
            L.divIcon({ html: icono(p), className: "", iconSize: [34, 34], iconAnchor: [17, 17] })
          );
          existente.setPopupContent(html);
        } else {
          const icon = L.divIcon({
            html: icono(p),
            className: "",
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });
          const marker = L.marker([p.lat, p.lng], { icon }).bindPopup(html);
          
          marcadores.current[p.id] = marker;
          clusterGroup.current.addLayer(marker);
        }
      }

      if (!encuadrado.current && puntos.length > 0) {
        const markersArr = Object.values(marcadores.current);
        const group = L.featureGroup(markersArr);
        mapa.current!.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 15 });
        encuadrado.current = true;
      }

      // Asegurar que el mapa se redimensione correctamente
      setTimeout(() => {
        mapa.current?.invalidateSize();
      }, 250);
    };

    pintar();

    return () => {
      cancelado = true;
    };
  }, [puntos]);

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
      className="w-full overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800 relative z-0"
    />
  );
}
