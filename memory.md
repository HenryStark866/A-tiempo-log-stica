# 📝 Memory — Hito: Vitrina Pública y Experiencia de Compra (Storefront)

> **Documento de entrega para Henry Taborda**  
> **Rama:** `feat/vitrina-publica-storefront`  
> **Fecha:** 20 de Octubre de 2026  
> **Autor:** Equipo de Desarrollo / Pair Programming

---

## 1. Resumen de Cambios Introducidos en la Rama
En este hito se implementó la **Vitrina Pública (Storefront)** y el **Flujo de Compra como Invitado** para la plataforma YAM. El objetivo principal es convertir la portada raíz (`/`) en un catálogo de comercio electrónico abierto y moderno para los comercios locales de Antioquia, sin forzar a los compradores a iniciar sesión ni a crear cuentas obligatorias para adquirir productos.

Principales capacidades entregadas:
- **Ruta Raíz (`/`) Pública y Desacoplada:** Acceso abierto e indexable para visitantes anónimos y compradores finales.
- **Navbar Híbrido Comercial:** Barra de navegación unificada con logo YAM, buscador en tiempo real, acceso a comprador registrado ("Iniciar sesión") y botón destacado para tiendas ("Portal Comercios"), con el botón de rastreo logístico oculto para mantener foco 100% comercial.
- **Cinta / Carrusel Continuo de Productos Destacados (Product Marquee):** Ticker animado horizontal colocado debajo del Hero con tarjetas compactas (foto, nombre, precio, tienda), desplazamiento continuo suave y pausa automática al pasar el cursor (`hover:pause`).
- **Manejo Dinámico y Condicional de Categorías:** La barra de píldoras de categorías solo se renderiza si existen **más de 5 categorías activas** con productos, evitando sobrecargar visualmente la pantalla cuando hay pocos productos/categorías.
- **Catálogo y Cuadrícula Responsiva:** Visualización moderna de productos por marcas locales con precios en COP, badges de categoría, filtro por categorías y búsqueda por texto.
- **Enfoque 100% Vitrina Comercial:** Se retiró el bloque inferior de rastreo logístico de guías ATL de la página principal para centrar toda la experiencia de usuario en la vitrina de compras.
- **Fallback de Catálogo Local (`mockProducts.ts`):** Garantiza que la vitrina siempre luzca completa (≥6 productos) representando 3 marcas reales locales del Valle de Aburrá y el Oriente si la base de datos viva aún cuenta con pocos productos activos.
- **Compra como Invitado (Guest Checkout):** Formulario modal ligero con solicitud mínima de datos (Nombre, WhatsApp, Municipio, Dirección y Método de Pago: Interledger, Punto Puntored o Acordado con la tienda).
- **Mejora de UX en Nomenclatura de Pasarelas:** Refinamiento visual y de redacción en la opción de pago digital para el cliente final en el checkout, preservando la integración subyacente con SolV / Interledger (`metodoPago === "interledger"`):
  * Badge superior: *"En línea e inmediato"* (en lugar de la marca interna "SolV").
  * Título principal: *"Pago digital"* (en lugar de "Interledger").
  * Subtexto descriptivo: *"Billeteras digitales o cuentas bancarias"* (en lugar de "Pago digital abierto").
- **Provisión Opcional de Cuenta:** Casilla para crear cuenta de comprador en Supabase Auth únicamente si el usuario lo desea expresamente.
- **Coordinación Directa:** Eliminación de selectores de zona o cobro de mensajería automática en la vitrina; leyenda explícita: *"Entrega o retiro coordinado directamente con [nombre de la tienda]"* y enlace directo a WhatsApp con mensaje pre-armado.
- **Copywriting y Tono de Marca en Hero:** Redacción orientada a la experiencia de compra y apoyo al comercio de la región:
  * Badge superior: *"Comercio local: Valle de Aburrá y Oriente antioqueño"*.
  * Título H1: *"Elige, compra y disfruta."*
  * Párrafo descriptivo: *"Apoyamos el comercio que mueve nuestra tierra. Descubre nuevas opciones y compra con total libertad, rápido y sin intermediarios."*
  * Micro-beneficios: *"Apoyo directo al comercio local"*, *"Pagos digitales o en efectivo local"*, *"Compra ágil sin registros obligatorios"*.
