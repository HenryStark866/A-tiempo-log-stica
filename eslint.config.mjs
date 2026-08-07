import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Configuración de ESLint (formato plano, que es el que pide ESLint 9).
 *
 * `next lint` quedó obsoleto en Next 15 y desaparece en 16; esto es su
 * reemplazo. Antes el proyecto no tenía ninguna configuración: correr el lint
 * abría un asistente interactivo y por eso en la práctica nunca se corría.
 */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts", // lo genera Next en cada build, no es código nuestro
      "public/sw.js",
      "supabase/functions/**", // Deno, con su propio runtime y sus imports por URL
      "scratch/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
