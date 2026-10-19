// Prueba de humo contra la pila local (Caddy en :8080). Usa el MISMO cliente que
// la app (@supabase/supabase-js del repo).
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const BASE = "http://localhost:8080";
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const res = [];
const ok = (n, d = "") => { res.push(["OK  ", n, d]); };
const mal = (n, d = "") => { res.push(["FALLA", n, String(d).slice(0, 300)]); };
async function paso(nombre, fn) { try { const d = await fn(); ok(nombre, d ?? ""); } catch (e) { mal(nombre, e?.message ?? e); } }

const anon = createClient(BASE, ANON, { auth: { persistSession: false } });
const admin = createClient(BASE, SERVICE, { auth: { persistSession: false } });
const email = `humo-${Date.now()}@example.com`;
const clave = "Humo-" + Math.random().toString(36).slice(2) + "A1!";
let userId = null;
let sesion = null;

await paso("auth: /health", async () => {
  const r = await fetch(`${BASE}/auth/v1/health`, { headers: { apikey: ANON } });
  if (r.status !== 200) throw new Error("status " + r.status);
  return "200";
});

await paso("auth: registro", async () => {
  const { data, error } = await anon.auth.signUp({ email, password: clave });
  if (error) throw error;
  userId = data.user?.id;
  if (!userId) throw new Error("sin user id");
  return `usuario ${userId.slice(0, 8)}, sesión inmediata: ${Boolean(data.session)}`;
});

await paso("auth: login con contraseña", async () => {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: clave });
  if (error) throw error;
  sesion = data.session;
  return "token emitido";
});

const usuario = createClient(BASE, ANON, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${sesion?.access_token ?? ""}` } },
});

await paso("rest: el trigger creó el perfil y RLS deja ver el propio", async () => {
  const { data, error } = await usuario.from("at_profiles").select("id, role").eq("id", userId);
  if (error) throw error;
  if (data.length !== 1) throw new Error("filas: " + data.length);
  return `rol=${data[0].role}`;
});

await paso("rest: RPC (at_ciclo_cobro)", async () => {
  const { data, error } = await usuario.rpc("at_ciclo_cobro");
  if (error) throw error;
  return String(data);
});

await paso("rest: anónimo NO ve perfiles ajenos", async () => {
  // Cliente nuevo: `anon` ya inició sesión arriba y vería su propio perfil.
  const limpio = createClient(BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await limpio.from("at_profiles").select("id").limit(5);
  if (error) throw error;
  if (data.length !== 0) throw new Error("el anónimo vio " + data.length + " perfiles");
  return "0 filas";
});

await paso("storage: subir, leer público y borrar", async () => {
  // El bucket de logos solo admite imágenes: un PNG de 1x1 píxel.
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  const cuerpo = new Blob([png], { type: "image/png" });
  const nombre = `humo-${Date.now()}.png`;
  const up = await admin.storage.from("at-brand-logos").upload(nombre, cuerpo, { contentType: "image/png" });
  if (up.error) throw up.error;
  const pub = admin.storage.from("at-brand-logos").getPublicUrl(nombre).data.publicUrl;
  const r = await fetch(pub);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const del = await admin.storage.from("at-brand-logos").remove([nombre]);
  if (del.error) throw del.error;
  if (r.status !== 200 || bytes.length !== png.length) throw new Error(`lectura pública: ${r.status}, ${bytes.length} bytes`);
  return `subió, se leyó (200, ${bytes.length} bytes) y se borró`;
});

await paso("realtime: conexión y ida y vuelta de broadcast", async () => {
  const canal = anon.channel("humo", { config: { broadcast: { self: true } } });
  const recibido = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("sin mensaje en 15 s")), 15000);
    canal.on("broadcast", { event: "ping" }, (m) => { clearTimeout(t); res(m); });
  });
  const suscrito = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("no llegó a SUBSCRIBED en 15 s")), 15000);
    canal.subscribe((estado, err) => {
      if (estado === "SUBSCRIBED") { clearTimeout(t); res(); }
      if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") { clearTimeout(t); rej(err ?? new Error(estado)); }
    });
  });
  await suscrito;
  await canal.send({ type: "broadcast", event: "ping", payload: { n: 1 } });
  await recibido;
  await anon.removeChannel(canal);
  return "SUBSCRIBED y broadcast recibido";
});

if (userId) await admin.auth.admin.deleteUser(userId);

for (const [e, n, d] of res) console.log(`${e}  ${n}${d ? "  →  " + d : ""}`);
const fallas = res.filter((r) => r[0] === "FALLA").length;
console.log(`\n${res.length - fallas}/${res.length} pasos bien`);
process.exit(fallas ? 1 : 0);