- **Copywriting Comercial en Banner de Captación de Comercios (`page.tsx`):** Mensaje directo de valor para atraer y migrar tiendas al ecosistema YAM:
  * Título principal: *"Crea o migra tu e-commerce con YAM"*.
  * Párrafo descriptivo: *"Trae tus productos a YAM, el stock e-commerce del Valle de Aburrá y el Oriente antioqueño. Crea tu tienda directamente o intégrala con pocos clics trayéndola desde Shopify. Centraliza tus ventas y recibe la liquidación de tus recaudos en menos de 24 horas garantizadas."*
  * Pilares destacados: Alcance regional unificado (Valle de Aburrá + Oriente antioqueño), onboarding ágil con importación/sincronización de Shopify y liquidación de fondos recaudados en menos de 24 horas garantizadas.
  * Botones de acción: *"Ingresar al Portal Comercios"* (`/portal-comercios`) y *"Crear cuenta de comercio"* (`/registro`).
- **Reorganización Estratégica de la Propuesta Contable (División Vitrina vs. Portal):**
  * **Micro-gancho contable en la parte alta de la Vitrina (`page.tsx`):** Franja compacta, sutil y elegante de una sola línea ubicada entre el Hero/Marquee y la cuadrícula de productos:
    > *"💼 ¿Tienes una marca local? Vende sin estrés contable: conciliación automática de cada venta y recaudos en tu cuenta en 24h. [Conocer beneficios / Portal Comercios →]"*
    Permite captar comercios sin saturar ni distraer al comprador final.
  * **Limpieza de la Vitrina Principal:** Se retiró el bloque pesado de 3 tarjetas del fondo de `page.tsx` para dejar que el catálogo comercial respire.
  * **Despliegue Completo en el Portal de Comercios (`/portal-comercios`):** Página dedicada de onboarding y propuesta de valor financiero integral para marcas locales, integrando el componente modular `BloquePropuestaContable.tsx` con las 3 tarjetas detalladas (Ledger inmutable con SolV, liquidación en <24h garantizada y sincronización con Shopify/catálogo directo).
  * **Integración en Formulario de Registro (`/registro`):** Callout de respaldo financiero al seleccionar "Cliente e-commerce" con enlace explicativo directo al portal.

---

## 2. Rutas y Componentes Creados o Modificados

### Archivos Modificados:
1. **`src/middleware.ts`**:
   - Se añadieron `/portal-comercios`, `/para-comercios`, `/catalogo`, `/tienda` y `/checkout` a `PUBLIC_PATHS` para acceso público sin login.
   - Se añadió `https://images.unsplash.com` a la directiva `img-src` de la Content Security Policy (CSP).
2. **`src/app/page.tsx`**:
   - Reemplazo de la landing previa por la Vitrina Comercial completa.
   - Inclusión de la franja superior de micro-gancho para marcas locales con enlace interactivo y accesible (`#banner-gancho-comercios`) hacia `/portal-comercios`.
   - Limpieza del fondo de la vitrina (remoción de las 3 tarjetas pesadas de contabilidad).
   - Banner de captación de comercios regional con enlaces actualizados.
   - Integración de `ProductMarquee` continuo y filtro dinámico de categorías (>5).
3. **`src/components/storefront/NavbarStorefront.tsx`**:
   - Botón "Portal Comercios" unificado para navegar a `/portal-comercios`.
4. **`src/app/registro/page.tsx`**:
   - Callout informativo sobre conciliación automática y liquidación 24h para clientes e-commerce con enlace al portal.
5. **`src/app/globals.css`**:
   - Keyframe `@keyframes marquee` y clase `.animate-marquee` con pausa en `:hover`.
6. **`src/lib/features.ts`**:
   - Feature flags para gobernar visibilidad de mensajería pública (`MOSTRAR_MENSAJERIA_PUBLICO`).

### Archivos Creados:
1. **`src/app/portal-comercios/page.tsx`**:
   - Portal de bienvenida, onboarding y conversión para comerciantes y marcas locales. Contiene el Hero B2B ("Crea o migra tu e-commerce con YAM"), el bloque contable SolV de 3 tarjetas, botón de retorno a vitrina ("← Volver a la vitrina") y accesos a registro (`/registro`) y login (`/login`).
