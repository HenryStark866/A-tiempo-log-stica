/**
 * Catálogo de prueba para la vitrina pública (Storefront).
 * Se utiliza como fallback cuando la base de datos tiene menos de 6 productos activos.
 * Representa 3 marcas locales del Valle de Aburrá y el Oriente Antioqueño.
 */

export interface MockProduct {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  image_url: string;
  store_name: string;
  store_slug: string;
  store_badge?: string;
  category: string;
  store_phone: string;
  store_location: string;
}

export const MOCK_PRODUCTS: MockProduct[] = [
  // Marca 1: Café Origen Antioquia (Fredonia & Jericó)
  {
    id: "prod-mock-01",
    name: "Café Especial Geisha — Edición Jericó",
    sku: "COA-GEI-250",
    description: "Café de especialidad 88 puntos SCA. Notas florales a jazmín, miel de caña y acidez cítrica brillante. Tueste medio fresco, molido o en grano (250g).",
    price: 45000,
    image_url: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=800&q=80",
    store_name: "Café Origen Antioquia",
    store_slug: "cafe-origen",
    store_badge: "Café de Especialidad",
    category: "Alimentos y Bebidas",
    store_phone: "+573004567890",
    store_location: "Jericó / Medellín, Antioquia",
  },
  {
    id: "prod-mock-02",
    name: "Café Variedad Castillo — Finca Fredonia",
    sku: "COA-CAS-500",
    description: "Cuerpo medio-alto con notas a chocolate negro, panela y frutos secos. Proceso lavado tradicional a 1.850 msnm. Bolsa con válvula desgasificadora (500g).",
    price: 32000,
    image_url: "https://images.unsplash.com/photo-1587734195503-904fca47e0e9?auto=format&fit=crop&w=800&q=80",
    store_name: "Café Origen Antioquia",
    store_slug: "cafe-origen",
    store_badge: "Café de Especialidad",
    category: "Alimentos y Bebidas",
    store_phone: "+573004567890",
    store_location: "Fredonia / Medellín, Antioquia",
  },
  {
    id: "prod-mock-03",
    name: "Cold Brew Artesanal Concentrado (300ml)",
    sku: "COA-CB-300",
    description: "Extracción lenta en frío durante 18 horas con granos bourbon rosado. Listo para servir con hielo o leche de almendras.",
    price: 15500,
    image_url: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=800&q=80",
    store_name: "Café Origen Antioquia",
    store_slug: "cafe-origen",
    store_badge: "Café de Especialidad",
    category: "Alimentos y Bebidas",
    store_phone: "+573004567890",
    store_location: "Medellín, Antioquia",
  },

  // Marca 2: Marroquinería San Pedro (Medellín)
  {
    id: "prod-mock-04",
    name: "Billetera Minimalista en Cuero Graso Café",
    sku: "MSP-BIL-01",
    description: "Confección artesanal 100% cuero vacuno graso colombiano. Capacidad para 8 tarjetas y compartimento para billetes con bloqueo RFID.",
    price: 78000,
    image_url: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80",
    store_name: "Marroquinería San Pedro",
    store_slug: "marroquineria-san-pedro",
    store_badge: "Cuero Genuino 100%",
    category: "Moda y Accesorios",
    store_phone: "+573123456789",
    store_location: "El Poblado, Medellín",
  },
  {
    id: "prod-mock-05",
    name: "Morral Urbano de Lona Pesada & Detalles de Cuero",
    sku: "MSP-MOR-02",
    description: "Diseño ergonómico para portátiles de hasta 15.6 pulgadas. Lona impermeable de alto calibre con herrajes pavonados y correas acolchadas.",
    price: 185000,
    image_url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80",
    store_name: "Marroquinería San Pedro",
    store_slug: "marroquineria-san-pedro",
    store_badge: "Cuero Genuino 100%",
    category: "Moda y Accesorios",
    store_phone: "+573123456789",
    store_location: "El Poblado, Medellín",
  },
  {
    id: "prod-mock-06",
    name: "Cinturón de Cuero Nobuk Doble Faz",
    sku: "MSP-CIN-03",
    description: "Cuero nobuk curtido al vegetal. Hebilla metálica giratoria de ajuste rápido en acabados café tabaco y negro mate.",
    price: 58000,
    image_url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80",
    store_name: "Marroquinería San Pedro",
    store_slug: "marroquineria-san-pedro",
    store_badge: "Cuero Genuino 100%",
    category: "Moda y Accesorios",
    store_phone: "+573123456789",
    store_location: "El Poblado, Medellín",
  },

  // Marca 3: Botánica & Esencias del Valle (Santa Elena)
  {
    id: "prod-mock-07",
    name: "Serum Facial Regenerador Aloe & Romero Silvestre",
    sku: "BOT-SER-30",
    description: "Fórmula hidratante ligera rica en antioxidantes y extracto botánico cultivado en Santa Elena. Apto para todo tipo de piel (Frasco gotero 30ml).",
    price: 48000,
    image_url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80",
    store_name: "Botánica & Esencias del Valle",
    store_slug: "botanica-valle",
    store_badge: "Cosmética Consciente",
    category: "Bienestar y Cuidado",
    store_phone: "+573187654321",
    store_location: "Santa Elena / Envigado",
  },
  {
    id: "prod-mock-08",
    name: "Vela Aromática en Cera de Soya — Pino & Eucalipto",
    sku: "BOT-VEL-250",
    description: "Vela vertida a mano en vaso de cerámica artesanal reciclable. Pabilo de madera natural que crepita al encender. Duración aprox. 45 horas.",
    price: 36000,
    image_url: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=800&q=80",
    store_name: "Botánica & Esencias del Valle",
    store_slug: "botanica-valle",
    store_badge: "Cosmética Consciente",
    category: "Hogar y Bienestar",
    store_phone: "+573187654321",
    store_location: "Santa Elena / Envigado",
  },
  {
    id: "prod-mock-09",
    name: "Jabón Exfoliante Avena Pura & Miel de Abejas",
    sku: "BOT-JAB-120",
    description: "Saponificado en frío con aceites vegetales de coco y oliva virgen extra. Limpieza suave para rostro y cuerpo (Barra 120g).",
    price: 18000,
    image_url: "https://images.unsplash.com/photo-1607006314647-7501a35790be?auto=format&fit=crop&w=800&q=80",
    store_name: "Botánica & Esencias del Valle",
    store_slug: "botanica-valle",
    store_badge: "Cosmética Consciente",
    category: "Bienestar y Cuidado",
    store_phone: "+573187654321",
    store_location: "Santa Elena / Envigado",
  },
];
