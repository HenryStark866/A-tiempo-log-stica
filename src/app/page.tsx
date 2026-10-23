"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Store,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { NavbarStorefront } from "@/components/storefront/NavbarStorefront";
import { ProductMarquee } from "@/components/storefront/ProductMarquee";
import { ModalCheckout } from "@/components/storefront/ModalCheckout";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductDetailModal } from "@/components/storefront/ProductDetailModal";
import { FondoInicio } from "@/components/fondos/FondoInicio";
import { PieMarca } from "@/components/PieMarca";
import { BloqueBeyondAccess } from "@/components/BeyondAccess";
import { InstalarApp } from "@/components/InstalarApp";
import { normalizarBusqueda } from "@/lib/utils";
// El cliente con sesión ya no se usa para la vitrina: con alguien logueado la
// consulta corría como `authenticated` y la 0143 solo abre la lectura a `anon`.
// Se deja la importación comentada por si se necesita para otra lectura.
// import { createClient } from "@/lib/supabase/client";
import { createVitrinaClient } from "@/lib/supabase/vitrina";
import {
  SELECT_VITRINA_PUBLICA,
  LIMITE_VITRINA,
  MIN_PRODUCTOS_REALES,
  mapearFilaVitrina,
  type FilaVitrina,
} from "@/lib/vitrina";
import { FEATURES } from "@/lib/features";
import { MOCK_PRODUCTS, type MockProduct } from "@/data/mockProducts";

