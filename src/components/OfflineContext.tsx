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
import {
  encolar as encolarAccion,
  listar,
  descartar as descartarAccion,
  sincronizar,
  type TipoAccion,
  type AccionEnCola,
} from "@/lib/offline/queue";

/**
 * Sondeo de refuerzo. `online`/`offline` del navegador avisan de que cambió
 * la interfaz de red, no de que internet responda de verdad: un teléfono
 * puede seguir "en línea" para el sistema operativo con una señal que en la
 * práctica no llega a ningún lado. Cada tanto se intenta la cola igual,
 * aunque no haya saltado ningún evento.
 */
const REINTENTO_MS = 20000;

interface OfflineState {
  /** Lo que dice el navegador. Es un indicio, no una garantía de que haya señal real. */
  enLinea: boolean;
  pendientes: AccionEnCola[];
  sincronizando: boolean;
  encolar: (tipo: TipoAccion, payload: unknown) => Promise<void>;
  descartar: (id: string) => Promise<void>;
  reintentarAhora: () => Promise<void>;
}

const Ctx = createContext<OfflineState | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState<AccionEnCola[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  // Evita que dos disparos casi simultáneos (el evento `online` y el sondeo)
  // corran la cola dos veces a la vez.
  const enCurso = useRef(false);

  const refrescarLista = useCallback(async () => {
    try {
      setPendientes(await listar());
    } catch {
      /* IndexedDB no disponible: la app sigue, solo sin cola persistente */
    }
  }, []);

  const reintentarAhora = useCallback(async () => {
    if (enCurso.current || typeof navigator !== "undefined" && !navigator.onLine) return;
    enCurso.current = true;
    setSincronizando(true);
    try {
      await sincronizar();
    } catch {
      /* IndexedDB no disponible u otro fallo local: no hay nada que reintentar aquí */
    } finally {
      setSincronizando(false);
      enCurso.current = false;
      refrescarLista();
    }
  }, [refrescarLista]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    refrescarLista();

    const alConectar = () => {
      setEnLinea(true);
      reintentarAhora();
    };
    const alDesconectar = () => setEnLinea(false);

    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    const id = setInterval(reintentarAhora, REINTENTO_MS);

    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
      clearInterval(id);
    };
  }, [reintentarAhora, refrescarLista]);

  const encolar = useCallback(
    async (tipo: TipoAccion, payload: unknown) => {
      await encolarAccion(tipo, payload);
      await refrescarLista();
      // Si en realidad sí hay señal (el fallo fue puntual, no de conexión),
      // no hace falta esperar los 20 s del sondeo.
      if (navigator.onLine) reintentarAhora();
    },
    [refrescarLista, reintentarAhora]
  );

  const descartar = useCallback(
    async (id: string) => {
      await descartarAccion(id);
      await refrescarLista();
    },
    [refrescarLista]
  );

  const valor = useMemo(
    () => ({ enLinea, pendientes, sincronizando, encolar, descartar, reintentarAhora }),
    [enLinea, pendientes, sincronizando, encolar, descartar, reintentarAhora]
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Devuelve un estado neutro (todo en línea, cola vacía) si no hay provider en
 * vez de lanzar: igual que la campana, esto es un accesorio y no puede tumbar
 * una pantalla que no lo necesita.
 */
export function useOffline(): OfflineState {
  const ctx = useContext(Ctx);
  return (
    ctx ?? {
      enLinea: true,
      pendientes: [],
      sincronizando: false,
      encolar: async () => {},
      descartar: async () => {},
      reintentarAhora: async () => {},
    }
  );
}
