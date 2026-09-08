"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, PackageOpen, Loader2, MessageCircle, TriangleAlert, Warehouse, Clock, Package, UserCheck, Pencil, Ban, Hourglass, QrCode, ChevronDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { useMyClient } from "@/components/useMyClient";
import { useOffline } from "@/components/OfflineContext";
import { RecogidaQR, ImprimirQR } from "@/components/RecogidaQR";
import { FiltroActivo, Loading } from "@/components/ui";
import { PICKUP_STATUS_LABELS, ROLES_DEL_COMERCIO } from "@/lib/constants";
import { esFalloDeRed } from "@/lib/offline/queue";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { etiquetaDeHora, horaEnColombia, hoyEnColombia, turnosDelDia } from "@/lib/tiempo";
import type { Client, Pickup, PickupStatus, Guide, Profile } from "@/lib/types";

const MIN_PACKAGES = 5;

// Una solicitud se puede corregir o cancelar mientras el mensajero no haya
// arrancado. En cuanto pasa a "en curso" va alguien conduciendo hacia allá:
// cambiarle la dirección en ese momento es peor que no dejar editar. El
// servidor aplica el mismo criterio (at_pickup_editable), esto solo evita
// mostrar botones que van a fallar.
const EDITABLES: PickupStatus[] = ["pendiente", "asignada"];

/** Guía candidata a entrar o salir de una recogida (la sirve at_pickup_guides). */
type GuiaEditable = {
  id: string;
  guide_number: string;
  recipient_name: string | null;
  recipient_city: string | null;
  incluida: boolean;
};

function whatsappUrl(phone: string, businessName: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `57${digits}` : digits;
  const text = encodeURIComponent(`Hola, te escribimos de A Tiempo Logística sobre la recogida de ${businessName}.`);
  return `https://wa.me/${withCountry}?text=${text}`;
}

/**
 * El color de cada estado, en tono suave.
 *
 * Antes cada estado traía un relleno propio y distinto por tema: cinco rellenos
 * sólidos compitiendo en la misma columna hacían que la tabla se leyera como un
 * semáforo averiado, y el naranja de marca —que solo debería marcar «hay
 * alguien conduciendo hacia allá»— quedaba igual de fuerte que el resto.
 *
 * Ahora el color lo pone el TEXTO y el fondo apenas lo insinúa (10 %), con un
 * aro de un pelo que separa la etiqueta del cristal de la tarjeta. El estado se
 * sigue distinguiendo de un vistazo, pero deja de gritar.
 *
 * Un solo juego de clases para los tres temas: el `dark:` de este proyecto
 * cubre también `.tema-multicolor` (ver el `@custom-variant` de globals.css),
 * así que el contraste se define una vez y vale en claro, oscuro y multicolor.
 * En claro manda el tono 700 sobre el fondo tenue; en los dos oscuros, el 300.
 */
const TONO_ESTADO: Record<PickupStatus, string> = {
  pendiente: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300",
  asignada: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300",
  // El naranja de marca sigue siendo el único estado con color propio de la
  // casa. En claro se oscurece: #ff812c sobre fondo tenue no llega al contraste
  // mínimo para texto pequeño.
  en_curso: "bg-[#ff812c]/12 text-[#b45309] ring-[#ff812c]/25 dark:text-[#ffa869]",
  completada: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  cancelada: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
};

function PickupBadge({ status, title }: { status: PickupStatus; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        TONO_ESTADO[status] ?? TONO_ESTADO.pendiente
      )}
    >
      {PICKUP_STATUS_LABELS[status] || status}
    </span>
  );
}

/**
 * Etiqueta neutra: cuenta un dato de apoyo (guías, paquetes) sin pelearse con
 * el badge de estado que tiene al lado. Sin color propio a propósito — el único
 * color de la fila es el del estado.
 */
