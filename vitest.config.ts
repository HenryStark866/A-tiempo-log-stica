import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

/**
 * Vitest y no Jest: entiende TypeScript sin transpilador aparte y sin
 * configuración de Babel. Una sola dependencia nueva en un proyecto que hasta
 * hoy no tenía ninguna de test.
 *
 * `environment: "node"` porque lo que se prueba aquí es lógica pura de
 * `src/lib/` y RPC contra la base. Nada toca el DOM. El día que haya tests de
 * componentes React harán falta jsdom y @testing-library, y conviene que sea
 * una decisión aparte y no algo que ya venía puesto.
 */
export default defineConfig({
  resolve: {
    // El mismo alias que tsconfig.json, para que los tests importen igual que
    // el resto de la app y no con rutas relativas que se rompen al mover.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Los tests contra la base se saltan solos si no hay staging configurado
    // (ver tests/db/harness.ts), pero cuando sí lo hay tocan filas de verdad:
    // un poco más de margen que el 5 s por omisión.
    testTimeout: 20_000,
    // La operación vive en Medellín y varias funciones de tiempo dependen de
    // la zona. Fijarla aquí evita que un test pase en el portátil de alguien y
    // falle en CI —o al revés— por el reloj del sistema. Los tests que de
    // verdad importan usan además una fecha de referencia explícita.
    env: { TZ: "America/Bogota" },
  },
});