function StorefrontContent() {
  const searchParams = useSearchParams();
  const qParam = searchParams?.get("q") ?? "";
  const [searchQuery, setSearchQuery] = useState(qParam);

  useEffect(() => {
    if (qParam) {
      setSearchQuery(qParam);
    }
  }, [qParam]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("Todos");
  const [dbProducts, setDbProducts] = useState<MockProduct[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [productoDetalle, setProductoDetalle] = useState<MockProduct | null>(null);
  const [checkoutData, setCheckoutData] = useState<{ product: MockProduct; quantity: number } | null>(null);

  // Carga de productos desde Supabase con fallback automático a mockProducts.
  //
  // Por qué la portada salía sin los productos reales en producción:
  //  1. El umbral era `data.length >= 6`. Producción tiene 5 productos activos,
  //     así que la respuesta (200, correcta) se descartaba y se pintaban las
  //     marcas de muestra.
  //  2. Con sesión abierta la consulta iba como `authenticated`, y la 0143 solo
  //     abre la vitrina a `anon`: un comercio veía solo lo suyo y un comprador
  //     nada. Ahora se lee con un cliente sin sesión (createVitrinaClient).
  //  3. Se piden SOLO columnas de la lista blanca de la 0143 (ver
  //     src/lib/vitrina.ts). `select("*")` responde 401 a `anon`.
  useEffect(() => {
    async function cargarCatalogo() {
      const usarDemo = () => setDbProducts(FEATURES.VITRINA_CATALOGO_DEMO ? MOCK_PRODUCTS : []);
      try {
        const supabase = createVitrinaClient();
        const { data, error } = await supabase
          .from("at_products")
          .select(SELECT_VITRINA_PUBLICA)
          .eq("active", true)
          .order("name")
          .limit(LIMITE_VITRINA);

        if (error) {
          console.warn("La vitrina no pudo leer el catálogo público:", error.message);
          usarDemo();
          return;
        }

        const filas = (data ?? []) as unknown as FilaVitrina[];
        if (filas.length >= MIN_PRODUCTOS_REALES) {
          setDbProducts(filas.map(mapearFilaVitrina));
        } else {
          usarDemo();
        }
      } catch (err) {
        console.warn("Usando catálogo local de fallback:", err);
        usarDemo();
      } finally {
        setLoadingDb(false);
      }
    }

    cargarCatalogo();
  }, []);

  // Extraer dinámicamente las categorías con productos
  const categoriasActivas = useMemo(() => {
    const cats = new Set<string>();
    dbProducts.forEach((p) => {
      if (p.category && p.category.trim()) {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats);
  }, [dbProducts]);

  // Solo se renderiza la barra de píldoras si existen MÁS DE 5 categorías activas
  const mostrarBarraCategorias = categoriasActivas.length > 5;

  // Filtrado reactivo por categoría y búsqueda de texto
  const productosFiltrados = useMemo(() => {
    return dbProducts.filter((p) => {
      // Filtro por categoría (siempre activo en la lógica)
      if (categoriaSeleccionada !== "Todos" && p.category !== categoriaSeleccionada) {
        return false;
      }
      // Filtro por búsqueda de texto
      if (searchQuery.trim()) {
        const queryNorm = normalizarBusqueda(searchQuery);
        const matchNombre = normalizarBusqueda(p.name).includes(queryNorm);
        const matchComercio = normalizarBusqueda(p.store_name).includes(queryNorm);
        const matchDesc = normalizarBusqueda(p.description).includes(queryNorm);
        return matchNombre || matchComercio || matchDesc;
      }
      return true;
    });
  }, [dbProducts, categoriaSeleccionada, searchQuery]);

  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 pb-20 transition-colors duration-300">
      <FondoInicio />

      {/* Banner de instalación PWA para dispositivos móviles */}
      <InstalarApp enPagina />

      {/* Navbar Híbrido Superior (100% enfocado en vitrina comercial) */}
      <NavbarStorefront
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Hero Section / Portada de la Vitrina */}
      <header className="atl-encima px-4 sm:px-6 lg:px-8 pt-8 pb-4 max-w-7xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-white/70 via-white/40 to-white/10 dark:from-[#1C1C1E]/80 dark:via-[#1C1C1E]/50 dark:to-white/[0.02] backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 p-6 sm:p-10 shadow-sm transition-all">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#ff812c]/15 text-[#ff812c] border border-[#ff812c]/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Comercio local: Valle de Aburrá y Oriente antioqueño</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15]">
              Elige, compra y <span className="text-[#ff812c]">disfruta.</span>
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              Apoyamos el comercio que mueve nuestra tierra. Descubre nuevas opciones y compra con total libertad, rápido y sin intermediarios.
            </p>

            {/* Micro-beneficios del storefront */}
            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5 font-medium">
                <Store className="w-4 h-4 text-[#ff812c]" />
                <span>Apoyo directo al comercio local</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <CreditCard className="w-4 h-4 text-sky-500" />
                <span>Pagos digitales o en efectivo local</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Compra ágil sin registros obligatorios</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Cinta/Carrusel dinámico de productos destacados (Marquee Banner) */}
      <div className="atl-encima">
        <ProductMarquee
          products={dbProducts}
          onSelectProduct={(p) => setProductoDetalle(p)}
        />
      </div>

      {/* Contenido Principal: Categorías (si >5) y Grid de Productos */}
      <main className="atl-encima max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-8">
        
        {/* Franja / Gancho sutil para Marcas y Comercios Locales */}
        <div className="pt-1 relative z-20">
          <Link
            id="banner-gancho-comercios"
            href="/portal-comercios"
            className="group flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#ff812c]/10 to-orange-500/10 hover:from-amber-500/15 hover:via-[#ff812c]/20 hover:to-orange-500/15 border border-[#ff812c]/20 hover:border-[#ff812c]/40 transition-all duration-200 shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 text-center sm:text-left">
              <span className="text-base shrink-0">💼</span>
              <span>
                <strong className="text-slate-900 dark:text-white font-bold">¿Tienes una marca local?</strong>{" "}
                Vende sin estrés contable: conciliación automática de cada venta y recaudos en tu cuenta en 24h.
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ff812c]/15 text-xs sm:text-sm font-bold text-[#ff812c] group-hover:bg-[#ff812c] group-hover:text-[#1C1C1E] transition-all shrink-0 whitespace-nowrap">
              <span>Conocer beneficios / Portal Comercios</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>

        {/* Barra de Filtros por Categoría: SOLO si hay más de 5 categorías activas */}
        {mostrarBarraCategorias && (
          <div className="flex items-center justify-between gap-4 overflow-x-auto pb-2 scrollbar-none">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1 pr-2 hidden sm:inline">
                Categorías:
              </span>
              {["Todos", ...categoriasActivas].map((cat) => {
                const active = categoriaSeleccionada === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaSeleccionada(cat)}
                    className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                      active
                        ? "bg-[#ff812c] text-[#1C1C1E] shadow-sm font-bold scale-[1.02]"
                        : "bg-white/70 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0 pr-1">
              {productosFiltrados.length} {productosFiltrados.length === 1 ? "producto" : "productos"}
            </span>
          </div>
        )}

        {/* Cuadrícula (Grid) de Productos de la Vitrina */}
        {loadingDb ? (
          // Mientras llega la respuesta no se dice «No se encontraron productos»:
          // en una conexión lenta eso se leía como una portada vacía.
          <div
            id="vitrina-cargando"
            aria-busy="true"
            aria-label="Cargando productos"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`esqueleto-${i}`}
                className="rounded-3xl overflow-hidden bg-white/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 animate-pulse"
              >
                <div className="aspect-[4/3] bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="h-3 w-full rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                  <div className="h-10 w-full rounded-xl bg-slate-200/70 dark:bg-white/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white/40 dark:bg-white/[0.02] backdrop-blur-md rounded-3xl border border-slate-200 dark:border-white/10">
            <ShoppingBag className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              No se encontraron productos
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              No hay artículos que coincidan con &laquo;{searchQuery}&raquo;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setCategoriaSeleccionada("Todos");
              }}
              className="mt-4 px-4 py-2 text-xs font-bold rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white hover:bg-slate-300"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {productosFiltrados.map((prod) => (
              <ProductCard
                key={prod.id}
                product={prod}
                onViewDetail={(p) => setProductoDetalle(p)}
                onQuickBuy={(p) => setCheckoutData({ product: p, quantity: 1 })}
              />
            ))}
          </div>
        )}

        {/* Sección Destacada: ¿Eres un comercio? Portal de Tiendas */}
        <section className="mt-16 rounded-3xl bg-gradient-to-br from-slate-900 via-[#1C1C1E] to-black text-white p-8 sm:p-12 border border-white/10 shadow-xl overflow-hidden relative">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-[#ff812c]">
              <Store className="w-4 h-4 text-[#ff812c]" />
              <span>Para Emprendedores y Comercios Locales</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Crea o migra tu e-commerce con YAM
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Trae tus productos a YAM, el stock e-commerce del Valle de Aburrá y el Oriente
              antioqueño. Crea tu tienda directamente o intégrala con pocos clics trayéndola
              desde Shopify. Centraliza tus ventas y recibe la liquidación de tus recaudos en
              menos de 24 horas garantizadas.
            </p>
            <div className="pt-2 flex flex-wrap gap-4">
              <Link
                href="/portal-comercios"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#ff812c] text-[#1C1C1E] text-sm font-bold hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all"
              >
                <span>Ingresar al Portal Comercios</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold border border-white/20 transition-all"
              >
                <span>Crear cuenta de comercio</span>
              </Link>
            </div>
          </div>
        </section>

        {/* La alianza. Va al final de la vitrina y antes del pie: es lo
            ultimo que se cuenta de nosotros, y quien llego hasta aqui ya vio
            de que se trata YAM. */}
        <BloqueBeyondAccess className="mt-16" />
      </main>

      {/* Modal de Detalle de Producto */}
      {productoDetalle && (
        <ProductDetailModal
          product={productoDetalle}
          onClose={() => setProductoDetalle(null)}
          onBuyNow={(prod, qty) => {
            setProductoDetalle(null);
            setCheckoutData({ product: prod, quantity: qty });
          }}
        />
      )}

      {/* Modal de Checkout / Compra Rápida como Invitado */}
      {checkoutData && (
        <ModalCheckout
          product={checkoutData.product}
          initialQuantity={checkoutData.quantity}
          onClose={() => setCheckoutData(null)}
        />
      )}

      {/* Pie de Página */}
      <footer className="mt-20">
        <PieMarca />
      </footer>
    </div>
  );
}

export default function StorefrontPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-[#121214]" />}>
      <StorefrontContent />
    </Suspense>
  );
}
