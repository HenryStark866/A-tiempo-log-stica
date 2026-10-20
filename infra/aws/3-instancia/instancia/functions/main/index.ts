// Enrutador del edge-runtime autoalojado. En Supabase Cloud esto lo hacía la
// plataforma: /functions/v1/<nombre> levantaba la función <nombre>. Aquí cada
// petición crea un "user worker" con el código de supabase/functions/<nombre>.
//
// Solo se atienden las funciones de esta lista. Sin ella, cualquier carpeta del
// volumen —incluida esta misma— se podría invocar desde fuera.
//
// No se verifica el JWT aquí: cada función decide. enviar-mensajes y el reloj
// de shopify-sync se autentican con la cabecera x-at-cron contra el vault
// (migración 0103), y shopify-sync invocado por un comercio valida su sesión
// con auth.getUser(). Es lo mismo que tenían en la nube (verify_jwt = false).

const FUNCIONES = new Set(["enviar-mensajes", "shopify-sync"]);

Deno.serve(async (req: Request) => {
  const nombre = new URL(req.url).pathname.split("/")[1] ?? "";
  if (!FUNCIONES.has(nombre)) {
    return Response.json({ error: "función desconocida" }, { status: 404 });
  }

  try {
    // @ts-ignore EdgeRuntime lo inyecta el propio runtime.
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${nombre}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`[${nombre}]`, e);
    return Response.json({ error: "la función no pudo arrancar" }, { status: 500 });
  }
});
