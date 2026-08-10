/**
 * Copia los archivos de Storage del proyecto viejo al nuevo.
 *
 * Hace falta un script aparte porque un volcado de la base NO trae los
 * archivos: en Postgres solo viven las FILAS de storage.objects —el nombre, el
 * tamaño, a qué bucket pertenecen—, mientras que el contenido está en el
 * almacenamiento de objetos, fuera de la base. Si se restaura la base sin
 * copiar los archivos, la app queda peor que vacía: cree que la cédula del
 * mensajero existe, muestra su nombre, y al abrirla no hay nada.
 *
 * Son 39 archivos: cédulas y licencias de mensajeros, comprobantes de pago de
 * los comercios, evidencias de entrega y los logos de las marcas.
 *
 * ── Cómo se ejecuta ──────────────────────────────────────────────────────
 *
 *   Las llaves NO van escritas aquí ni se le pasan a nadie por chat: son
 *   llaves de servicio, que se saltan RLS y pueden leerlo y borrarlo todo.
 *   Se ponen como variables de entorno en tu propia terminal, y desaparecen
 *   al cerrarla.
 *
 *   En PowerShell:
 *
 *     $env:VIEJO_URL   = "https://uhbtivaepyhwfdvtpfjq.supabase.co"
 *     $env:VIEJO_KEY   = "<service_role del proyecto VIEJO>"
 *     $env:NUEVO_URL   = "https://kjfwlofcqtptedwfpddh.supabase.co"
 *     $env:NUEVO_KEY   = "<service_role del proyecto NUEVO>"
 *     node scripts/copiar-almacenamiento.mjs
 *
 *   Las encuentras en cada proyecto: Project Settings → API Keys → service_role.
 *
 * Se puede correr las veces que haga falta: si un archivo ya está en el
 * destino, lo salta. Así un fallo a mitad de camino se arregla volviendo a
 * ejecutarlo, sin duplicar nada ni empezar de cero.
 */

import { createClient } from "@supabase/supabase-js";

const { VIEJO_URL, VIEJO_KEY, NUEVO_URL, NUEVO_KEY } = process.env;

if (!VIEJO_URL || !VIEJO_KEY || !NUEVO_URL || !NUEVO_KEY) {
  console.error(
    "Faltan variables. Necesito VIEJO_URL, VIEJO_KEY, NUEVO_URL y NUEVO_KEY.\n" +
      "Mira las instrucciones al principio de este archivo."
  );
  process.exit(1);
}

if (VIEJO_URL === NUEVO_URL) {
  console.error("VIEJO_URL y NUEVO_URL son el mismo proyecto. Revisa las variables.");
  process.exit(1);
}

const viejo = createClient(VIEJO_URL, VIEJO_KEY, { auth: { persistSession: false } });
const nuevo = createClient(NUEVO_URL, NUEVO_KEY, { auth: { persistSession: false } });

/** Recorre un bucket entero, incluidas las carpetas: el listado no es recursivo. */
async function listarTodo(cliente, bucket, prefijo = "") {
  const salida = [];
  let desde = 0;
  const DE_A = 100;

  for (;;) {
    const { data, error } = await cliente.storage
      .from(bucket)
      .list(prefijo, { limit: DE_A, offset: desde });
    if (error) throw new Error(`listando ${bucket}/${prefijo}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const ruta = prefijo ? `${prefijo}/${item.name}` : item.name;
      // Sin `id` es una carpeta, no un archivo.
      if (item.id === null) salida.push(...(await listarTodo(cliente, bucket, ruta)));
      else salida.push(ruta);
    }

    if (data.length < DE_A) break;
    desde += DE_A;
  }
  return salida;
}

async function main() {
  const { data: buckets, error } = await viejo.storage.listBuckets();
  if (error) throw new Error(`no pude listar los buckets del proyecto viejo: ${error.message}`);

  let copiados = 0;
  let saltados = 0;
  const fallidos = [];

  for (const b of buckets) {
    // El bucket tiene que existir en el destino, y con la MISMA visibilidad y
    // los mismos límites: si `at-brand-logos` naciera privado, los logos
    // dejarían de verse en la portada; si naciera sin límite de tipo, volvería
    // a aceptar un .svg con código dentro.
    const { error: errCrear } = await nuevo.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.file_size_limit,
      allowedMimeTypes: b.allowed_mime_types,
    });
    if (errCrear && !/already exists/i.test(errCrear.message)) {
      throw new Error(`creando el bucket ${b.id}: ${errCrear.message}`);
    }

    const rutas = await listarTodo(viejo, b.id);
    console.log(`\n${b.id} — ${rutas.length} archivo(s)`);

    for (const ruta of rutas) {
      const { data: yaEsta } = await nuevo.storage.from(b.id).list(
        ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : "",
        { search: ruta.slice(ruta.lastIndexOf("/") + 1), limit: 1 }
      );
      if (yaEsta && yaEsta.length > 0) {
        saltados++;
        continue;
      }

      const { data: archivo, error: errBajar } = await viejo.storage.from(b.id).download(ruta);
      if (errBajar) {
        fallidos.push(`${b.id}/${ruta} — al bajar: ${errBajar.message}`);
        continue;
      }

      const { error: errSubir } = await nuevo.storage
        .from(b.id)
        .upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
      if (errSubir) {
        fallidos.push(`${b.id}/${ruta} — al subir: ${errSubir.message}`);
        continue;
      }

      copiados++;
      console.log(`  ✓ ${ruta}`);
    }
  }

  console.log(`\n── Resumen ──`);
  console.log(`copiados: ${copiados}`);
  console.log(`ya estaban: ${saltados}`);
  console.log(`fallidos: ${fallidos.length}`);
  for (const f of fallidos) console.log(`  ✗ ${f}`);

  // Salir con error si algo falló: así, encadenado con otros comandos, no se
  // sigue adelante creyendo que la copia quedó completa.
  if (fallidos.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("\nSe detuvo:", e.message);
  process.exit(1);
});
