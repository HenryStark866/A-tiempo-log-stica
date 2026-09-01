"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { reproducirSonidoNotificacion } from "@/lib/sonidoNotificacion";
import type { AppNotification } from "@/lib/types";

/**
 * Una sola fuente de notificaciones para toda la app.
 *
 * POR QUÉ UN CONTEXTO Y NO ESTADO EN LA CAMPANA
 * La campana se pinta dos veces: en el header del teléfono y en la barra lateral
 * del escritorio. Las dos están montadas siempre (solo se esconde una por CSS),
 * así que cuando la lógica vivía dentro del componente todo pasaba por
 * duplicado: dos consultas, dos sondeos, y una notificación entrante levantaba
 * dos avisos del sistema.
 *
 * Aquí se hace una vez y las dos campanas leen de lo mismo.
 */

/**
 * Cada cuánto se pregunta por notificaciones nuevas.
 *
 * Esto ERA una red de seguridad de dos minutos, porque lo que avisaba de
 * verdad era Realtime. El 2026-08-31 se apagó el tiempo real: sondear el WAL
 * 1,9 veces por segundo día y noche era el 95 % del trabajo de la base, y lo
 * pagaba una sola suscripción.
 *
 * Así que este número ya no es la red: es EL mecanismo, y por eso baja de 120
 * a 20 segundos. Veinte segundos de retraso en un aviso es asumible; dos
 * minutos no lo era.
 *
 * Cuesta muchísimo menos de lo que costaba el tiempo real, y por un motivo que
 * conviene no perder de vista: esto solo corre con la pestaña abierta. El
 * tiempo real sondeaba a las tres de la mañana sin nadie conectado.
 */
const REFRESH_MS = 20_000;

/** Cuántos avisos del sistema se levantan de golpe si llegan varios juntos. */
const TOPE_AVISOS_DE_GOLPE = 3;

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

  /**
   * Los ids que ya se habían visto, para saber cuáles son NUEVAS.
   *
   * `null` mientras no ha habido primera carga, y esa distinción importa: en
   * la primera todo es desconocido, y sin este guardia la app sonaría veinte
   * veces y levantaría veinte avisos del sistema nada más abrirla.
   */
  const conocidas = useRef<Set<string> | null>(null);

  /**
   * Avisar de lo que acaba de llegar.
   *
   * Esto vivía dentro de la suscripción de Realtime, que entregaba las
   * notificaciones de una en una. Ahora llegan en grupo, así que hay dos
   * diferencias a propósito:
   *
   *  · el sonido suena UNA vez aunque entren cinco — cinco flechas seguidas no
   *    avisan mejor, molestan;
   *  · los avisos del sistema se topan, porque una ráfaga de doce es lo que
   *    hace que alguien le quite el permiso a la app y ya no se entere de nada.
   */
  const avisar = useCallback(
    (nuevas: AppNotification[]) => {
      if (nuevas.length === 0) return;

      // Con la app delante, el punto naranja de la campana ya avisa sin
      // interrumpir — pero sin ruido no se entera si no está mirando la
      // pantalla justo ahí. Con la app en segundo plano el aviso del sistema
      // ya trae su propio sonido: sonarían los dos a la vez.
      if (document.visibilityState === "visible") {
        reproducirSonidoNotificacion();
        return;
      }

      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }

      for (const n of nuevas.slice(0, TOPE_AVISOS_DE_GOLPE)) {
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
    },
    [router]
  );

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    const lista = (data as AppNotification[]) ?? [];
    setItems(lista);

    const vistas = conocidas.current;
    // El orden importa: primero se apunta lo que hay, y solo después se avisa.
    // Si `avisar` reventara antes de apuntar, la siguiente vuelta volvería a
    // dar por nuevas las mismas y sonaría en bucle cada veinte segundos.
    conocidas.current = new Set(lista.map((n) => n.id));

    // Primera carga: solo se toma nota. Lo que ya estaba ahí no es nuevo.
    if (vistas === null) return;

    // Sin leer, además de desconocida: una que se marcó leída desde el
    // teléfono no tiene por qué sonar otra vez en el escritorio.
    avisar(lista.filter((n) => !vistas.has(n.id) && !n.read_at));
  }, [avisar]);

  useEffect(() => {
    // `userId` entra aquí a propósito. La consulta NO filtra por usuario —de
    // eso se encarga RLS, que es la única capa de autorización de esta app—,
    // pero el registro de «ya vistas» sí es de una persona concreta: si se
    // cierra sesión y entra otra en el mismo navegador, sus notificaciones
    // llegarían con ids desconocidos y sonarían todas de golpe. Reiniciarlo
    // hace que la primera carga del nuevo vuelva a ser solo una toma de nota.
    conocidas.current = null;
    cargar();
    const id = setInterval(cargar, REFRESH_MS);
    return () => clearInterval(id);
  }, [cargar, userId]);

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
