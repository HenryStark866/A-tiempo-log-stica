"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { escucharTabla } from "@/lib/realtime";
import type { AppNotification } from "@/lib/types";

/**
 * Una sola fuente de notificaciones para toda la app.
 *
 * POR QUÉ UN CONTEXTO Y NO ESTADO EN LA CAMPANA
 * La campana se pinta dos veces: en el header del teléfono y en la barra lateral
 * del escritorio. Las dos están montadas siempre (solo se esconde una por CSS),
 * así que cuando la lógica vivía dentro del componente todo pasaba por
 * duplicado: dos consultas, dos sondeos y dos suscripciones al mismo canal de
 * Realtime —lo que además reventaba la pantalla entera—, y una notificación
 * entrante levantaba dos avisos del sistema.
 *
 * Aquí se hace una vez y las dos campanas leen de lo mismo.
 */

/**
 * Red de seguridad. Las notificaciones llegan por Realtime; esto solo cubre el
 * caso de que el socket se caiga sin avisar.
 */
const REFRESH_MS = 120000;

interface Notificaciones {
  items: AppNotification[];
  sinLeer: AppNotification[];
  marcarLeidas: () => Promise<void>;
  abrir: (n: AppNotification) => Promise<void>;
}

const Ctx = createContext<Notificaciones | null>(null);

export function NotificationsProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as AppNotification[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESH_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // ── Que suene sola ────────────────────────────────────────────────────
  // at_notifications está publicada en Realtime y su RLS ya limita cada fila a
  // su dueño, así que aquí solo llegan las propias. Cuando entra una nueva se
  // refresca la campana y, si el permiso está concedido, se levanta una
  // notificación del sistema: es lo que hace que el mensajero se entere con la
  // app en segundo plano.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    return escucharTabla<AppNotification>(
      supabase,
      "mis-notificaciones",
      {
        event: "INSERT",
        schema: "public",
        table: "at_notifications",
        filter: `user_id=eq.${userId}`,
      },
      (n) => {
        setItems((prev) =>
          prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 20)
        );

        // Solo si la persona no está mirando la app: si la tiene delante, el
        // punto naranja de la campana ya se lo dice sin interrumpir.
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          document.visibilityState !== "visible"
        ) {
          try {
            const aviso = new Notification(n.title, {
              body: n.body ?? undefined,
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
              tag: n.id, // evita apilar duplicados de la misma
            });
            aviso.onclick = () => {
              window.focus();
              if (n.link) router.push(n.link);
              aviso.close();
            };
          } catch {
            /* algunos navegadores exigen service worker: se queda en la campana */
          }
        }
      }
    );
  }, [userId, router]);

  const sinLeer = useMemo(() => items.filter((n) => !n.read_at), [items]);

  const marcarLeidas = useCallback(async () => {
    if (sinLeer.length === 0) return;
    const supabase = createClient();
    await supabase
      .from("at_notifications")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        sinLeer.map((n) => n.id)
      );
    cargar();
  }, [sinLeer, cargar]);

  const abrir = useCallback(
    async (n: AppNotification) => {
      if (!n.read_at) {
        const supabase = createClient();
        await supabase
          .from("at_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", n.id);
      }
      cargar();
      if (n.link) router.push(n.link);
    },
    [cargar, router]
  );

  const valor = useMemo(
    () => ({ items, sinLeer, marcarLeidas, abrir }),
    [items, sinLeer, marcarLeidas, abrir]
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Devuelve null si no hay provider en vez de lanzar: la campana es un accesorio
 * y no puede ser el motivo de que una pantalla no se pinte.
 */
export function useNotificaciones(): Notificaciones | null {
  return useContext(Ctx);
}
