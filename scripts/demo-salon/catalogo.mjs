/**
 * scripts/demo-salon/catalogo.mjs — el catálogo de demostración de «Buleje Beauty»
 * (salón y cosmética capilar) para el negocio de PRUEBA `main`.
 *
 * Fuente única de dos scripts:
 *   · `generar-imagenes.mjs` dibuja un SVG original por producto en `public/demo/salon/`.
 *   · `sembrar.mjs` los crea en `main` por la API del panel (POST /api/v1/products)
 *     y, a los que tienen `antes`, les baja el precio con PUT: así el «antes» que
 *     muestra la página sale del historial de precios real, no de una cuenta.
 *
 * Marcas, líneas y textos son INVENTADOS (ninguna marca de terceros).
 */

/** Líneas propias: paleta del envase y del fondo de la foto. */
export const LINEAS = {
  "buleje-pro": {
    nombre: "Buleje Pro",
    fondo: ["#f7ece7", "#e9d3ca"],
    cuerpo: "#2b1d22",
    brillo: "#4d363d",
    tapa: "#c9a27e",
    etiqueta: "#ecd0bf",
    texto: "#f6e7dc",
  },
  "selva-botanica": {
    nombre: "Selva Botánica",
    fondo: ["#eff2e9", "#d5dfcb"],
    cuerpo: "#3e5a3d",
    brillo: "#5d7d5a",
    tapa: "#c8a96a",
    etiqueta: "#f4ecd9",
    texto: "#33492f",
  },
  "rizos-libres": {
    nombre: "Rizos Libres",
    fondo: ["#f9ebe1", "#efcdb8"],
    cuerpo: "#c4704f",
    brillo: "#d98d6c",
    tapa: "#2b2022",
    etiqueta: "#fbf0e7",
    texto: "#8a3d26",
  },
  "tono-studio": {
    nombre: "Tono Studio",
    fondo: ["#f2ebf4", "#dacbe5"],
    cuerpo: "#4d345f",
    brillo: "#6c5080",
    tapa: "#d9d3de",
    etiqueta: "#efe5f5",
    texto: "#f5ecfa",
  },
  "buleje-tools": {
    nombre: "Buleje Tools",
    fondo: ["#f4efec", "#e0d6d0"],
    cuerpo: "#262124",
    brillo: "#453d41",
    tapa: "#d4a48c",
    etiqueta: "#d4a48c",
    texto: "#f3e4dc",
  },
};

/**
 * Productos. `antes` = precio con el que se crea; `precio` = el de hoy (se baja
 * con PUT y queda en el historial). `forma` = qué envase dibuja el generador.
 */