2. **`src/app/para-comercios/page.tsx`**:
   - Ruta alias que redirige automáticamente a `/portal-comercios` para prevenir cualquier enlace roto.
3. **`src/components/storefront/BloquePropuestaContable.tsx`**:
   - Módulo reutilizable de 3 pilares contables: Conciliación en tiempo real (SolV), Recaudos liquidados en <24h y Control sincronizado con Shopify.

### Archivos Creados:
1. **`src/data/mockProducts.ts`**:
   - Base de datos en memoria con 9 productos representativos de 3 marcas locales:
     * *Café Origen Antioquia* (Jericó / Fredonia).
     * *Marroquinería San Pedro* (El Poblado, Medellín).
     * *Botánica & Esencias del Valle* (Santa Elena / Envigado).
2. **`src/components/storefront/NavbarStorefront.tsx`**:
   - Navbar adaptativo comercial con búsqueda en vivo, alternador de tema claro/oscuro/multicolor, botón secundario "Iniciar sesión" y botón destacado "Portal Comercios".
3. **`src/components/storefront/ProductMarquee.tsx`**:
   - Cinta continua animada de productos destacados con desplazamiento infinito de derecha a izquierda, pausa en hover y clic directo al modal de compra.
4. **`src/components/storefront/ModalCheckout.tsx`**:
   - Componente de compra rápida como invitado con selección de municipios de Antioquia, métodos de pago (Interledger / Puntored / Acordado), casilla de registro opcional conectada a Supabase Auth, y disparador de WhatsApp con el resumen de la orden.
5. **`supabase/migrations/0143_vitrina_publica_productos.sql`**:
   - Migración SQL para habilitar permisos de lectura pública sobre productos y comercios activos.

---

## 3. Modificaciones en Políticas de Base de Datos / RLS

Para que la vitrina web pueda leer productos reales desde la API pública de Supabase / PostgREST sin requerir token JWT de sesión de cliente o staff, se preparó la migración:

* **Archivo:** `supabase/migrations/0143_vitrina_publica_productos.sql`

```sql
-- 1. Políticas RLS para at_products
drop policy if exists "publico lee productos activos" on public.at_products;
create policy "publico lee productos activos" on public.at_products
  for select to anon, authenticated
  using (active = true);

grant select on public.at_products to anon, authenticated;

-- 2. Lectura pública de nombres y metadatos básicos de comercios activos
drop policy if exists "publico lee comercios activos" on public.at_clients;
create policy "publico lee comercios activos" on public.at_clients
  for select to anon, authenticated
  using (active = true);

grant select on public.at_clients to anon, authenticated;

notify pgrst, 'reload schema';
```

---

## 4. Instrucciones para Henry (Aprobación, Despliegue y Migraciones)

### Paso 1: Revisión y Aprobación del PR en GitHub
1. Abre el Pull Request de la rama `feat/vitrina-publica-storefront` contra `main`.
2. Verifica que los checks de CI (Typecheck, Lint, Tests y Verificación de Paquete) estén en **verde**.
3. Fusiona el PR en `main`.

### Paso 2: Despliegue en AWS / Vercel
1. Vercel desplegará automáticamente la nueva portada en `yam.cdhmaker.com`, `yam.atiempologistica.com` y `www.atiempologistica.com`.
2. El middleware ya tiene autorizada la raíz y las rutas públicas.

### Paso 3: Aplicación de Migraciones en la Instancia de AWS EC2
Para aplicar las migraciones pendientes acumuladas (de la 0127 a la 0143) en la base de datos de producción:
1. Conéctate por SSH a la instancia de producción en AWS:
   ```bash
   ssh -i ~/.ssh/tu-llave.pem ubuntu@<IP_INSTANCIA_AWS>
   ```
2. Aplica las migraciones en la base de datos local usando el script o directamente en PostgreSQL:
   ```bash
   # Opción A: Mediante psql dentro del contenedor postgres
   docker exec -i yam-postgres psql -U postgres -d postgres < /opt/yam/supabase/migrations/0143_vitrina_publica_productos.sql
   ```
3. O en su defecto, ejecuta el bloque SQL de la migración `0143` desde el cliente o herramienta de administración conectada a la base de la instancia.

---

## 5. Directrices de Arquitectura, Roles y Aislamiento de Mensajería

