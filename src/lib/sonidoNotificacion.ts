"use client";

/**
 * El sonido propio de Yam para las notificaciones: tres notas cortas y
 * ascendentes (Sol-Do-Mi), sintetizadas con Web Audio en vez de un archivo de
 * audio. Dos razones, la misma lógica que ya sigue el fondo animado y el mapa
 * dibujado a mano en vez de teselas: nada que descargar, nada que pese en el
 * paquete, y funciona exactamente igual sin conexión.
 *
 * Los navegadores no dejan sonar nada hasta que hay una interacción real de la
 * persona con la página. `AppShell` llama a `desbloquearSonido()` cuando la
 * hay. Si el sonido se pide antes de eso (una notificación puede llegar por
 * Realtime en cualquier momento), se queda callado en vez de fallar: mejor un
 * aviso silencioso que un error en la consola de alguien que solo abrió la app.
 *
 * ── Por qué se reintenta reanudar en cada aviso ────────────────────────────
 * Un AudioContext no se queda despierto: el navegador lo suspende cuando la
 * pestaña lleva un rato oculta, y al volver sigue suspendido hasta que alguien
 * lo reanude. Antes esto se hacía UNA vez, en el primer toque de la sesión, con
 * un `once: true`. Bastaba con cambiar de pestaña y volver para que el sonido
 * se apagara para el resto del día: `state` ya no era "running", la función se
 * salía por la primera línea y no había nadie escuchando para despertarla.
 *
 * Ahora se intenta reanudar en el momento de sonar. Tras el primer gesto de la
 * persona el navegador ya no lo impide, así que reanudar fuera de un toque
 * funciona — y si lo impidiera, se queda callado, igual que antes.
 */

let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!contexto) contexto = new Ctor();
  return contexto;
}

export function desbloquearSonido() {
  const ctx = obtenerContexto();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

// Sol5, Do6, Mi6 — un arpegio corto que sube, no la tercera mayor gastada de
// cualquier chime genérico. 75 ms entre nota y nota: se oye como una frase,
// no como tres pitidos sueltos.
const NOTAS = [783.99, 1046.5, 1318.51];

export function reproducirSonidoNotificacion() {
  const ctx = obtenerContexto();
  if (!ctx) return;

  if (ctx.state === "running") {
    tocar(ctx);
    return;
  }

  // Suspendido: casi siempre porque la pestaña estuvo un rato de fondo. Se
  // despierta y suena. `then` y no `await` para no volver async una función a
  // la que se llama desde un manejador de Realtime.
  void ctx
    .resume()
    .then(() => {
      if (ctx.state === "running") tocar(ctx);
    })
    .catch(() => {
      /* el navegador aún no permite sonar: se queda callado, sin romper nada */
    });
}

function tocar(ctx: AudioContext) {
  const ahora = ctx.currentTime;
  const maestro = ctx.createGain();
  // Discreto a propósito: es un aviso de que algo pasó, no una alarma que
  // exige atención inmediata.
  maestro.gain.value = 0.18;
  maestro.connect(ctx.destination);

  NOTAS.forEach((frecuencia, i) => {
    const inicio = ahora + i * 0.075;
    const osc = ctx.createOscillator();
    // Triangular: más cálida que una senoidal pura, sin el zumbido de una
    // cuadrada o una diente de sierra.
    osc.type = "triangle";
    osc.frequency.value = frecuencia;

    const envolvente = ctx.createGain();
    envolvente.gain.setValueAtTime(0, inicio);
    envolvente.gain.linearRampToValueAtTime(1, inicio + 0.012);
    envolvente.gain.exponentialRampToValueAtTime(0.001, inicio + 0.16);

    osc.connect(envolvente);
    envolvente.connect(maestro);
    osc.start(inicio);
    osc.stop(inicio + 0.18);
  });
}
