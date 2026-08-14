"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Marker } from "leaflet";

interface MiniMapProps {
  lat: number;
  lng: number;
  alto?: number;
}

function slideTo(marker: Marker, dest: [number, number], durationMs = 1200) {
  const start = marker.getLatLng();
  const end = L.latLng(dest);
  
  if (start.distanceTo(end) > 10000) {
    marker.setLatLng(end);
    return;
  }

  const startTime = performance.now();

  function step(time: number) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    
    marker.setLatLng([
      start.lat + (end.lat - start.lat) * ease,
      start.lng + (end.lng - start.lng) * ease
    ]);
    
    if (progress < 1) requestAnimationFrame(step);
  }
  
  requestAnimationFrame(step);
}

export function MiniMap({ lat, lng, alto = 224 }: MiniMapProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<Marker | null>(null);

  useEffect(() => {
    let cancelado = false;

    const pintar = () => {
      if (cancelado || !contenedor.current) return;

      if (!mapa.current) {
        mapa.current = L.map(contenedor.current, {
          center: [lat, lng],
          zoom: 15,
          scrollWheelZoom: true,
        });

        // Tema automático
        const isDarkMode = document.documentElement.classList.contains("dark") || window.matchMedia('(prefers-color-scheme: dark)').matches;
        const tilesUrl = isDarkMode 
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

        L.tileLayer(tilesUrl, {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        }).addTo(mapa.current);

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
            container.title = 'Centrar en el mensajero';
            container.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
            
            container.onclick = function(e){
              e.stopPropagation();
              if (mapa.current && marcador.current) {
                mapa.current.setView(marcador.current.getLatLng(), 15);
              }
            }
            return container;
          }
        });
        mapa.current.addControl(new CenterControl());
      } else {
        // En cada render (si cambian las props lat/lng) se centra suavemente
        mapa.current.panTo([lat, lng]);
      }

      const iconHtml = `
        <div style="position:relative; width:34px; height:34px;">
          <div style="position:absolute;inset:-4px;border-radius:50%;background:#ff812c;opacity:0.4;animation:pulse 2s infinite;"></div>
          <style>@keyframes pulse { 0% { transform: scale(0.95); opacity: 0.5; } 50% { transform: scale(1.3); opacity: 0; } 100% { transform: scale(0.95); opacity: 0; } }</style>
          <div style="
            position:absolute;inset:0;
            background:#ff812c;color:#fff;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            border:3px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,.35);z-index:10;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11.5 17 3.5-3.5"/><path d="m14 14.5-3.5-3.5"/><path d="M14 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M22 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M12 7h5l1.5 4"/><path d="M17 11h2.5"/><path d="m5 13-2-2.5 1-1"/></svg>
          </div>
        </div>`;

      if (marcador.current) {
        slideTo(marcador.current, [lat, lng]);
      } else {
        const icon = L.divIcon({
          html: iconHtml,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        marcador.current = L.marker([lat, lng], { icon }).addTo(mapa.current!);
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
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      try {
        mapa.current?.remove();
      } catch {}
      mapa.current = null;
      marcador.current = null;
    };
  }, []);

  return (
    <div
      ref={contenedor}
      style={{ height: alto }}
      className="w-full bg-slate-100 dark:bg-slate-800 relative z-0"
    />
  );
}
