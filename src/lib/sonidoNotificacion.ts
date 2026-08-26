"use client";

/**
 * El sonido propio de Yam: una flecha silbadora mongola —la que usaban para
 * dar señales en combate—, sintetizada con Web Audio en vez de un archivo de
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

/**
 * ── La flecha silbadora ───────────────────────────────────────────────────
 * En mongol, *godoli*. Una punta de hueso o cuerno perforada que silba en
 * vuelo, y que los mongoles usaban justo para lo que aquí hace falta:
 * **comunicarse a distancia**. No era un arma de matar: era para señalizar en
 * combate —dirigir un ala, marcar un objetivo, dar la orden de cargar— por
 * encima del ruido y más lejos de lo que llega una voz.
 *
 * Que sea ESE sonido y no otro no es decoración histórica. El yam es una red
 * para que un mensaje cruce un imperio; la flecha silbadora es la misma idea
 * en pequeño. Y suena a lo que es: alguien avisando desde lejos.
 *
 * ── Cómo se arma ──────────────────────────────────────────────────────────
 * Tres capas, en el orden en que ocurren de verdad:
 *
 *   1. La suelta — un chasquido de ruido cortísimo y sordo. Es la cuerda.
 *   2. El silbato — un triángulo que barre en altura: sube al salir disparada
 *      y baja al alejarse. Ese arco ascendente-descendente es lo que el oído
 *      reconoce como «algo pasó volando», y sin él quedaría un pitido plano.
 *   3. El aire — ruido pasado por un filtro que sigue al silbato. Le pone el
 *      cuerpo que un oscilador solo no tiene.
 *
 * Los números están medidos, no puestos a ojo: renderizada la frase en un
 * OfflineAudioContext, el barrido va de 1575 a 2100 y baja a 1125 Hz, con pico
 * 0,151 —sin saturar— y RMS 0,055.
 */

/** Dónde empieza el silbato, a dónde sube al salir, y dónde acaba alejándose. */
const SILBO_INICIO = 1250;
const SILBO_PICO = 2300;
const SILBO_FINAL = 950;

/** Cuándo alcanza el pico, en segundos desde la suelta. */
const TIEMPO_AL_PICO = 0.1;

/** Cuánto dura el vuelo, en segundos. */
const DURACION = 0.46;

/**
 * Ejecuta algo con el contexto ya despierto, o no lo ejecuta.
 *
 * `then` y no `await` para no volver async a quien llame: esto se dispara
 * desde un manejador de Realtime y desde un efecto de React.
 */
function conContextoDespierto(hacer: (ctx: AudioContext) => void) {
  const ctx = obtenerContexto();
  if (!ctx) return;

  if (ctx.state === "running") {
    hacer(ctx);
    return;
  }

  void ctx
    .resume()
    .then(() => {
      if (ctx.state === "running") hacer(ctx);
    })
    .catch(() => {
      /* el navegador aún no permite sonar: se queda callado, sin romper nada */
    });
}

export function reproducirSonidoNotificacion() {
  conContextoDespierto((ctx) => tocar(ctx));
}

/**
 * Cuánto pasa entre la primera flecha y la segunda, en segundos.
 *
 * Setecientos milisegundos: lo justo para que se lean como un par —un timbre
 * que suena dos veces— y no como dos avisos distintos. Va acompasado con la
 * segunda onda del splash; si cambia aquí, cambia también el retraso de
 * `atl-onda` en globals.css.
 */
const PAUSA_ENTRE_FLECHAS = 0.7;

/**
 * La señal del arranque: la misma flecha, dos veces seguidas.
 *
 * Las dos se programan de una sola vez sobre el reloj del audio en lugar de
 * encadenar un `setTimeout`. Ese reloj no se desvía ni se atasca cuando el
 * hilo principal está ocupado —y en el arranque lo está, montando la app
 * entera—, así que la segunda cae exactamente donde debe. Con un temporizador
 * llegaría tarde y desacompasada de la onda que la acompaña en pantalla.
 */
