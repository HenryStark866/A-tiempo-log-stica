"use client";

/**
 * El sonido propio de Yam: un khöömei corto —el canto difónico mongol—, con
 * la misma melodía Sol-Do-Mi de siempre pero cantada como armónicos de un
 * bordón grave en vez de golpeada como campanas. Sintetizado con Web Audio en
 * vez de un archivo de audio. Dos razones, la misma lógica que ya sigue el fondo animado y el mapa
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
 * ── El khöömei ────────────────────────────────────────────────────────────
 * El canto difónico mongol: una garganta sostiene una nota grave y, apretando
 * el tracto vocal, hace destacar UN armónico de esa nota hasta que silba por
 * encima como una flauta. No suena a nada más en el mundo, y por eso se
 * reconoce a la primera — que es justo lo que se le pide al sonido de una
 * marca.
 *
 * Aquí se sintetiza igual que ocurre de verdad, y no imitando el resultado:
 *
 *   · Un bordón de sierra grave hace de cuerdas vocales. La sierra se elige
 *     porque trae TODOS los armónicos; de una senoidal no se puede destacar
 *     ninguno, porque no los tiene.
 *   · Un pasa banda con Q muy alto hace de tracto vocal: deja pasar una
 *     franja estrechísima y apaga el resto. Mover su frecuencia por la serie
 *     armónica es, literalmente, lo que hace un cantante con la boca.
 *
 * ── Por qué estas tres notas y no otras ───────────────────────────────────
 * El aviso de siempre eran Sol5-Do6-Mi6. La serie armónica de un Do3 contiene
 * esas tres exactas en los armónicos 6, 8 y 10 (784.9, 1046.5 y 1308.1 Hz).
 * Así que no es un sonido nuevo pegado encima del anterior: es la MISMA
 * melodía, cantada en vez de golpeada.
 */
const FUNDAMENTAL = 130.81; // Do3, el bordón

/** Los armónicos que se destacan: Sol5, Do6, Mi6 sobre ese Do3. */
const ARMONICOS = [6, 8, 10];

/** Cuánto dura una frase cantada, en segundos. */
const DURACION = 0.62;

/**
 * Qué parte de la frase ocupa el recorrido de la melodía.
 *
 * No el total, y esto se midió: con la melodía repartida por toda la frase, la
 * última nota empezaba justo cuando arrancaba la caída de la envolvente y se
 * apagaba al nacer —quedaba a un cuarto de las otras dos y la frase parecía
 * cortarse—. Terminando el recorrido antes, la última nota tiene tiempo de
 * sonar y la cola de la envolvente es su resonancia, no su entierro.
 */
const MELODIA = 0.8;

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
 * Cuánto pasa entre el primer cascabel y el segundo, en segundos.
 *
 * Setecientos milisegundos: lo justo para que se lean como un par —un timbre
 * que suena dos veces— y no como dos avisos distintos. Va acompasado con la
 * segunda onda del splash; si cambia aquí, cambia también el retraso de
 * `atl-onda` en globals.css.
 */
const PAUSA_ENTRE_CASCABELES = 0.7;

/**
 * El cascabel del arranque: el mismo sonido, dos veces seguidas.
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
    tocar(ctx, PAUSA_ENTRE_CASCABELES);
  });
}

function tocar(ctx: AudioContext, desfase = 0) {
  const t0 = ctx.currentTime + desfase;
  const fin = t0 + DURACION;

  const maestro = ctx.createGain();
  // Discreto a propósito: es un aviso de que algo pasó, no una alarma que
  // exige atención inmediata.
  maestro.gain.value = 0.12;
  maestro.connect(ctx.destination);

  // ── La garganta ─────────────────────────────────────────────────────────
  const bordon = ctx.createOscillator();
  bordon.type = "sawtooth";
  bordon.frequency.value = FUNDAMENTAL;

  // Un vibrato lento y muy leve. Sin él el bordón suena a sintetizador; con
  // él, a alguien respirando detrás.
  const vibrato = ctx.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.value = 5.2;
  const anchoVibrato = ctx.createGain();
  anchoVibrato.gain.value = 6; // en cents, casi imperceptible
  vibrato.connect(anchoVibrato).connect(bordon.detune);

  // ── El tracto vocal: el pasa banda que silba ────────────────────────────
  const tracto = ctx.createBiquadFilter();
  tracto.type = "bandpass";
  // Q alto = franja estrechísima = se oye UN armónico y no un acorde.
  //
  // El 38 no es de oído: se renderizó la frase en un OfflineAudioContext y se
  // midió la energía en cada armónico. Con el 26 de la primera versión el
  // fundamental tenía VEINTE veces más energía que el armónico silbado —o sea
  // que se oía un zumbido grave y ninguna voz—. Cerrando el filtro y
  // recolocando la mezcla, el silbido pasa a mandar por 3,5 a 1.
  tracto.Q.value = 38;

  const paso = (DURACION * MELODIA) / ARMONICOS.length;
  ARMONICOS.forEach((n, i) => {
    const f = FUNDAMENTAL * n;
    const cuando = t0 + i * paso;
    if (i === 0) {
      tracto.frequency.setValueAtTime(f, cuando);
    } else {
      // Deslizado y no a saltos: una garganta no teletransporta la boca de un
      // armónico al siguiente, lo recorre. Es lo que da el «uiii» que hace
      // reconocible al khöömei.
      tracto.frequency.exponentialRampToValueAtTime(f, cuando + 0.06);
    }
  });

  // El silbido va MUY por encima del uno, y no es un error: una sierra reparte
  // amplitud como 1/n, así que el armónico 6 llega seis veces más flojo que el
  // fundamental y el 10, diez veces. Sin esta ganancia el pasa banda entrega
  // un hilo inaudible.
  //
  // Y sube un poco a lo largo del recorrido por lo mismo: la melodía va del
  // armónico 6 al 10, o sea a notas cada vez más débiles de origen. Con estos
  // números las tres salen prácticamente igual de fuertes (medido: 0,0044,
  // 0,0046 y 0,0052).
  const silbido = ctx.createGain();
  silbido.gain.setValueAtTime(12, t0);
  silbido.gain.linearRampToValueAtTime(16, t0 + DURACION * MELODIA);

  // ── El cuerpo ───────────────────────────────────────────────────────────
  // Algo del bordón sin filtrar, grave y sordo, para que debajo del silbido se
  // oiga la voz que lo sostiene. Solo el silbido sonaría a pitido de aparato.
  const cuerpo = ctx.createBiquadFilter();
  cuerpo.type = "lowpass";
  cuerpo.frequency.value = 320;
  const nivelCuerpo = ctx.createGain();
  nivelCuerpo.gain.value = 0.08;

  // ── La envolvente ───────────────────────────────────────────────────────
  // Entrada de 40 ms: una voz no ataca como una campana, sube. Y una cola
  // larga, que es lo que hace que se perciba como canto y no como aviso.
  const envolvente = ctx.createGain();
  envolvente.gain.setValueAtTime(0.0001, t0);
  envolvente.gain.exponentialRampToValueAtTime(1, t0 + 0.04);
  envolvente.gain.setValueAtTime(1, fin - 0.18);
  envolvente.gain.exponentialRampToValueAtTime(0.0001, fin);

  bordon.connect(tracto).connect(silbido).connect(envolvente);
  bordon.connect(cuerpo).connect(nivelCuerpo).connect(envolvente);
  envolvente.connect(maestro);

  bordon.start(t0);
  bordon.stop(fin + 0.02);
  vibrato.start(t0);
  vibrato.stop(fin + 0.02);
}