function Etiqueta({
  children,
  title,
  alerta = false,
}: {
  children: React.ReactNode;
  title?: string;
  alerta?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium",
        "atl-relleno ring-1 ring-inset ring-slate-900/[0.06] dark:ring-white/[0.08]",
        alerta
          ? "text-amber-700 dark:text-amber-300"
          : "text-slate-500 dark:text-slate-400"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Un nombre propio en una celda estrecha.
 *
 * Los nombres de comercio y de mensajero se van a tres y cuatro palabras
 * («Distribuidora La Esperanza S.A.S.», «Juan Carlos Restrepo Vélez») y
 * reventaban el ancho de la tabla en dos y tres renglones. A partir de la
 * tercera palabra se corta en una sola línea y el nombre completo queda en el
 * `title`: el navegador lo muestra al pasar el cursor sin que haya que montar
 * un tooltip propio. Con dos palabras o menos no se toca — no hace falta.
 */
function NombreCorto({
  nombre,
  className,
}: {
  nombre: string | null | undefined;
  className?: string;
}) {
  if (!nombre) return <span className={className}>—</span>;
  const largo = nombre.trim().split(/\s+/).length > 2;
  return (
    <span
      title={largo ? nombre : undefined}
      className={cn("block", largo && "truncate", className)}
    >
      {nombre}
    </span>
  );
}

/** Una entrada del menú «…» de una recogida. */
type AccionMenu = {
  key: string;
  label: string;
  icono: React.ReactNode;
  onClick: () => void;
  /** Rojo para lo que destruye (cancelar); neutro para el resto. */
  peligro?: boolean;
};

/**
 * Hasta dónde puede crecer un panel hacia abajo sin que lo recorten.
 *
 * Sube por los padres hasta encontrar el primero que no tenga `overflow:
 * visible` —aquí es el `overflow-x-auto` de la tabla, y por encima el
 * `overflow-hidden` de la tarjeta— y devuelve su borde inferior, o el de la
 * ventana si llega antes. Ojo con el detalle que se cuela siempre: declarar
 * `overflow-x: auto` hace que el eje Y pase de `visible` a `auto` por sí solo
 * (lo dice la especificación), así que ese contenedor recorta ARRIBA Y ABAJO
 * aunque en el marcado solo se pidiera scroll horizontal.
 */
function limiteInferior(el: HTMLElement): number {
  let n: HTMLElement | null = el.parentElement;
  while (n && n !== document.body) {
    const { overflowX, overflowY } = getComputedStyle(n);
    if (overflowX !== "visible" || overflowY !== "visible") {
      return Math.min(n.getBoundingClientRect().bottom, window.innerHeight);
    }
    n = n.parentElement;
  }
  return window.innerHeight;
}

/**
 * El menú «…» de la fila.
 *
 * La columna de acciones llevaba hasta cinco botones con texto —QR, Editar,
 * Cancelar, Reasignar y encima el aviso de «Espera al mensajero»— y era, con
 * diferencia, lo más ancho y ruidoso de la tabla: se comía el espacio que
 * necesitaban Dirección y Operario. Ahora quedan dos elementos fijos, iguales
 * en todas las filas: WhatsApp, que es lo único que el CEDI usa a diario, y
 * este desplegable con el resto.
 *
 * ── Por qué el panel se dibujaba desplazado ──────────────────────────────
 *
 * Estaba en `position: fixed` con coordenadas sacadas de
 * `getBoundingClientRect()`, que son relativas a la VENTANA. Y no llegaban a
 * medirse contra la ventana: la tarjeta que envuelve la tabla lleva
 * `.atl-superficie`, y esa clase aplica `backdrop-filter: blur(20px)`. Un
 * elemento con `backdrop-filter` (igual que con `filter`, `transform` o
 * `will-change`) se convierte en el bloque contenedor de sus descendientes
 * `fixed`: el panel ya no se colocaba contra la ventana sino contra la esquina
 * de la tarjeta, así que aparecía corrido justo lo que la tarjeta está separada
 * del borde de la pantalla. La misma trampa se llevaba por delante la capa de
 * cierre `fixed inset-0`, que solo cubría la tarjeta.
 *
 * La solución es la simple: `absolute` colgando de un contenedor `relative` que
 * es el propio botón. Ahí no hay coordenadas que calcular —el panel va pegado a
 * su disparador por definición— y el desfase no puede volver, porque ya no
 * depende de contra qué se esté midiendo.
 *
 * Lo único que sí hay que mirar es si cabe: el contenedor de la tabla recorta
 * por abajo (ver `limiteInferior`), así que en las últimas filas el panel se
 * abre hacia arriba. Es la única cuenta que queda, y se hace una vez al abrir.
 */
function MenuAcciones({ acciones }: { acciones: AccionMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const [haciaArriba, setHaciaArriba] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    // Un clic fuera lo baja. Va en el documento y no en una capa `fixed`
    // encima de todo: esa capa era otra víctima del `backdrop-filter` de la
    // tarjeta —se quedaba del tamaño de la tarjeta, no de la pantalla— y
    // además tapaba el hover de las filas mientras el menú estaba abierto.
    const fuera = (e: PointerEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera, true);
    window.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  if (acciones.length === 0) return null;

  function alternar() {
    if (!abierto && cajaRef.current) {
      // 44 px por entrada más el aire del panel: no hace falta medirlo de
      // verdad, solo saber si el sitio da o no da.
      const alto = acciones.length * 44 + 12;
      const abajo = cajaRef.current.getBoundingClientRect().bottom;
      setHaciaArriba(abajo + alto > limiteInferior(cajaRef.current) - 8);
    }
    setAbierto((v) => !v);
  }

  return (
    // El ancla del desplegable. `relative` aquí y nada más arriba: el panel se
    // cuelga del botón, no de la celda ni de la fila.
    <div ref={cajaRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más acciones"
        title="Más acciones"
        onClick={alternar}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
          "atl-relleno atl-relleno-hover text-slate-600 dark:text-slate-300",
          "ring-1 ring-inset ring-slate-900/[0.06] dark:ring-white/[0.08]",
          abierto && "ring-[#ff812c]/40 text-[#ff812c]"
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>

      {abierto && (
        <div
          role="menu"
          className={cn(
            // Alineado al borde derecho del botón y pegado debajo. El panel
            // crece hacia la izquierda, que es hacia dentro de la tabla: por
            // ese lado no hay nada que lo recorte.
            "absolute right-0 z-50 min-w-[200px] overflow-hidden rounded-2xl py-1.5 shadow-xl",
            "atl-superficie border border-slate-900/[0.08] dark:border-white/[0.10]",
            haciaArriba ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {acciones.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                a.onClick();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors",
                a.peligro
                  ? "text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                  : "text-slate-700 hover:bg-slate-900/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
              )}
            >
              {a.icono}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La franja en la que se recoge. Vive aquí arriba y no escrita a mano en cada
 * campo: son dos formularios —crear y editar— y con el valor repetido bastaba
 * con cambiar uno para que la app ofreciera dos horarios distintos.
 *
 * La base lo vuelve a exigir en at_request_pickup y at_update_pickup: lo que
 * ofrece la pantalla es una ayuda para quien elige, no una garantía. La RPC se
 * puede llamar sin pasar por aquí.
 */
const HORA_MIN = "08:00";
const HORA_MAX = "17:00";
/**
 * Cada cuánto se ofrece un turno. La operación no agenda al minuto: el mensajero
 * pasa dentro de una franja, así que ofrecer 08:07 era prometer una precisión
 * que el CEDI no puede cumplir.
 */
const PASO_MINUTOS = 15;

/**
 * Los turnos que ofrece el desplegable. Se calculan una sola vez al cargar el
 * módulo: la lista no depende de nada del render y no tiene por qué rehacerse
 * en cada tecla del formulario.
 */
const HORAS_RECOGIDA = turnosDelDia(HORA_MIN, HORA_MAX, PASO_MINUTOS);

/** El texto de ayuda bajo el campo, con las horas escritas como se hablan. */
const AYUDA_HORARIO = `Recogemos de ${etiquetaDeHora(HORA_MIN)} a ${etiquetaDeHora(HORA_MAX)}, en turnos de ${PASO_MINUTOS} minutos.`;

const MSG_JORNADA_CERRADA =
  "El horario de recogidas por hoy ha finalizado. Por favor, selecciona una fecha a partir de mañana.";
const MSG_HORA_PASADA =
  "La hora seleccionada ya pasó. Por favor, elige una hora futura o cambia la fecha.";

/**
 * ¿Este momento ya quedó atrás, en hora de Medellín?
 *
 * Es el único criterio de «ya pasó» de la pantalla: de él salen los turnos que
 * se ofrecen, el aviso de jornada cerrada, la limpieza de una hora que se
 * quedó vieja en el formulario y la comprobación al enviar. Con cuatro copias
 * de la misma cuenta bastaba con corregir tres para que la cuarta siguiera
 * dejando pasar lo que las otras bloquean.
 *
 * Compara cadenas y no `Date`: "2026-08-19" y "08:15" están rellenas con ceros
 * y ordenan igual que los números que representan, y así no hay que construir
 * un instante —ni acertar con su zona— para responder algo que es de calendario
 * de pared. Una hora vacía («sin preferencia») nunca ha pasado: es la fecha la
 * que manda.
 */
function yaPaso(fecha: string, hora: string, ahora: Date): boolean {
  if (!fecha) return false;
  const hoy = hoyEnColombia(ahora);
  if (fecha !== hoy) return fecha < hoy;
  return hora !== "" && hora <= horaEnColombia(ahora);
}

/**
 * Los turnos que todavía se pueden pedir para esa fecha. Para mañana en
 * adelante son todos; para hoy, los que aún no han pasado; después de las
 * 5 p. m. no queda ninguno y la pantalla lo dice con todas sus letras.
 */
function turnosDisponibles(fecha: string, ahora: Date): string[] {
  return HORAS_RECOGIDA.filter((hora) => !yaPaso(fecha, hora, ahora));
}

/**
 * La hora de recogida, como desplegable.
 *
 * Era un `input type="time"` con min/max/step, y el navegador respondía a media
 * escritura con su propia burbuja de validación ("El valor debe ser 08:00 o
 * posterior"): un regaño en el idioma del sistema operativo, encima del campo,
 * mientras el usuario todavía estaba tecleando. Con un `<select>` no hay nada
 * que validar —solo se puede elegir una hora que la operación sí atiende— y de
 * paso la interfaz dice la verdad: se agenda por turnos, no al minuto.
 *
 * La hora sigue siendo opcional (la RPC acepta null), así que la primera opción
 * es dejarla en blanco.
 *
 * No decide qué horas existen: recibe la lista ya filtrada por la fecha que
 * haya escogido el usuario. Cuando esa lista viene vacía la jornada terminó, y
 * entonces no se dibuja un desplegable sin nada dentro —que no explica nada—
 * sino el aviso de que hay que irse a mañana.
 */
function SelectHora({
  id,
  value,
  onChange,
  className,
  horas,
}: {
  id: string;
  value: string;
  onChange: (hora: string) => void;
  className: string;
  horas: string[];
}) {
  if (horas.length === 0) {
    return (
      <div
        role="status"
        className="flex min-h-[52px] items-start gap-2.5 rounded-2xl bg-amber-500/10 px-4 py-3 ring-1 ring-inset ring-amber-500/25"
      >
        <Clock className="mt-0.5 w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[14px] leading-snug text-amber-700 dark:text-amber-300">
          {MSG_JORNADA_CERRADA}
        </p>
      </div>
    );
  }

  // Una recogida ya guardada puede traer una hora que no cae en la rejilla
  // (07:40, 16:50, cualquier cosa creada antes de esto o por la RPC directa).
  // Si no se ofrece como opción, el <select> se dibuja vacío y al guardar le
  // borraríamos la hora al comercio sin que nadie lo pidiera. Solo se conserva
  // si sigue siendo futura: de eso responde quien pasa `value`, que es el mismo
  // que limpia el campo cuando deja de serlo.
  const fueraDeRejilla = value !== "" && !horas.includes(value);

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // `appearance-none` quita la flecha del sistema —que en Windows y en
        // móvil no se parecen entre sí— y `pr-11` deja el hueco para la nuestra.
        className={cn(className, "appearance-none cursor-pointer pr-11")}
      >
        <option value="">Sin preferencia</option>
        {fueraDeRejilla && (
          <option value={value}>{etiquetaDeHora(value)} · hora actual</option>
        )}
        {horas.map((hora) => (
          <option key={hora} value={hora}>
            {etiquetaDeHora(hora)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500"
      />
    </div>
  );
}

export default function PickupsPage() {
  // El filtro llega por la URL desde Mi panel, y `useSearchParams` pide su
  // frontera de Suspense para no romper el build.
  return (
    <Suspense fallback={<Loading label="Cargando recogidas…" />}>
      <Pickups />
    </Suspense>
  );
}

function Pickups() {
  const profile = useProfile();
  const esCliente = ROLES_DEL_COMERCIO.includes(profile.role);
  const params = useSearchParams();
  const router = useRouter();
  // La tarjeta del LTR abre aquí las recogidas ya completadas, que son las que
  // entran en el promedio de esa métrica.
  const estadoFiltro = params.get("estado") as PickupStatus | null;
  /**
   * El pedido desde el que se llegó, si se llegó desde uno.
   *
   * La pantalla del pedido enlaza aquí con `?pedido=<id>` para que el comercio
   * pueda pedir la recogida sin buscarse a sí mismo en una lista. Se abre la
   * hoja con ESE paquete marcado y ninguno más: quien viene de un pedido
   * concreto quiere ese, no los doce que tenga pendientes.
   *
   * Toda la validación de horarios, dirección y contacto es la de siempre, que
   * es el motivo de traerlo aquí en vez de meter un formulario de recogida
   * dentro de la pantalla del pedido: dos formularios se separan solos.
   */
  const pedidoDeLaUrl = params.get("pedido");
  // La recogida siempre la solicita un comercio: si es un cliente, se autoaprovisiona.
  const { client: miComercio, clientId, loading: cargandoComercio } = useMyClient();
  const offline = useOffline();

  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [couriers, setCouriers] = useState<Profile[]>([]);
  const [assigningPickup, setAssigningPickup] = useState<Pickup | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Se avisó "sin señal, quedó en cola": no es un error, así que no comparte
  // el banner rojo de `error`, pero tampoco puede desaparecer sin decir nada.
  const [msgEnCola, setMsgEnCola] = useState(false);
  // Recogida cuyo QR se está mirando o imprimiendo.
  const [qrDe, setQrDe] = useState<Pickup | null>(null);

  // Guías del comercio listas para recoger (creadas y sin recogida asociada).
  const [pendientes, setPendientes] = useState<Guide[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

  // Corregir o cancelar una solicitud que todavía no ha arrancado.
  const [editando, setEditando] = useState<Pickup | null>(null);
  const [cancelando, setCancelando] = useState<Pickup | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [editForm, setEditForm] = useState({
    scheduled_date: "",
    scheduled_time: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    notes: "",
  });
  // Guías que se pueden mover dentro de la recogida que se está editando:
  // las libres más las que ya están dentro de esta misma.
  const [guiasEdit, setGuiasEdit] = useState<GuiaEditable[] | null>(null);
  const [seleccionEdit, setSeleccionEdit] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    client_id: "",
    // Hoy en Medellín, no en UTC: después de las 7 p. m. lo segundo ya es
    // mañana, y la recogida quedaba programada para el día siguiente sin que
    // nadie lo pidiera.
    scheduled_date: hoyEnColombia(),
    scheduled_time: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    notes: "",
  });

  // ── El «ahora» de los formularios ────────────────────────────────────
  //
  // Qué horas se pueden pedir depende del reloj, así que el reloj tiene que
  // seguir corriendo mientras el formulario está abierto: si alguien lo abre a
  // las 4:58 y envía a las 5:03, la lista que tiene delante ya no es cierta.
  // Se refresca cada medio minuto y solo con un formulario abierto, para no
  // volver a dibujar la tabla entera cada 30 s sin que nadie lo esté mirando.
  const [ahora, setAhora] = useState(() => new Date());
  const formularioAbierto = showNew || editando !== null;

  useEffect(() => {
    if (!formularioAbierto) return;
    // El formulario puede abrirse mucho después de que cargara la pantalla:
    // primero se pone el reloj en hora, y luego se deja andando.
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, [formularioAbierto]);

  const hoy = hoyEnColombia(ahora);
  const turnosNueva = useMemo(
    () => turnosDisponibles(form.scheduled_date, ahora),
    [form.scheduled_date, ahora]
  );
  const turnosEdit = useMemo(
    () => turnosDisponibles(editForm.scheduled_date, ahora),
    [editForm.scheduled_date, ahora]
  );

  // Una hora elegida deja de valer sola: porque el usuario movió la fecha a hoy,
  // o porque el reloj le pasó por encima con el formulario abierto. Se limpia el
  // campo en vez de dejarlo con un valor que el desplegable ya no muestra —el
  // <select> se vería vacío pero el estado seguiría enviando la hora vieja—.
  useEffect(() => {
    setForm((f) =>
      yaPaso(f.scheduled_date, f.scheduled_time, ahora) ? { ...f, scheduled_time: "" } : f
    );
  }, [ahora, form.scheduled_date]);

  useEffect(() => {
    setEditForm((f) =>
      yaPaso(f.scheduled_date, f.scheduled_time, ahora) ? { ...f, scheduled_time: "" } : f
    );
  }, [ahora, editForm.scheduled_date]);

  const isStaff = ["admin", "coordinador", "operario", "admin_cedi"].includes(profile.role);

  const load = useCallback(async () => {
    setPickups(null);
    const supabase = createClient();
    let q = supabase
      .from("at_pickups")
      // at_guides(id) en vez de at_guides(count): el agregado embebido depende de
      // que PostgREST tenga habilitados los agregados, y si no lo está la consulta
      // entera falla y la lista queda vacía. El conteo se hace en cliente.
      .select("*, at_clients(business_name), operator:at_profiles!at_pickups_operator_id_fkey(full_name), at_guides(id)")
      .order("requested_at", { ascending: false })
      .limit(100);
    if (estadoFiltro) q = q.eq("status", estadoFiltro);
    const { data } = await q;
    setPickups((data as Pickup[]) ?? []);
  }, [estadoFiltro]);

  useEffect(() => {
    load();
  }, [load]);

  // Datos del comercio solicitante: para el cliente se cargan solos.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        const propio = esCliente ? miComercio ?? list[0] : list[0];
        setForm((f) => ({
          ...f,
          client_id: esCliente ? clientId ?? "" : f.client_id || list[0]?.id || "",
          address: f.address || propio?.address || "",
          contact_name: f.contact_name || propio?.contact_name || "",
          contact_phone: f.contact_phone || propio?.phone || "",
        }));
      });
  }, [esCliente, clientId, miComercio]);

  // Llegando desde un pedido, la hoja se abre sola: el comercio ya dijo lo
  // que quería al tocar «Solicitar recogida» allá.
  useEffect(() => {
    if (pedidoDeLaUrl) setShowNew(true);
  }, [pedidoDeLaUrl]);

  // Guías que se pueden incluir en la solicitud.
  useEffect(() => {
    if (!form.client_id) return;
    const supabase = createClient();
    supabase
      .from("at_guides")
      .select("*, at_zones(name)")
      .eq("client_id", form.client_id)
      .eq("status", "creada")
      .is("pickup_id", null)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        const list = (data as Guide[]) ?? [];
        setPendientes(list);
        // Viniendo de un pedido, solo ese. Si ya no está en la lista —porque
        // alguien le pidió recogida mientras tanto— se cae al comportamiento
        // normal en vez de dejar la selección vacía sin explicación.
        const soloEse = pedidoDeLaUrl && list.some((g) => g.id === pedidoDeLaUrl);
        setSeleccionadas(
          soloEse
            ? new Set([pedidoDeLaUrl])
            // Por defecto se incluyen todas: es lo que el comercio espera.
            : new Set(list.map((g) => g.id))
        );
      });
  }, [form.client_id, showNew, pedidoDeLaUrl]);

  function toggleGuia(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * El último filtro antes de mandar, común a crear y a corregir.
   *
   * Los desplegables ya no ofrecen horas pasadas, así que esto no debería
   * saltar nunca: se pone porque entre abrir el formulario y darle al botón
   * cabe cualquier cosa —el reloj que avanza, una pestaña que estuvo media
   * hora en segundo plano, un `value` viejo que sobrevivió a un re-render—.
   *
   * Pregunta la hora otra vez con `new Date()` y no con el estado `ahora`, que
   * puede llevar hasta 30 s de retraso. Y sigue sin ser la última palabra: la
   * autoridad es el reloj del servidor, que es el que ve la RPC.
   */
  function momentoInvalido(fecha: string, hora: string): string | null {
    const instante = new Date();
    if (fecha === hoyEnColombia(instante) && turnosDisponibles(fecha, instante).length === 0) {
      return MSG_JORNADA_CERRADA;
    }
    if (yaPaso(fecha, hora, instante)) return MSG_HORA_PASADA;
    return null;
  }

  async function createPickup(e: React.FormEvent) {
    e.preventDefault();

    const problema = momentoInvalido(form.scheduled_date, form.scheduled_time);
    if (problema) {
      setError(problema);
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();

    const args = {
      // El cliente no puede suplantar: la RPC ignora este valor si el rol es cliente.
      p_client_id: form.client_id || null,
      p_scheduled_date: form.scheduled_date,
      p_scheduled_time: form.scheduled_time || null,
      p_address: form.address || null,
      p_contact_name: form.contact_name || null,
      p_contact_phone: form.contact_phone || null,
      p_notes: form.notes || null,
      p_guide_ids: Array.from(seleccionadas),
    };

    // Pasa por RPC: enlazar guías a la recogida requiere update sobre at_guides,
    // que la política "ops edita guías" no permite al cliente.
    const { error } = await supabase.rpc("at_request_pickup", args);

    setBusy(false);

    if (error && esFalloDeRed(error)) {
      // Sin señal: la solicitud queda en cola. No hay QR del lote que mostrar
      // todavía —lo genera el servidor al crearla— así que solo se avisa.
      await offline.encolar("solicitar_recogida", { args });
      setShowNew(false);
      setSeleccionadas(new Set());
      setError(null);
      setMsgEnCola(true);
      return;
    }

    if (error) {
      setError(error.message);
      return;
    }
    setShowNew(false);
    setSeleccionadas(new Set());
    load();
  }

  // ── Corregir una solicitud ───────────────────────────────────────────
  async function abrirEdicion(p: Pickup) {
    setError(null);
    setEditando(p);
    setEditForm({
      scheduled_date: p.scheduled_date ?? "",
      scheduled_time: p.scheduled_time ? p.scheduled_time.slice(0, 5) : "",
      address: p.address ?? "",
      contact_name: p.contact_name ?? "",
      contact_phone: p.contact_phone ?? "",
      notes: p.notes ?? "",
    });
    // Las guías se piden aparte: hay que ofrecer también las que ya están
    // dentro de esta recogida, y el listado de "pendientes" solo trae libres.
    setGuiasEdit(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_pickup_guides", { p_pickup_id: p.id });
    if (error) {
      setError(error.message);
      setGuiasEdit([]);
      return;
    }
    const list = (data as GuiaEditable[]) ?? [];
    setGuiasEdit(list);
    setSeleccionEdit(new Set(list.filter((g) => g.incluida).map((g) => g.id)));
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;

    const problema = momentoInvalido(editForm.scheduled_date, editForm.scheduled_time);
    if (problema) {
      setError(problema);
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { error } = await supabase.rpc("at_update_pickup", {
      p_pickup_id: editando.id,
      p_scheduled_date: editForm.scheduled_date || null,
      p_scheduled_time: editForm.scheduled_time || null,
      p_address: editForm.address || null,
      // Cadena vacía = "quiero dejarlo en blanco"; null = "no lo toques".
      p_contact_name: editForm.contact_name,
      p_contact_phone: editForm.contact_phone,
      p_notes: editForm.notes,
      p_guide_ids: guiasEdit ? Array.from(seleccionEdit) : null,
    });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditando(null);
    setGuiasEdit(null);
    load();
  }

  async function confirmarCancelacion() {
    if (!cancelando) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_cancel_pickup", {
      p_pickup_id: cancelando.id,
      p_reason: motivoCancelar.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCancelando(null);
    setMotivoCancelar("");
    load();
  }

  // Carga de mensajeros para asignación por parte del Admin
  useEffect(() => {
    if (!isStaff) return;
    const supabase = createClient();
    supabase
      .from("at_profiles")
      .select("*")
      .eq("role", "mensajero")
      .eq("active", true)
      .order("full_name")
      .then(({ data }) => setCouriers((data as Profile[]) ?? []));
  }, [isStaff]);

  async function handleAssignPickup(e: React.FormEvent) {
    e.preventDefault();
    if (!assigningPickup || !selectedCourierId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_assign_pickup", {
      p_pickup_id: assigningPickup.id,
      p_courier_id: selectedCourierId,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAssigningPickup(null);
    setSelectedCourierId("");
    load();
  }

  /**
   * Los botones de cada solicitud. Se pintan igual en la tabla del escritorio y
   * en la tarjeta del teléfono, así que viven en un solo sitio: si mañana se
   * agrega una acción, no hay que acordarse de agregarla dos veces.
   */
  function acciones(p: Pickup) {
    // Las mismas acciones de siempre, con los mismos handlers: lo único que
    // cambia es dónde se dibujan. Todo lo secundario se va al «…» y en la fila
    // solo queda WhatsApp, que es lo que el CEDI toca de verdad a diario.
    const menu: AccionMenu[] = [];

    // El QR del lote. Va de primero y lo ven todos: el comercio lo imprime
    // y lo pega en la estiba apenas pide la recogida, y el CEDI lo tiene a
    // mano si el papel no llegó. Deja de ofrecerse cuando la recogida se
    // cancela, que es cuando ya no hay lote que recibir.
    if (p.status !== "cancelada") {
      menu.push({
        key: "qr",
        label: "QR del lote",
        icono: <QrCode className="size-4 shrink-0 text-[#ff812c]" />,
        onClick: () => setQrDe(p),
      });
    }

    // Reasignar: solo el CEDI, y mientras la recogida siga viva.
    // Aquí había un botón «Completar» que ponía la recogida en completada de
    // un plumazo, con un número de paquetes escrito a mano y sin tocar ninguna
    // guía. No es de esta pantalla: la recogida la cierra el mensajero en el
    // local, cuando tiene las cajas delante, verifica guía por guía y
    // confirma. Eso es lo que pasa las guías a «recogida» y deja el rastro de
    // quién recibió qué. Desde el CEDI se asigna y se coordina; no se da por
    // recibido lo que nadie ha visto.
    if (isStaff && p.status !== "completada" && p.status !== "cancelada") {
      menu.push({
        key: "asignar",
        label: p.operator ? "Reasignar mensajero" : "Asignar mensajero",
        icono: <UserCheck className="size-4 shrink-0 text-[#ff812c]" />,
        onClick: () => {
          setAssigningPickup(p);
          setSelectedCourierId(p.operator_id || "");
        },
      });
    }

    // Corregir y cancelar: para el comercio dueño y para el CEDI, mientras el
    // mensajero no haya arrancado.
    if (EDITABLES.includes(p.status)) {
      menu.push({
        key: "editar",
        label: "Editar solicitud",
        icono: <Pencil className="size-4 shrink-0 text-[#ff812c]" />,
        onClick: () => abrirEdicion(p),
      });
      menu.push({
        key: "cancelar",
        label: "Cancelar solicitud",
        icono: <Ban className="size-4 shrink-0" />,
        peligro: true,
        onClick: () => {
          setCancelando(p);
          setMotivoCancelar("");
          setError(null);
        },
      });
    }

    // Booleano de verdad: `isStaff && p.contact_phone` daba una cadena, y una
    // cadena vacía en un `&&` de JSX se pinta como texto en la celda.
    const wa = Boolean(isStaff && p.contact_phone);

    return (
      <>
        {wa && (
          <a
            href={whatsappUrl(p.contact_phone!, p.at_clients?.business_name ?? "")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#1C7F45] transition-all hover:bg-[#25D366]/20 active:scale-95 dark:text-[#34C759]"
            title="Coordinar vía WhatsApp"
          >
            <MessageCircle className="size-4 fill-[#25D366] text-[#25D366]" />
          </a>
        )}
        <MenuAcciones acciones={menu} />
        {/* Sin nada que hacer: guion para que la celda no quede vacía */}
        {!wa && menu.length === 0 && (
          <span className="text-[13px] text-slate-400 dark:text-slate-500">—</span>
        )}
      </>
    );
  }

  /**
   * El estado de la solicitud, con su matiz operativo debajo.
   *
   * El «Espera al mensajero» / «Mensajero en camino» vivía entre los botones de
   * la columna de acciones, que es donde menos pinta: no es algo que se pueda
   * pulsar, es el estado contado con más detalle. Aquí, bajo el badge, se lee
   * como lo que es. Se dibuja igual en la tabla y en la tarjeta del teléfono.
   */
  function celdaEstado(p: Pickup) {
    const bajoMinimo =
      p.status === "completada" &&
      p.package_count !== null &&
      p.package_count < MIN_PACKAGES;

    return (
      <div className="flex flex-col items-start gap-1">
        <PickupBadge
          status={p.status}
          title={p.completed_at ? `Completada el ${formatDateTime(p.completed_at)}` : undefined}
        />

        {isStaff && (p.status === "asignada" || p.status === "en_curso") && (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 dark:text-slate-400">
            <Hourglass className="size-3 shrink-0" />
            {p.status === "en_curso" ? "Mensajero en camino" : "Espera al mensajero"}
          </span>
        )}

        {p.status === "completada" && p.package_count !== null && (
          <Etiqueta
            alerta={bajoMinimo}
            title={
              bajoMinimo
                ? `Bajo el mínimo de ${MIN_PACKAGES} paquetes por recogida`
                : undefined
            }
          >
            {bajoMinimo && <TriangleAlert className="size-3 shrink-0" />}
            {p.package_count} paquete{p.package_count === 1 ? "" : "s"}
          </Etiqueta>
        )}
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {msgEnCola && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <p className="text-[14px] font-medium text-amber-800 dark:text-amber-400">
            Guardamos tu solicitud sin conexión. En cuanto vuelva la señal se envía sola al CEDI.
          </p>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Recogidas</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400 max-w-lg">
            {esCliente
              ? "Solicita al CEDI de A Tiempo que recoja tus paquetes"
              : "Fase 1: solicitudes de recogida en el comercio del cliente"}
          </p>
        </div>

        {esCliente && (
          <button
            onClick={() => setShowNew(true)}
            className="min-h-[48px] px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform shrink-0"
          >
            <Plus className="w-5 h-5" />
            <span>Solicitar recogida</span>
          </button>
        )}
      </div>

      {estadoFiltro && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Filtrado desde Mi panel:
          </span>
          <FiltroActivo
            label={PICKUP_STATUS_LABELS[estadoFiltro] ?? estadoFiltro}
            onClear={() => router.replace("/recogidas", { scroll: false })}
          />
        </div>
      )}

      {/* Translúcida y con blur: es la tarjeta donde se lee la lista, y es
          donde más se nota el valle detrás. Probado en vivo: sin blur, /90
          no se distinguía de una tarjeta opaca — hacía falta el blur para
          que el alfa se notara sin perder legibilidad. Es UN contenedor por
          pantalla, no las 234 tarjetas del barrido completo que preocupaban
          por batería. Los modales de abajo (nueva solicitud, asignar,
          editar, cancelar, QR) se quedan opacos: existen para aislar una
          decisión, y dejar ver el fondo ahí resta foco en vez de sumarlo. */}
      <div className="atl-superficie   rounded-3xl shadow-sm border border-slate-900/[0.06] dark:border-white/[0.08] overflow-hidden transition-colors">
        {pickups === null ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando recogidas…</p>
          </div>
        ) : pickups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <PackageOpen className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">
              {estadoFiltro
                ? `No hay recogidas en estado «${PICKUP_STATUS_LABELS[estadoFiltro] ?? estadoFiltro}»`
                : "No hay recogidas registradas"}
            </p>
          </div>
        ) : (
          <>
          {/* Teléfono: la misma solicitud apilada. La tabla de 800 px dejaba las
              acciones fuera de pantalla hasta arrastrarla toda hacia el lado. */}
          <ul className="divide-y divide-slate-900/[0.06] dark:divide-slate-800 lg:hidden">
            {pickups.map((p) => (
              <li key={p.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[16px] text-slate-900 dark:text-white">
                      {p.at_clients?.business_name}
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {formatDate(p.scheduled_date)}
                      {p.scheduled_time ? ` · ${p.scheduled_time.slice(0, 5)}` : ""}
                    </p>
                  </div>
                  {/* La misma celda de estado de la tabla: el badge suave, el
                      matiz operativo y la etiqueta de paquetes salen de un solo
                      sitio, así que el teléfono y el escritorio no se pueden
                      separar con el tiempo. */}
                  <div className="shrink-0">{celdaEstado(p)}</div>
                </div>

                <p className="text-[14px] text-slate-700 dark:text-slate-200">{p.address}</p>
                {p.notes && (
                  <p className="text-[13px] text-slate-500 dark:text-slate-400">{p.notes}</p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
                  <span className="min-w-0 truncate" title={p.operator?.full_name ?? undefined}>
                    Operario: {p.operator?.full_name ?? "—"}
                  </span>
                  {(p.at_guides?.length ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 shrink-0" />
                      {p.at_guides!.length} guía(s)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">{acciones(p)}</div>
              </li>
            ))}
          </ul>

          <div className="hidden lg:block overflow-x-auto">
            {/* `table-fixed` + `colgroup`: sin ancho declarado el navegador
                repartía la tabla según el contenido, y como la columna de
                acciones era la más ancha (cinco botones con texto), Dirección y
                Operario se quedaban con las sobras y partían cada valor en tres
                renglones. Ahora el reparto lo manda el diseño, no el dato más
                largo de la página — y es lo que hace que `truncate` funcione
                dentro de una celda. */}
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[11%]" />
                <col className="w-[26%]" />
                <col className="w-[17%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-900/[0.06] dark:border-slate-800 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                  <th className="px-4 py-3.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cliente</th>
                  <th className="px-4 py-3.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha</th>
                  <th className="px-4 py-3.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dirección</th>
                  <th className="px-4 py-3.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Operario</th>
                  <th className="px-4 py-3.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</th>
                  <th className="px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/[0.06] dark:divide-slate-700">
                {pickups.map((p) => (
                  <tr key={p.id} className="group transition-colors hover:bg-[#F2F2F7]/30 dark:hover:bg-[#1C1C1E]/30">
                    <td className="px-4 py-3 align-top">
                      <NombreCorto
                        nombre={p.at_clients?.business_name}
                        className="text-[15px] font-semibold text-slate-900 dark:text-white"
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {(p.at_guides?.length ?? 0) > 0 && (
                          <Etiqueta title="Guías incluidas en este lote">
                            <Package className="size-3 shrink-0" />
                            {p.at_guides!.length}
                          </Etiqueta>
                        )}
                        {p.notes && (
                          // La nota entera en el `title`: en la celda ocupa una
                          // línea como mucho, y el que la necesite la lee al
                          // pasar el cursor.
                          <span
                            title={p.notes}
                            className="min-w-0 flex-1 truncate text-[13px] text-slate-500 dark:text-slate-400"
                          >
                            {p.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Dos líneas y ni una más: el día arriba, la franja de
                        recogida debajo en secundario. «Solicitada el …» era una
                        tercera línea que nadie leía de corrido — se va al
                        `title` de la celda, donde sigue estando para quien la
                        busque. */}
                    <td
                      className="px-4 py-3 align-top"
                      title={`Solicitada el ${formatDateTime(p.requested_at)}`}
                    >
                      <p className="whitespace-nowrap text-[14px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
                        {formatDate(p.scheduled_date)}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                        {p.scheduled_time
                          ? etiquetaDeHora(p.scheduled_time.slice(0, 5))
                          : "Sin preferencia"}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        title={p.address}
                        className="block text-[14px] leading-snug text-slate-700 dark:text-slate-200"
                      >
                        {p.address}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <NombreCorto
                        nombre={p.operator?.full_name}
                        className="text-[14px] text-slate-700 dark:text-slate-200"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">{celdaEstado(p)}</td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">{acciones(p)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* New Pickup Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity p-4 sm:p-0">
          <div className="atl-superficie w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 max-h-[90dvh] overflow-y-auto">

            <div className="px-6 pt-6 pb-4 border-b border-slate-900/[0.06] dark:border-white/[0.08] flex items-start justify-between sticky top-0 atl-superficie z-10">
              <div className="pr-4">
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">Solicitar recogida</h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                  <Warehouse className="w-3.5 h-3.5 shrink-0" />
                  Solicitud dirigida al CEDI de A Tiempo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full atl-relleno  text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createPickup} className="p-6 space-y-5">
              {/* Comercio solicitante: el cliente no lo elige, se carga solo. */}
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Comercio que solicita
                </label>
                {esCliente ? (
                  <div className="w-full min-h-[52px] flex items-center gap-3 atl-relleno  rounded-lg px-4">
                    <Warehouse className="w-4 h-4 text-[#ff812c] shrink-0" />
                    <span className="text-[16px] font-semibold text-slate-900 dark:text-white truncate">
                      {miComercio?.business_name ?? (cargandoComercio ? "Preparando…" : "—")}
                    </span>
                  </div>
                ) : (
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                    className="w-full min-h-[52px] atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                  >
                    <option value="" disabled>Selecciona el comercio…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.business_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Fecha de recogida
                  </label>
                  <input
                    type="date"
                    required
                    // El calendario no deja ni siquiera elegir ayer: es más
                    // barato no ofrecer la fecha que explicar después por qué
                    // no servía.
                    min={hoy}
                    value={form.scheduled_date}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                    className="w-full min-h-[52px] atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="hora-recogida-nueva"
                    className="block text-[15px] font-semibold text-slate-900 dark:text-white"
                  >
                    Hora deseada
                  </label>
                  <SelectHora
                    id="hora-recogida-nueva"
                    value={form.scheduled_time}
                    onChange={(hora) => setForm((f) => ({ ...f, scheduled_time: hora }))}
                    horas={turnosNueva}
                    className="w-full min-h-[52px] atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                  />
                  {turnosNueva.length > 0 && (
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {AYUDA_HORARIO}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Teléfono de contacto
                </label>
                <input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  className="w-full min-h-[52px] atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                />
              </div>

              {/* Guías que se van a recoger */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Guías a recoger
                  </label>
                  {pendientes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSeleccionadas(
                          seleccionadas.size === pendientes.length
                            ? new Set()
                            : new Set(pendientes.map((g) => g.id))
                        )
                      }
                      className="text-[13px] font-semibold text-[#ff812c] active:opacity-70"
                    >
                      {seleccionadas.size === pendientes.length ? "Quitar todas" : "Seleccionar todas"}
                    </button>
                  )}
                </div>

                {pendientes.length === 0 ? (
                  <div className="rounded-lg atl-relleno  px-4 py-4 space-y-3">
                    <p className="text-[14px] text-slate-500 dark:text-slate-400">
                      No hay guías pendientes de recoger. Puedes solicitar la recogida igual y
                      registrar las guías después, o crearlas ahora.
                    </p>
                    <Link
                      href="/pedidos/nueva"
                      className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#ff812c] active:opacity-70"
                    >
                      <Package className="w-4 h-4" /> Crear una guía
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-900/[0.06] dark:border-white/[0.08] divide-y divide-slate-100 dark:divide-slate-800">
                      {pendientes.map((g) => (
                        <label
                          key={g.id}
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#F2F2F7]/60 dark:hover:bg-[#1C1C1E]/60 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={seleccionadas.has(g.id)}
                            onChange={() => toggleGuia(g.id)}
                            className="w-5 h-5 shrink-0 accent-[#ff812c]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">
                              {g.guide_number} · {g.recipient_name}
                            </p>
                            <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                              {g.recipient_address} · {g.at_zones?.name ?? "sin zona"}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {seleccionadas.size} de {pendientes.length} guía(s) incluidas
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Dirección de recogida
                </label>
                <input
                  required
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full min-h-[52px] atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Notas
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Cantidad estimada de paquetes, horario…"
                  className="w-full atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg p-4 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all resize-none"
                />
              </div>

              {error && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4 border border-rose-100 dark:border-rose-500/20">
                  <p className="text-[14px] text-rose-700 dark:text-rose-400 font-medium leading-snug">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 min-h-[52px] rounded-xl font-semibold atl-relleno  text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform border border-slate-900/[0.06] dark:border-white/[0.08]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[52px] rounded-xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Solicitar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Assign Pickup Modal */}
      {assigningPickup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="atl-superficie w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in duration-200">
            <div className="px-6 pt-6 pb-4 border-b border-slate-900/[0.06] dark:border-white/[0.08] flex items-start justify-between">
              <div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
                  Asignar recogida a mensajero
                </h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {assigningPickup.at_clients?.business_name} · {assigningPickup.address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssigningPickup(null);
                  setSelectedCourierId("");
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full atl-relleno  text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignPickup} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Selecciona el mensajero
                </label>
                <select
                  required
                  value={selectedCourierId}
                  onChange={(e) => setSelectedCourierId(e.target.value)}
                  className="w-full min-h-[52px] atl-relleno  border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                >
                  <option value="" disabled>
                    Elige un mensajero activo...
                  </option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.phone || "Mensajero sin nombre"}
                    </option>
                  ))}
                </select>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Al asignar, el mensajero recibirá inmediatamente una notificación con la dirección y detalles.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssigningPickup(null);
                    setSelectedCourierId("");
                  }}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold atl-relleno  text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || !selectedCourierId}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-5 h-5" />}
                  <span>Asignar y Notificar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editar solicitud — solo mientras el mensajero no haya arrancado */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-0">
          <div className="atl-superficie w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300 max-h-[90dvh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-slate-900/[0.06] dark:border-white/[0.08] flex items-start justify-between sticky top-0 atl-superficie z-10">
              <div className="pr-4">
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">Corregir la solicitud</h3>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                  {editando.status === "asignada"
                    ? "Ya hay un mensajero asignado: le avisamos del cambio."
                    : "Todavía no la hemos asignado, puedes cambiar lo que necesites."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditando(null); setGuiasEdit(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full atl-relleno  text-slate-500 dark:text-slate-400 hover:opacity-80 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarEdicion} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Fecha</label>
                  <input
                    type="date"
                    required
                    min={hoy}
                    value={editForm.scheduled_date}
                    onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                    className="w-full min-h-[52px] px-4 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="hora-recogida-editar"
                    className="block text-[15px] font-semibold text-slate-900 dark:text-white"
                  >
                    Hora
                  </label>
                  <SelectHora
                    id="hora-recogida-editar"
                    value={editForm.scheduled_time}
                    onChange={(hora) => setEditForm({ ...editForm, scheduled_time: hora })}
                    horas={turnosEdit}
                    className="w-full min-h-[52px] px-4 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none"
                  />
                  {turnosEdit.length > 0 && (
                    <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                      {AYUDA_HORARIO}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Dirección de recogida</label>
                <input
                  type="text"
                  required
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full min-h-[52px] px-4 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Contacto</label>
                  <input
                    type="text"
                    value={editForm.contact_name}
                    onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
                    className="w-full min-h-[52px] px-4 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Teléfono</label>
                  <input
                    type="tel"
                    value={editForm.contact_phone}
                    onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                    className="w-full min-h-[52px] px-4 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Notas</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none resize-none"
                />
              </div>

              {/* Guías incluidas */}
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Guías en esta recogida
                </label>
                {guiasEdit === null ? (
                  <div className="flex items-center gap-2 text-[14px] text-slate-500 dark:text-slate-400 py-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando guías…
                  </div>
                ) : guiasEdit.length === 0 ? (
                  <p className="text-[14px] text-slate-500 dark:text-slate-400 atl-relleno  rounded-2xl p-4">
                    No hay guías sin recoger para incluir. La recogida sigue en pie igual.
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto rounded-2xl atl-relleno  divide-y divide-slate-200 dark:divide-slate-700">
                    {guiasEdit.map((g) => (
                      <label key={g.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seleccionEdit.has(g.id)}
                          onChange={() =>
                            setSeleccionEdit((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id);
                              else next.add(g.id);
                              return next;
                            })
                          }
                          className="w-5 h-5 rounded accent-[#ff812c] shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-slate-900 dark:text-white truncate">
                            {g.guide_number}
                          </span>
                          <span className="block text-[13px] text-slate-500 dark:text-slate-400 truncate">
                            {g.recipient_name ?? "—"}
                            {g.recipient_city ? ` · ${g.recipient_city}` : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {guiasEdit && guiasEdit.length > 0 && (
                  <p className="text-[13px] text-slate-500 dark:text-slate-400">
                    {seleccionEdit.size} de {guiasEdit.length} guía(s) incluidas
                  </p>
                )}
              </div>

              {error && (
                <p className="flex items-start gap-1.5 text-[14px] text-rose-600 dark:text-rose-400">
                  <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setEditando(null); setGuiasEdit(null); }}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold atl-relleno  text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Pencil className="w-5 h-5" />}
                  <span>Guardar cambios</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancelar solicitud */}
      {cancelando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-0">
          <div className="atl-superficie w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300">
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                <Ban className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
                  ¿Cancelar esta recogida?
                </h3>
                <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
                  {formatDate(cancelando.scheduled_date)} · {cancelando.address}
                </p>
                <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
                  {cancelando.operator
                    ? `Le avisaremos a ${cancelando.operator.full_name}, que la tenía asignada.`
                    : "Las guías que iban en ella quedan libres para otra recogida."}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Motivo <span className="font-normal text-slate-500 dark:text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={motivoCancelar}
                  onChange={(e) => setMotivoCancelar(e.target.value)}
                  placeholder="Los paquetes no alcanzaron a estar listos"
                  className="w-full min-h-[52px] px-4 rounded-2xl atl-relleno  text-slate-900 dark:text-white border-0 focus:ring-2 focus:ring-[#ff812c] outline-none"
                />
              </div>

              {error && (
                <p className="flex items-start gap-1.5 text-[14px] text-rose-600 dark:text-rose-400">
                  <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setCancelando(null); setError(null); }}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold atl-relleno  text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Mejor no
                </button>
                <button
                  type="button"
                  onClick={confirmarCancelacion}
                  disabled={busy}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ban className="w-5 h-5" />}
                  <span>Sí, cancelar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR del lote */}
      {qrDe && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setQrDe(null)}
        >
          <div
            className="w-full max-w-sm max-h-[90dvh] flex flex-col rounded-3xl atl-superficie shadow-2xl overflow-hidden print:max-h-none print:shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between border-b border-slate-900/[0.06] dark:border-white/[0.08] px-5 py-4 print:hidden">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">
                QR de la recogida
              </h2>
              <div className="flex items-center gap-3">
                <ImprimirQR />
                <button
                  onClick={() => setQrDe(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 active:opacity-70 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-6">
              <RecogidaQR
                token={qrDe.pickup_token}
                comercio={qrDe.at_clients?.business_name ?? "Recogida"}
                paquetes={qrDe.at_guides?.length ?? qrDe.package_count}
                fecha={formatDate(qrDe.scheduled_date)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