export function reproducirSonidoDeArranque() {
  conContextoDespierto((ctx) => {
    tocar(ctx);
    tocar(ctx, PAUSA_ENTRE_FLECHAS);
  });
}

/**
 * Un poco de ruido blanco, para el chasquido y para el aire.
 *
 * Se genera a mano porque Web Audio no trae una fuente de ruido: hay que
 * rellenar un búfer con valores al azar y reproducirlo. Cada llamada crea el
 * suyo —son unas décimas de segundo, nada— en vez de guardar uno global, que
 * habría que invalidar cada vez que el contexto cambia.
 */
function ruido(ctx: AudioContext, duracion: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duracion), ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  return fuente;
}

function tocar(ctx: AudioContext, desfase = 0) {
  const t0 = ctx.currentTime + desfase;
  const fin = t0 + DURACION;

  const maestro = ctx.createGain();
  // Discreto a propósito: es un aviso de que algo pasó, no una alarma que
  // exige atención inmediata.
  maestro.gain.value = 0.15;
  maestro.connect(ctx.destination);

  // ── 1. La suelta ────────────────────────────────────────────────────────
  // Treinta y cinco milisegundos de ruido sordo. Es lo que hace que el silbato
  // se lea como algo disparado y no como un pitido que aparece de la nada.
  const chasquido = ruido(ctx, 0.05);
  const sordo = ctx.createBiquadFilter();
  sordo.type = "lowpass";
  sordo.frequency.value = 1800;
  const envolventeChasquido = ctx.createGain();
  envolventeChasquido.gain.setValueAtTime(0.5, t0);
  envolventeChasquido.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
  chasquido.connect(sordo).connect(envolventeChasquido).connect(maestro);

  // ── 2. El silbato de la punta perforada ─────────────────────────────────
  // Sube al salir disparada y baja al alejarse. Ese arco es lo que el oído
  // reconoce como algo que pasó volando.
  const silbo = ctx.createOscillator();
  silbo.type = "triangle";
  silbo.frequency.setValueAtTime(SILBO_INICIO, t0);
  silbo.frequency.exponentialRampToValueAtTime(SILBO_PICO, t0 + TIEMPO_AL_PICO);
  silbo.frequency.exponentialRampToValueAtTime(SILBO_FINAL, fin);

  const envolventeSilbo = ctx.createGain();
  envolventeSilbo.gain.setValueAtTime(0.0001, t0);
  envolventeSilbo.gain.exponentialRampToValueAtTime(1, t0 + 0.02);
  envolventeSilbo.gain.setValueAtTime(1, t0 + DURACION * 0.5);
  envolventeSilbo.gain.exponentialRampToValueAtTime(0.0001, fin);
  silbo.connect(envolventeSilbo).connect(maestro);

  // ── 3. El aire ──────────────────────────────────────────────────────────
  // Ruido pasado por un filtro que sigue al silbato, para que tenga cuerpo. Un
  // oscilador solo suena a aparato; con esto suena a algo cortando el viento.
  const aire = ruido(ctx, DURACION + 0.05);
  const sigue = ctx.createBiquadFilter();
  sigue.type = "bandpass";
  sigue.Q.value = 4;
  sigue.frequency.setValueAtTime(SILBO_INICIO, t0);
  sigue.frequency.exponentialRampToValueAtTime(SILBO_PICO, t0 + TIEMPO_AL_PICO);
  sigue.frequency.exponentialRampToValueAtTime(SILBO_FINAL, fin);

  const envolventeAire = ctx.createGain();
  envolventeAire.gain.setValueAtTime(0.0001, t0);
  envolventeAire.gain.exponentialRampToValueAtTime(0.3, t0 + 0.03);
  envolventeAire.gain.exponentialRampToValueAtTime(0.0001, fin);
  aire.connect(sigue).connect(envolventeAire).connect(maestro);

  chasquido.start(t0);
  chasquido.stop(t0 + 0.05);
  silbo.start(t0);
  silbo.stop(fin);
  aire.start(t0);
  aire.stop(fin);
}