Con el fin de preservar la estabilidad operativa del sistema y evitar cruces de permisos o fugas de datos sensibles, se aplican los siguientes principios:

### A. Rol de Administración (Henry y Equipo):
* El acceso completo de Administración vía `/login` se conserva **100% intacto**.
* Mantiene todos los permisos y rutas administrativas existentes (`/usuarios`, `/sedes`, `/dashboard`, `/pedidos`, `/recogidas`, `/cedi`, `/mapa`, `/codigos`, `/rutas`, `/novedades`, `/seguimiento`, `/mensajeros`, `/recaudo`, `/facturacion`, `/clientes`, `/seguridad`).

### B. Código y Tablas de Mensajería/Domiciliarios (Intactos y Protegidos):
* **Cero eliminaciones:** No se eliminaron rutas, componentes, tablas ni triggers relacionados con mensajeros (`/conductor/recogida`, `/entregas`, `/mensajeros`, `at_couriers`, `at_settlements`, etc.).
* **Aislamiento de la Interfaz Pública:** La visibilidad pública de opciones de mensajeros (como la postulación de conductores) se desacopló mediante el Feature Flag centralizado:
  * Archivo: `src/lib/features.ts` (`FEATURES.MOSTRAR_MENSAJERIA_PUBLICO`).
  * Por defecto en `false`: la gestión de mensajeros se realiza de forma estrictamente privada desde el CEDI y el panel de administración, sin exponerse en la vitrina pública.

### C. Segregación Estricta de Roles:
* **Compradores / Invitados (`guest` o `comprador`):** Su interacción se limita a consultar el catálogo público (`/`), generar órdenes de compra rápida y, si optan por registrarse, consultar su propio historial de pedidos. No tienen acceso a herramientas operativas, CEDI ni configuración de comercios.
* **Comercios (`cliente` / `asesor`):** Administran su catálogo de productos, órdenes de recogida, sedes y recaudos a través del **Portal Comercios** (`/login?portal=comercios`).
* **Administradores (`admin` / `coordinador`):** Supervisan toda la red de distribución, liquidaciones, seguridad y configuración de la plataforma.

---

## 6. Sincronización con Henry y Trazabilidad de Commits / Push

### A. Commits Recientes de Henry en `origin/main` (Inspeccionados y Sincronizados):
1. **`ccb22ff` (Merge PR #6 `isa/acciones-pedido`):**
   - Integración formal a la rama `main` de las acciones de pedidos y reglas operativas.
2. **`39fd650` ("Merge branch 'main' into isa/acciones-pedido"):**
   - Sincronización intermedia de la rama `isa/acciones-pedido` con `main`.
3. **`54917a9` ("CLAUDE.md: estado de producción y reglas para colaboradores"):**
   - Mapa de arquitectura del proyecto, reglas para colaboradores, confirmación de backend propio en AWS EC2, convención de migraciones a partir de `0143`, y políticas de auditoría/despliegue.
4. **`64cb5ad` (Merge PR #5 `ronda2/audit`):**
   - Integración a `main` de la resolución de auditoría de seguridad y fijación de dependencias.
5. **`0b36555` ("deps: el CI deja de fallar por la auditoria y se documenta el celular de SMS"):**
   - Overrides de dependencias (`postcss`, `tinypool`, `nanoid`, `sharp`, `vite`) y documentación operativa de SMS Gateway en `docs/puente-yam-solv.md`.

### B. Proceso de Sincronización e Integración:
- Se ejecutó `git fetch --all --prune` trayendo las referencias actualizadas de GitHub.
- Se aplicó `git rebase origin/main` sobre `feat/vitrina-publica-storefront`, garantizando un historial lineal y limpio basado en `ccb22ff`. Cero conflictos.

### C. Empaquetado y Push al Repositorio Remoto:
- **Mensaje de commit:** `"feat(storefront): reubicar propuesta contable a portal comercios, micro-gancho b2b y pulir checkout"`
- **Hash de commit consolidado:** `4fff3b8`
- **Base upstream:** `origin/main` (`ccb22ff`)
- **Rama remota:** `origin/feat/vitrina-publica-storefront`
- **Estado:** Push exitoso con tracking upstream configurado (`-u origin feat/vitrina-publica-storefront`).


