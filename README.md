# 📦 aTiempo Logística

Plataforma SaaS de logística de última milla que conecta comercios remitentes, un centro de distribución (CEDI) y mensajeros, con visibilidad en tiempo real tanto para quien envía como para quien recibe.

🔗 **Producción**: [atiempo-logistica.vercel.app](https://atiempo-logistica.vercel.app)

---

## 📋 Tabla de Contenido
- [📝 Descripción](#-descripción)
- [✨ Características Principales](#-características-principales)
- [👥 Perfiles de Usuario](#-perfiles-de-usuario)
- [🔄 Flujo Operativo](#-flujo-operativo)
- [🏗️ Arquitectura y Stack Técnico](#️-arquitectura-y-stack-técnico)
- [⚙️ Reglas de Negocio Formalizadas](#️-reglas-de-negocio-formalizadas)
- [🚥 Estado del Proyecto y Marco de Priorización](#-estado-del-proyecto-y-marco-de-priorización)
- [🛡️ Gestión de Riesgo y Feature Flags](#️-gestión-de-riesgo-y-feature-flags)
- [💬 Evaluación Chat Interno (Build vs. Buy)](#-evaluación-chat-interno-build-vs-buy)
- [🎨 Sistema de Diseño Compartido](#-sistema-de-diseño-compartido)
- [💻 Instalación y Desarrollo Local](#-instalación-y-desarrollo-local)
- [🗺️ Roadmap de Arquitectura a 90 Días](#️-roadmap-de-arquitectura-a-90-días)
- [🧑‍🤝‍🧑 Equipo y Gobernanza](#-equipo-y-gobernanza)
- [📄 Licencia](#-licencia)
- [🚀 Próximos 3 Pasos](#-próximos-3-pasos)

---

## 📝 Descripción

**aTiempo Logística** es una plataforma SaaS diseñada para gestionar el ciclo completo de una entrega de última milla en e-commerce (Medellín y área metropolitana): recolección en origen, procesamiento en centro de distribución (CEDI), ruteo, asignación con capacidad límite por mensajero y entrega final con rastreo en vivo y opción de punto de cruce en tiempo real.

---

## ✨ Características Principales

* **Recolección Gestionada**: Solicitudes digitales con umbral mínimo de 5 paquetes por visita y geolocalización de recolección.
* **Procesamiento CEDI**: Clasificación por zonas, recepción digital in situ, picking y zonificación automática.
* **Asignación Inteligente**: Motor de asignación de paquetes respetando el límite físico/volumétrico de la maleta del mensajero.
* **Tracking en Tiempo Real**: Portal público y privado con trazabilidad de estados y fecha/hora exacta.
* **Punto de Cruce en Tiempo Real**: Canal dinámico donde el destinatario y el mensajero se encuentran visualmente en el mapa en ruta activa.
* **Manejo de Novedades y Reintentos**: Máquina de estados estricta en la base de datos (máximo 2 intentos antes de pasar a Logística Inversa).
* **Cierre de Caja y Recaudo (COD)**: Conciliación de efectivo contraentrega y cuadre bancario por cada ruta.
* **Chat Interno de Operaciones**: Capa transversal de comunicación contextualmente enlazada a cada guía o novedad.

---

## 👥 Perfiles de Usuario

| Perfil | Plataforma Prioritaria | Función Principal y Nota |
|---|---|---|
| **Administración / Coordinación** | Escritorio (+ móvil de consulta) | Supervisión global, gestión de excepciones, mapa de flota en vivo, conciliación de cartera y auditoría. |
| **Operario CEDI** | Escritorio / Tablet fijo | Recepción masiva, clasificación, zonificación, picking de paquetes y armado de manifiestos. |
| **Mensajero (Recolector / Repartidor)** | Móvil (Web App PWA / Nativa) | GPS en vivo, navegación asistida (Google Maps/Waze), cámara para fotos de evidencia de entrega y cierre de caja. |
| **Cliente Remitente (E-commerce / Tiendas)** | Web Responsive + Móvil | Creación de solicitudes, envío masivo de guías, portal de facturación quincenal/mensual y métricas (LTR, TLI). |
| **Comprador / Destinatario Final** | Móvil (App con perfil propio) | Cuenta personal para ver todos sus envíos entrantes, tracking en vivo, chat directo y activación de Punto de Cruce. |

---

## 🔄 Flujo Operativo

```
[ Cliente Remitente ] (Solicita recogida - mín. 5 paquetes)
          ↓
[ Mensajero Recolector ] (Visita al comercio y carga al vehículo)
          ↓
[ Centro de Distribución - CEDI ] (Recepción → Clasificación → Zonificación → Picking)
          ↓
[ Asignación Inteligente ] (Filtrado por capacidad de carga del mensajero)
          ↓
[ Mensajero Repartidor ] (Ruta activa + opción "Punto de Cruce" en tiempo real)
          ↓
[ Entrega Final ] (Captura de evidencia obligatoria: foto / OTP / firma)
          ↓
[ Confirmación & Trazabilidad ] (Notificación al Remitente y Cierre de Caja COD)
```

---

## 🏗️ Arquitectura y Stack Técnico

| Capa / Componente | Tecnología Seleccionada | Justificación / Estado |
|---|---|---|
| **Hosting & Infraestructura** | Vercel | Despliegue continuo serverless con CI/CD automático. |
| **Frontend Framework** | Next.js 15 (App Router) + React 19 + TypeScript | SSR/ISR para SEO y renderizado rápido de dashboards dinámicos. |
| **Estilos & UI Token System** | Tailwind CSS 4 + Lucide React + Next Themes | Sistema de diseño compartido con soporte nativo de modo oscuro/claro. |
| **Backend & Base de Datos** | Supabase (PostgreSQL 17 + Auth + RLS) | Persistencia relacional sólida con seguridad a nivel de filas (RLS). |
| **Lógica de Negocio** | PostgreSQL RPC (`security definer`) | Máquina de estados inmutable encapsulada dentro de la BD (`at_change_guide_status`). |
| **Ruteo & Mapas** | Integración Híbrida (Leaflet/Mapbox + Deep Links Waze/Google Maps) | Renderizado interactivo en web y apertura con 1 tap en la app del mensajero. |
| **Notificaciones en Tiempo Real** | Supabase Realtime (WebSockets / Postgres Changes) | Transmisión de posiciones GPS y estado de guías en vivo. |
| **Chat Interno** | Solución Híbrida (Supabase Realtime Tables) | Chat liviano estructurado por `guia_id` sin costos por usuario de terceros. |
| **Pasarela de Pago & Recaudo** | Módulo COD propio + Integración Wompi/Bold (Fase 2) | Control de efectivo en calle y conciliación de recaudo bancario. |

---

## ⚙️ Reglas de Negocio Formalizadas

1. **Mínimo de Recolección (5 Paquetes)**:
   * Si la solicitud tiene menos de 5 paquetes, el sistema aplica una tarifa administrativa de recolección de bajo volumen o consolida la visita con otro cliente de la misma zona.
2. **Capacidad Máxima por Mensajero**:
   * Cada perfil de mensajero tiene parametrizado su tipo de vehículo (Moto: máx. 25-30 kg / 15-20 paquetes voluminosos; Bicicleta/Caminante: 10 kg). El algoritmo de asignación bloquea sobrecargas.
3. **Protocolo de Verificación para "Punto de Cruce"**:
   * La ubicación compartida entre mensajero y comprador solo se activa cuando la guía está en estado `en_ruta` y a menos de 2 km de distancia, requiriendo validación por código OTP temporal enviado al comprador.
4. **Evidencia de Entrega Obligatoria**:
   * Ninguna guía puede marcarse como `entregada` sin adjuntar al menos 1 elemento de prueba: foto del paquete entregado en destino, firma digital del receptor o código OTP de 4 dígitos.
5. **Reintentos y Logística Inversa**:
   * Máximo 2 intentos de entrega. El 1er fallo pasa a `reprogramada` con causal obligatoria; el 2do fallo activa automáticamente la orden de `en_devolucion` (logística inversa).

---

## 🚥 Estado del Proyecto y Marco de Priorización

### 🔴 Bloqueante (Esta semana - Operación Segura)
* [x] RLS y seguridad en base de datos (`security definer` y revocación de anon en RPCs).
* [x] Parche de seguridad Next.js y Middleware de roles.
* [x] Flujo de asignación con validación de capacidad de mensajero.
* [x] Captura de evidencia de entrega (cámara/foto).
* [x] Vista de seguimiento básico y ruteo asistido para mensajero.

### 🟡 Importante (Puede esperar - Siguientes 2-4 semanas)
* [ ] Refinamiento de apps PWA por perfil con estilos adaptados por rol.
* [ ] Notificaciones push para novedades de entrega y cambios de estado.
* [ ] Panel de facturación quincenal consolidada para e-commerce.
* [ ] Reportes avanzados de Lead Time de Recogida (LTR) y Tasa de Logística Inversa (TLI).

### 🔵 Fase 2 / Roadmap (Visión a 90 días)
* [ ] Apps móviles nativas publicadas en App Store / Play Store para los 5 perfiles.
* [ ] Punto de encuentro / cruce avanzado con verificación biométrica / OTP estricta.
* [ ] Integraciones API de entrada automática para Shopify, WooCommerce y MercadoLibre.

---

## 🛡️ Gestión de Riesgo y Feature Flags

Para no interrumpir la operación en producción (`atiempo-logistica.vercel.app`):
* **Feature Flag Pattern**: Las nuevas funcionalidades (como *Punto de Cruce*) se despliegan protegidas por variables de entorno/configuración en BD (`FEATURE_PUNTO_CRUCE_ENABLED=false`).
* **Despliegues Progresivos**: Pruebas en ambiente de staging o con un grupo reducido de 2 mensajeros y 1 e-commerce piloto antes de la activación masiva.
* **Políticas de Privacidad GPS**: La ubicación en tiempo real del mensajero se trunca automáticamente al finalizar la ruta o al alejarse de la zona de entrega, protegiendo los datos personales del operador.

---

## 💬 Evaluación Chat Interno (Build vs. Buy)

Dado el equipo de 3 socios y la necesidad de agilidad:

| Criterio | Opción A: Build (Supabase Realtime) | Opción B: Buy (Stream / PubNub) |
|---|---|---|
| **Costo** | $0 adicional (incluido en tier Supabase) | $99 - $299/mes según usuarios activos |
| **Esfuerzo Dev** | Bajo (Tabla `at_mensajes` + RLS + Componente React) | Medio (SDKs externos y configuración de webhooks) |
| **Control de Datos** | Total (mensajes almacenados en la BD propia) | Parcial (almacenado en servidores de terceros) |
| **Decisión** | **RECOMENDADA (Build con Supabase)** | Descartada para MVP |

---

## 🎨 Sistema de Diseño Compartido

Un solo **Design System** unificado en Tailwind CSS 4 con **variantes temáticas por rol**:

```
                              [ Unified UI Tokens ]
                             /          |          \
              [ Tema Admin ]     [ Tema CEDI ]     [ Tema Mensajero / Cliente ]
             (Slate / Indigo)    (Amber/Dark)        (Emerald / Clean Light)
```

* **Coordinación / Admin**: Estilo analítico, alta densidad de datos, tablas dinámicas y gráficos.
* **CEDI**: Estilo industrial, botones gigantes aptos para pantallas táctiles/tablets y contraste elevado.
* **Mensajero / Cliente**: Interfaz móvil táctil, navegación inferior thumb-friendly y modos oscuro/claro automáticos.

---

## 💻 Instalación y Desarrollo Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/HenryStark866/A-tiempo-log-stica.git
cd A-tiempo-log-stica
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crea un archivo `.env.local` en la raíz basado en `.env.example`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 4. Base de datos y Migraciones
Aplica las migraciones en Supabase en el orden correspondiente:
1. `supabase/migrations/0001_core_schema.sql`
2. `supabase/migrations/0002_functions_triggers.sql`
3. `supabase/migrations/0003_rls_policies.sql`
4. `supabase/migrations/0004_security_hardening.sql`
5. `supabase/migrations/0005_evidencia_capacidad_reglas.sql`

*(Opcional)* Carga datos de prueba con `supabase/seed.sql`.

### 5. Ejecutar el servidor de desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en el navegador.

---

## 🗺️ Roadmap de Arquitectura a 90 Días

```
Mes 1: Consolidación Operativa (🔴 Bloqueantes)
 ├─ Estabilización de RLS y máquina de estados en Supabase
 ├─ Validación estricta de 5 paquetes por recogida y capacidad de carga
 └─ Evidencia de entrega (foto/OTP) y ruteo asistido PWA

Mes 2: Automatización & Notificaciones (🟡 Importantes)
 ├─ Notificaciones en tiempo real para destinatarios y e-commerce
 ├─ Módulo de cierre de caja COD y liquidación de fletes
 └─ Refinamiento visual del Design System por rol

Mes 3: Escala & Ecosistema (🔵 Fase 2)
 ├─ API pública / Webhooks para integración con Shopify/WooCommerce
 ├─ Módulo de Punto de Cruce maduro con verificación OTP
 └─ Evaluaciones de desempeño de mensajeros y ruteo dinámico con mapas
```

---

## 🧑‍🤝‍🧑 Equipo y Gobernanza

* **Fundadores & Administradores**: Equipo de 3 socios con acceso administrativo total.
* **Escalamiento Operativo de Incidentes**: 1 punto focal rotativo semanal entre los 3 socios para resolver novedades críticas en vivo (ej. fallos de entrega, disputas de dinero COD, alertas de servidor).

---

## 📄 Licencia

Software propietario. Todos los derechos reservados a **aTiempo Logística S.A.S.**

---

## 🚀 Próximos 3 Pasos

1. **Verificar Despliegue en Vercel**: Confirmar que la última versión en `atiempo-logistica.vercel.app` funciona correctamente tras el push de corrección de correo.
2. **Validación en Campo**: Realizar una prueba piloto de ruta con 1 mensajero probando la captura de foto evidencia y el mapa asistido.
3. **Reunión de Socios**: Formalizar las reglas de mínimo de recolección y protocolo de incidentes entre los 3 administradores.