export const PRODUCTOS = [
  // ── Shampoo ──
  { slug: "shampoo-reparacion-intensa", nombre: "Shampoo Reparación Intensa 300 ml", categoria: "Shampoo", linea: "buleje-pro", forma: "frasco", rotulo: ["Reparación", "Intensa"], sub: "Shampoo · 300 ml", antes: 54.9, precio: 43.9, badge: "-20%", stock: 42, descripcion: "Limpia sin resecar y repara la fibra dañada por planchas y decoloración. Con queratina vegetal." },
  { slug: "shampoo-sacha-inchi", nombre: "Shampoo Nutritivo Sacha Inchi 400 ml", categoria: "Shampoo", linea: "selva-botanica", forma: "dosificador", rotulo: ["Sacha Inchi", "Nutritivo"], sub: "Shampoo · 400 ml", precio: 42.9, badge: "Favorito", stock: 36, descripcion: "Omega 3 del sacha inchi amazónico para cabello seco y opaco. Sin sulfatos fuertes." },
  { slug: "shampoo-matizador-violeta", nombre: "Shampoo Matizador Violeta 300 ml", categoria: "Shampoo", linea: "tono-studio", forma: "frasco", rotulo: ["Matizador", "Violeta"], sub: "Shampoo · 300 ml", precio: 49.9, stock: 28, descripcion: "Neutraliza tonos amarillos en rubios, mechas y canas. Úsalo una o dos veces por semana." },
  { slug: "shampoo-rizos-definidos", nombre: "Shampoo Rizos Definidos sin sulfatos 350 ml", categoria: "Shampoo", linea: "rizos-libres", forma: "frasco", rotulo: ["Rizos", "Definidos"], sub: "Shampoo · 350 ml", precio: 46.9, badge: "Nuevo", stock: 30, descripcion: "Limpieza suave para rizos y ondas: respeta la forma y controla el frizz desde el lavado." },
  // ── Acondicionador ──
  { slug: "acondicionador-reparacion-intensa", nombre: "Acondicionador Reparación Intensa 250 ml", categoria: "Acondicionador", linea: "buleje-pro", forma: "tubo", rotulo: ["Reparación", "Intensa"], sub: "Acondicionador · 250 ml", precio: 56.9, stock: 34, descripcion: "Sella la cutícula y desenreda al instante. Complemento del shampoo Reparación Intensa." },
  { slug: "acondicionador-ungurahui", nombre: "Acondicionador Brillo Ungurahui 400 ml", categoria: "Acondicionador", linea: "selva-botanica", forma: "dosificador", rotulo: ["Ungurahui", "Brillo"], sub: "Acondicionador · 400 ml", precio: 44.9, stock: 26, descripcion: "Aceite de ungurahui de la selva para un brillo espejo y puntas suaves." },
  { slug: "acondicionador-rizos-elasticos", nombre: "Acondicionador Rizos Elásticos 350 ml", categoria: "Acondicionador", linea: "rizos-libres", forma: "tubo", rotulo: ["Rizos", "Elásticos"], sub: "Acondicionador · 350 ml", precio: 48.9, badge: "Nuevo", stock: 22, descripcion: "Hidrata y da elasticidad al rizo. Sirve también como co-wash." },
  // ── Tratamientos y mascarillas ──
  { slug: "mascarilla-reconstructora", nombre: "Mascarilla Reconstructora 500 g", categoria: "Tratamientos", linea: "buleje-pro", forma: "pote", rotulo: ["Reconstructora", ""], sub: "Mascarilla · 500 g", antes: 89.9, precio: 62.9, badge: "-30%", stock: 18, descripcion: "Tratamiento de salón para casa: reconstruye el cabello quebradizo en 10 minutos." },
  { slug: "mascarilla-aguaje", nombre: "Mascarilla Hidratación Profunda Aguaje 300 g", categoria: "Tratamientos", linea: "selva-botanica", forma: "pote", rotulo: ["Aguaje", "Hidratación"], sub: "Mascarilla · 300 g", antes: 64.9, precio: 51.9, badge: "-20%", stock: 24, descripcion: "Mantequilla de aguaje y aloe para cabello deshidratado por el sol y el calor." },
  { slug: "aceite-ungurahui", nombre: "Aceite Capilar Ungurahui 50 ml", categoria: "Tratamientos", linea: "selva-botanica", forma: "gotero", rotulo: ["Aceite", "Ungurahui"], sub: "Aceite · 50 ml", antes: 59.9, precio: 47.9, badge: "-20%", stock: 40, descripcion: "Unas gotas en medios y puntas: brillo, menos frizz y protección del calor." },
  { slug: "serum-puntas-selladas", nombre: "Sérum Puntas Selladas 60 ml", categoria: "Tratamientos", linea: "buleje-pro", forma: "gotero", rotulo: ["Puntas", "Selladas"], sub: "Sérum · 60 ml", precio: 52.9, badge: "Favorito", stock: 3, descripcion: "Sella las puntas abiertas y deja el cabello suelto y sedoso, sin efecto graso." },
  { slug: "ampollas-anticaida", nombre: "Ampollas Anticaída x 6", categoria: "Tratamientos", linea: "buleje-pro", forma: "ampollas", rotulo: ["Anticaída", ""], sub: "6 ampollas · 10 ml", precio: 74.9, stock: 15, descripcion: "Tratamiento intensivo de 6 semanas con cafeína y biotina para fortalecer la raíz." },
  // ── Coloración ──
  { slug: "tinte-castano-chocolate", nombre: "Tinte Permanente Castaño Chocolate 5.7", categoria: "Coloración", linea: "tono-studio", forma: "tubo", rotulo: ["Castaño", "Chocolate 5.7"], sub: "Tinte · 60 g", precio: 32.9, stock: 50, descripcion: "Color intenso y duradero con 100 % de cobertura de canas. Con aceite de argán." },
  { slug: "decolorante-blond-plus", nombre: "Decolorante en Polvo Blond+ 500 g", categoria: "Coloración", linea: "tono-studio", forma: "pote", rotulo: ["Blond+", "Decolorante"], sub: "Polvo · 500 g", antes: 79.9, precio: 55.9, badge: "-30%", stock: 20, descripcion: "Aclara hasta 8 tonos cuidando la fibra. Polvo azul que no vuela." },
  { slug: "oxidante-20-vol", nombre: "Oxidante en Crema 20 vol 1 L", categoria: "Coloración", linea: "tono-studio", forma: "aplicador", rotulo: ["Oxidante", "20 vol"], sub: "Crema · 1 L", precio: 29.9, stock: 45, descripcion: "Revelador cremoso y estable para tintes y decolorantes. Fácil de mezclar." },
  // ── Styling ──
  { slug: "crema-peinar-rizos", nombre: "Crema para Peinar Rizos 300 ml", categoria: "Styling", linea: "rizos-libres", forma: "tubo", rotulo: ["Crema", "para peinar"], sub: "Styling · 300 ml", precio: 39.9, badge: "Favorito", stock: 33, descripcion: "Define, da forma y controla el frizz todo el día, sin dejar el rizo duro." },
  { slug: "protector-termico", nombre: "Protector Térmico en Spray 200 ml", categoria: "Styling", linea: "buleje-pro", forma: "spray", rotulo: ["Protector", "Térmico"], sub: "Spray · 200 ml", precio: 45.9, stock: 38, descripcion: "Protege hasta 230 °C antes de la plancha o la secadora. Acabado liviano." },
  { slug: "laca-fijacion-flexible", nombre: "Laca Fijación Flexible 300 ml", categoria: "Styling", linea: "buleje-pro", forma: "spray", rotulo: ["Laca", "Flexible"], sub: "Fijación · 300 ml", precio: 34.9, stock: 27, descripcion: "Fija el peinado con movimiento natural y se quita con un cepillado." },
  // ── Herramientas ──
  { slug: "plancha-titanio-pro", nombre: "Plancha de Titanio Pro 230 °C", categoria: "Herramientas", linea: "buleje-tools", forma: "plancha", rotulo: ["Titanio Pro", ""], sub: "230 °C", precio: 289, badge: "Favorito", stock: 12, descripcion: "Placas de titanio flotantes, calor parejo y 5 temperaturas. Lista en 30 segundos." },
  { slug: "secadora-ionica-2200", nombre: "Secadora Iónica 2200 W", categoria: "Herramientas", linea: "buleje-tools", forma: "secadora", rotulo: ["Iónica", "2200 W"], sub: "2200 W", antes: 349, precio: 209, badge: "-40%", stock: 9, descripcion: "Seca más rápido con menos frizz. Motor profesional, 3 temperaturas y golpe de aire frío." },
  { slug: "cepillo-termico-43", nombre: "Cepillo Térmico Redondo 43 mm", categoria: "Herramientas", linea: "buleje-tools", forma: "cepillo", rotulo: ["Térmico", "43 mm"], sub: "43 mm", precio: 69.9, stock: 25, descripcion: "Tubo de cerámica que guarda el calor: brushing con volumen y puntas hacia adentro." },
  { slug: "rizador-conico", nombre: "Rizador Cónico 25-13 mm", categoria: "Herramientas", linea: "buleje-tools", forma: "rizador", rotulo: ["Cónico", "25-13 mm"], sub: "25-13 mm", precio: 219, stock: 10, descripcion: "Ondas sueltas o rizos definidos con un solo equipo. Incluye guante térmico." },
  // ── Kits ──
  { slug: "kit-reparacion-intensa", nombre: "Kit Reparación Intensa (shampoo + acondicionador + mascarilla)", categoria: "Kits", linea: "buleje-pro", forma: "kit", rotulo: ["Kit", "Reparación"], sub: "3 productos", antes: 179.9, precio: 125.9, badge: "-30%", stock: 14, descripcion: "La rutina completa de salón: shampoo 300 ml, acondicionador 250 ml y mascarilla 500 g." },
  { slug: "kit-selva-botanica", nombre: "Kit Brillo Natural Selva Botánica", categoria: "Kits", linea: "selva-botanica", forma: "kit", rotulo: ["Kit", "Brillo Natural"], sub: "3 productos", precio: 134.9, stock: 16, descripcion: "Shampoo sacha inchi, acondicionador ungurahui y aceite capilar en una caja para regalo." },
];

