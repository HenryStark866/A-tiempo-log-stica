"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Moon, Palette, Sun } from "lucide-react";

/**
 * El interruptor de tema. Ahora son tres y va en ciclo: claro → oscuro →
 * multicolor → claro.
 *
 * Un ciclo y no un desplegable porque el botón vive en la barra superior, donde
 * compiten por sitio el logo, el reloj y la campana: en un teléfono de 320 px no
 * cabe un menú. Con tres opciones el ciclo todavía es cómodo —dos toques como
 * mucho para llegar a cualquiera—; a la cuarta habría que cambiar de patrón.
 *
 * El título dice a dónde LLEVA el botón, no dónde estás. Es lo que la persona
 * necesita saber antes de tocarlo.
 */

const CICLO = ["light", "dark", "tema-multicolor"] as const;
type Tema = (typeof CICLO)[number];

const SIGUIENTE: Record<Tema, { etiqueta: string }> = {
  light: { etiqueta: "Cambiar a modo oscuro" },
  dark: { etiqueta: "Cambiar a modo multicolor" },
  "tema-multicolor": { etiqueta: "Cambiar a modo claro" },
};

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hasta que el componente monta no se sabe qué tema hay: pintar un icono
  // ahora significaría cambiarlo un instante después, delante de la persona.
  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  const actual: Tema = (CICLO as readonly string[]).includes(theme ?? "")
    ? (theme as Tema)
    : "dark";
  const siguiente = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length];

  return (
    <button
      onClick={() => setTheme(siguiente)}
      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-900/[0.06] dark:border-white/[0.08] transition-all hover:scale-105 active:scale-95"
      aria-label={SIGUIENTE[actual].etiqueta}
      title={SIGUIENTE[actual].etiqueta}
    >
      {actual === "light" ? (
        <Sun className="w-4 h-4 text-amber-500" />
      ) : actual === "dark" ? (
        <Moon className="w-4 h-4 text-slate-300" />
      ) : (
        <Palette className="w-4 h-4 text-[#ff812c]" />
      )}
    </button>
  );
}
