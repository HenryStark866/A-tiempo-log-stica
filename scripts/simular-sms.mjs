#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULADOR DE SMS — conversar con el motor de canales sin mandar un SMS
 *
 * Hace de teléfono de teclas: lo que escribes entra al motor
 * (src/lib/canales/motor.ts) como si hubiera llegado por /api/sms/entrante, y
 * se imprime lo que el motor contestaría.
 *
 *   node scripts/simular-sms.mjs                 datos de ejemplo en memoria
 *   node scripts/simular-sms.mjs --tel 3005550002
 *   node scripts/simular-sms.mjs --base          contra la base LOCAL (0150 aplicada)
 *
 * Dentro: `/tel 3001234567` cambia de teléfono, `/salir` termina. También
 * lee de una tubería, para guiones: `printf "menu\n1\n" | node scripts/...`.
 *
 * Con --base usa SUPABASE_TEST_URL y SUPABASE_TEST_SERVICE_KEY (de .env.local
 * o del entorno), las mismas de tests/db, y se niega a correr contra los
 * proyectos de producción. Las respuestas quedan en at_message_outbox de la
 * base local, donde ningún celular las recoge: no sale ningún SMS real.
 *
 * Node 24 carga los .ts directamente; por eso el motor y las fuentes no
 * importan nada que no sea un tipo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";

// Sin "type": "module" en package.json, Node avisa al cargar cada .ts. Es
// ruido para quien simula: se calla ese aviso y nada más. Por eso los .ts se
// importan después, dinámicamente.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(`${w.name}: ${w.message}`);
});
const { procesar } = await import("../src/lib/canales/motor.ts");
const { datosDeEjemplo, fuenteMemoria, normalizarTelefono } = await import("../src/lib/canales/fuente-memoria.ts");

const args = process.argv.slice(2);
const usarBase = args.includes("--base");
const iTel = args.indexOf("--tel");
let telefono = iTel >= 0 ? args[iTel + 1] : "+573005550001";

/** Los mismos refs que vigila tests/db/harness.ts. */
const PROHIBIDOS = ["uhbtivaepyhwfdvtpfjq", "kjfwlofcqtptedwfpddh", "pdxlmjlooeqlvvgbosbu"];

async function armarFuente() {
  if (!usarBase) {
    const m = fuenteMemoria(datosDeEjemplo());
    const despues = async (r) => {
      if (r.ruta === "alta") console.log("  (esto lo contesta el alta por SMS de la 0145; en memoria no se simula: usa --base)");
    };
    return { fuente: m.fuente, despues };
  }
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.SUPABASE_TEST_URL;
  const llave = process.env.SUPABASE_TEST_SERVICE_KEY;
  if (!url || !llave) {
    console.error("Faltan SUPABASE_TEST_URL y SUPABASE_TEST_SERVICE_KEY (ver tests/db/README.md).");
    process.exit(1);
  }
  if (PROHIBIDOS.some((ref) => url.includes(ref)) || !/127\.0\.0\.1|localhost/.test(url)) {
    console.error(`El simulador solo corre contra la base local, no contra ${url}.`);
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const { fuenteSupabase } = await import("../src/lib/canales/fuente-supabase.ts");
  const db = createClient(url, llave, { auth: { persistSession: false } });
  // Lo que encola el alta de la 0145 no vuelve por `procesar`: se lee del buzón.
  let desde = new Date().toISOString();
  const despues = async (r) => {
    if (r.ruta !== "alta") return;
    const { data } = await db
      .from("at_message_outbox")
      .select("to_phone, body, created_at")
      .gt("created_at", desde)
      .order("created_at");
    for (const m of data ?? []) mostrar({ para: m.to_phone, texto: m.body });
    if (data?.length) desde = data.at(-1).created_at;
  };
  return { fuente: fuenteSupabase(db), despues };
}

function mostrar(m) {
  const yo = normalizarTelefono(telefono);
  const quien = m.para === yo ? "YAM" : `YAM -> ${m.para}`;
  console.log(`  ${quien} (${m.texto.length}): ${m.texto}`);
}

const { fuente, despues } = await armarFuente();
const interactivo = process.stdin.isTTY;
let n = 0;

console.log(`Simulador de SMS (${usarBase ? "base local" : "memoria"}). Escribiendo desde ${telefono}.`);
if (interactivo) console.log("Comandos: /tel <numero>, /salir. Prueba: MENU, MIS GUIAS, CATALOGO PANADERIA.");

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: interactivo });
const preguntar = () => interactivo && rl.prompt();
rl.setPrompt(`${telefono}> `);
preguntar();

for await (const linea of rl) {
  const texto = linea.trim();
  if (texto === "/salir") break;
  if (texto.startsWith("/tel ")) {
    telefono = texto.slice(5).trim();
    rl.setPrompt(`${telefono}> `);
    console.log(`  (ahora escribe ${telefono})`);
    preguntar();
    continue;
  }
  if (!interactivo) console.log(`${telefono}> ${texto}`);
  try {
    const r = await procesar(fuente, { canal: "sms", telefono, texto, proveedorId: `sim-${Date.now()}-${++n}` });
    if (r.mensajes.length === 0 && r.ruta !== "alta") console.log(`  (sin respuesta: ${r.ruta}${r.intencion ? `, ${r.intencion}` : ""})`);
    r.mensajes.forEach(mostrar);
    await despues(r);
  } catch (e) {
    console.log(`  (error: ${e.message})`);
  }
  preguntar();
}
rl.close();