/** Servicios del salón (Product.type = "service"): se reservan por WhatsApp. */
export const SERVICIOS = [
  { slug: "servicio-corte-peinado", nombre: "Corte y peinado de autor", forma: "corte", precio: 45, duracion: "45 min", descripcion: "Diagnóstico, lavado, corte a tu medida y peinado final." },
  { slug: "servicio-brushing-ondas", nombre: "Brushing con ondas", forma: "brushing", precio: 35, duracion: "40 min", descripcion: "Lavado, protector térmico y brushing con ondas o liso pulido." },
  { slug: "servicio-tinte-completo", nombre: "Tinte completo con producto", forma: "tinte", precio: 120, duracion: "2 h", descripcion: "Color de raíz a puntas con Tono Studio, matizado y mascarilla." },
  { slug: "servicio-balayage", nombre: "Mechas balayage", forma: "balayage", precio: 280, duracion: "3 h 30 min", descripcion: "Aclarado a mano alzada, matiz a medida y tratamiento de enlace." },
  { slug: "servicio-keratina", nombre: "Alisado con keratina", forma: "keratina", precio: 220, duracion: "3 h", descripcion: "Liso, brillo y cero frizz hasta por 4 meses. Sin formol." },
  { slug: "servicio-ritual-hidratacion", nombre: "Ritual de hidratación Selva Botánica", forma: "hidratacion", precio: 65, duracion: "50 min", descripcion: "Mascarilla de aguaje, vapor y masaje capilar con aceite de ungurahui." },
  { slug: "servicio-manicure-semipermanente", nombre: "Manicure semipermanente", forma: "manicure", precio: 40, duracion: "1 h", descripcion: "Limado, cutícula y esmaltado semipermanente que dura hasta 3 semanas." },
  { slug: "servicio-pedicure-spa", nombre: "Pedicure spa", forma: "pedicure", precio: 50, duracion: "1 h 15 min", descripcion: "Baño de pies, exfoliación, hidratación y esmaltado." },
];

export const CATEGORIA_SERVICIOS = "Servicios de salón";
