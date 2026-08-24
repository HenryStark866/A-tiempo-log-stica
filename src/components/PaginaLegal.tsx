import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MARCA } from "@/lib/marca";
import { RESPONSABLE, VERSION_POLITICAS } from "@/lib/legal";

/**
 * El marco común de las dos páginas legales.
 *
 * Son documentos para leer, no pantallas de trabajo: columna estrecha, letra
 * cómoda y nada que distraiga. Se abren desde el registro —a veces en otra
 * pestaña, a mitad de rellenar el formulario— así que llevan su propia salida
 * de vuelta y no dependen del armazón de la app.
 */
export function PaginaLegal({
  titulo,
  entradilla,
  children,
}: {
  titulo: string;
  entradilla: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F2F2F7] px-4 py-10 font-sans text-slate-900 dark:bg-[#1C1C1E] dark:text-slate-100">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0">
            <Logo className="scale-90 origin-left" />
          </Link>
          <Link
            href="/registro"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-[15px] font-semibold text-[#ff812c]"
          >
            <ChevronLeft className="size-5" /> Volver al registro
          </Link>
        </div>

        <h1 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">
          {titulo}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-slate-600 dark:text-slate-400">
          {entradilla}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-500">
          <span>Versión {VERSION_POLITICAS}</span>
          <span>{RESPONSABLE.razonSocial}</span>
          <span>{RESPONSABLE.ciudad}</span>
        </div>

        {/* `prose` no está instalado en este proyecto, así que el ritmo de
            lectura se arma a mano: los <h2> y <p> de dentro heredan de aquí. */}
        <article
          className="mt-8 space-y-6 rounded-3xl border border-slate-900/[0.06] bg-white/80 p-6 text-[15px] leading-relaxed text-slate-700 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#2C2C2E]/70 dark:text-slate-300 sm:p-8
            [&_h2]:mt-8 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-white [&_h2:first-child]:mt-0
            [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5
            [&_a]:font-semibold [&_a]:text-[#ff812c] [&_a]:underline"
        >
          {children}
        </article>

        <p className="mt-8 text-center text-[13px] text-slate-400 dark:text-slate-500">
          {MARCA.app} · {MARCA.firma}
        </p>
      </div>
    </div>
  );
}

/** Los datos de contacto, solo si están puestos. Ver RESPONSABLE en lib/legal. */
export function DatosDelResponsable() {
  const hayAlguno = RESPONSABLE.nit || RESPONSABLE.correo || RESPONSABLE.direccion;
  return (
    <>
      <h2>Quién responde por tus datos</h2>
      <p>
        El responsable del tratamiento es <strong>{RESPONSABLE.razonSocial}</strong>, con
        operación en {RESPONSABLE.ciudad}.
      </p>
      {hayAlguno && (
        <ul>
          {RESPONSABLE.nit && <li>NIT: {RESPONSABLE.nit}</li>}
          {RESPONSABLE.direccion && <li>Dirección: {RESPONSABLE.direccion}</li>}
          {RESPONSABLE.correo && (
            <li>
              Correo para ejercer tus derechos:{" "}
              <a href={`mailto:${RESPONSABLE.correo}`}>{RESPONSABLE.correo}</a>
            </li>
          )}
        </ul>
      )}
    </>
  );
}
