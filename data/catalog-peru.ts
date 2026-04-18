/**
 * Catálogo pre-cargado de ~200 productos típicos de bodegas peruanas.
 *
 * El 80% de bodegas peruanas venden los mismos SKUs base.
 * Precios en Soles (S/) actualizados para 2026.
 * Organizado por categoría con unidades estándar.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type CatalogProduct = {
  name: string;
  category: string;
  unit: string;
  suggestedPrice: number;
  barcode?: string;
};

// ── Categorías disponibles ───────────────────────────────────────────────────

export const CATALOG_CATEGORIES = [
  "Abarrotes",
  "Bebidas",
  "Limpieza",
  "Higiene Personal",
  "Snacks",
  "Lácteos y Frescos",
  "Panadería",
  "Otros",
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

// ── Catálogo completo ────────────────────────────────────────────────────────

export const catalogPeru: CatalogProduct[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ABARROTES (40)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Arroz Costeño 5kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 22.90 },
  { name: "Arroz Costeño 1kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 5.20 },
  { name: "Arroz Valle del Norte 5kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 19.90 },
  { name: "Azúcar Rubia Bell's 1kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 4.50 },
  { name: "Azúcar Rubia Bell's 5kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 21.50 },
  { name: "Azúcar Blanca Bell's 1kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 4.90 },
  { name: "Aceite Primor 1L", category: "Abarrotes", unit: "botella", suggestedPrice: 11.50 },
  { name: "Aceite Primor 500ml", category: "Abarrotes", unit: "botella", suggestedPrice: 6.50 },
  { name: "Aceite Cocinero 1L", category: "Abarrotes", unit: "botella", suggestedPrice: 10.90 },
  { name: "Fideos Don Vittorio Spaghetti 500g", category: "Abarrotes", unit: "paquete", suggestedPrice: 3.80 },
  { name: "Fideos Don Vittorio Tallarin 500g", category: "Abarrotes", unit: "paquete", suggestedPrice: 3.80 },
  { name: "Fideos Don Vittorio Tornillo 250g", category: "Abarrotes", unit: "paquete", suggestedPrice: 2.20 },
  { name: "Fideos Molitalia Cabello de Ángel 500g", category: "Abarrotes", unit: "paquete", suggestedPrice: 3.20 },
  { name: "Leche Gloria Evaporada 400g", category: "Abarrotes", unit: "lata", suggestedPrice: 4.80 },
  { name: "Leche Gloria Light 400g", category: "Abarrotes", unit: "lata", suggestedPrice: 4.90 },
  { name: "Leche Ideal Cremosita 400g", category: "Abarrotes", unit: "lata", suggestedPrice: 4.50 },
  { name: "Avena 3 Ositos 170g", category: "Abarrotes", unit: "bolsa", suggestedPrice: 2.50 },
  { name: "Avena 3 Ositos 600g", category: "Abarrotes", unit: "bolsa", suggestedPrice: 7.90 },
  { name: "Harina Blanca Flor 1kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 5.50 },
  { name: "Harina Preparada Blanca Flor 1kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 5.90 },
  { name: "Sal Marina Emsal 1kg", category: "Abarrotes", unit: "bolsa", suggestedPrice: 1.80 },
  { name: "Sal de Mesa Emsal 500g", category: "Abarrotes", unit: "bolsa", suggestedPrice: 1.20 },
  { name: "Vinagre Venturo 500ml", category: "Abarrotes", unit: "botella", suggestedPrice: 3.50 },
  { name: "Mayonesa Alacena 100g", category: "Abarrotes", unit: "sachet", suggestedPrice: 2.50 },
  { name: "Mayonesa Alacena 500g", category: "Abarrotes", unit: "doypack", suggestedPrice: 9.90 },
  { name: "Ketchup Alacena 100g", category: "Abarrotes", unit: "sachet", suggestedPrice: 2.00 },
  { name: "Mostaza Alacena 100g", category: "Abarrotes", unit: "sachet", suggestedPrice: 1.80 },
  { name: "Ají Tari Alacena 85g", category: "Abarrotes", unit: "sachet", suggestedPrice: 2.30 },
  { name: "Huancaína Alacena 85g", category: "Abarrotes", unit: "sachet", suggestedPrice: 2.50 },
  { name: "Atún Florida en Aceite 170g", category: "Abarrotes", unit: "lata", suggestedPrice: 7.50 },
  { name: "Atún A1 en Agua 170g", category: "Abarrotes", unit: "lata", suggestedPrice: 5.90 },
  { name: "Sardina Real en Salsa de Tomate 425g", category: "Abarrotes", unit: "lata", suggestedPrice: 5.50 },
  { name: "Café Altomayo Instantáneo 50g", category: "Abarrotes", unit: "frasco", suggestedPrice: 8.50 },
  { name: "Café Nescafé Tradición 50g", category: "Abarrotes", unit: "frasco", suggestedPrice: 12.50 },
  { name: "Té Herbi Manzanilla x25", category: "Abarrotes", unit: "caja", suggestedPrice: 2.80 },
  { name: "Té Herbi Anís x25", category: "Abarrotes", unit: "caja", suggestedPrice: 2.80 },
  { name: "Sillao Kikko 150ml", category: "Abarrotes", unit: "botella", suggestedPrice: 3.50 },
  { name: "Ajinomoto 100g", category: "Abarrotes", unit: "bolsa", suggestedPrice: 3.00 },
  { name: "Lentejas 500g", category: "Abarrotes", unit: "bolsa", suggestedPrice: 4.50 },
  { name: "Frejol Canario 500g", category: "Abarrotes", unit: "bolsa", suggestedPrice: 6.90 },

  // ═══════════════════════════════════════════════════════════════════════════
  // BEBIDAS (30)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Inca Kola 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 3.00 },
  { name: "Inca Kola 1.5L", category: "Bebidas", unit: "botella", suggestedPrice: 7.50 },
  { name: "Inca Kola 3L", category: "Bebidas", unit: "botella", suggestedPrice: 12.00 },
  { name: "Coca-Cola 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 3.00 },
  { name: "Coca-Cola 1.5L", category: "Bebidas", unit: "botella", suggestedPrice: 7.50 },
  { name: "Coca-Cola 3L", category: "Bebidas", unit: "botella", suggestedPrice: 12.00 },
  { name: "Sprite 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 2.80 },
  { name: "Fanta 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 2.80 },
  { name: "Agua San Luis 625ml", category: "Bebidas", unit: "botella", suggestedPrice: 1.50 },
  { name: "Agua San Luis 2.5L", category: "Bebidas", unit: "botella", suggestedPrice: 3.50 },
  { name: "Agua Cielo 625ml", category: "Bebidas", unit: "botella", suggestedPrice: 1.50 },
  { name: "Cifrut Naranja 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 2.00 },
  { name: "Cifrut Granadilla 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 2.00 },
  { name: "Sporade 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 3.50 },
  { name: "Gatorade 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 4.50 },
  { name: "Frugos Durazno 235ml", category: "Bebidas", unit: "caja", suggestedPrice: 1.80 },
  { name: "Frugos Mango 1L", category: "Bebidas", unit: "caja", suggestedPrice: 5.50 },
  { name: "Pulp Durazno 315ml", category: "Bebidas", unit: "botella", suggestedPrice: 2.00 },
  { name: "Cerveza Pilsen Callao 620ml", category: "Bebidas", unit: "botella", suggestedPrice: 7.50 },
  { name: "Cerveza Cusqueña Dorada 620ml", category: "Bebidas", unit: "botella", suggestedPrice: 8.50 },
  { name: "Cerveza Cristal 620ml", category: "Bebidas", unit: "botella", suggestedPrice: 7.00 },
  { name: "Cerveza Pilsen Lata 355ml", category: "Bebidas", unit: "lata", suggestedPrice: 4.50 },
  { name: "Cerveza Cusqueña Lata 355ml", category: "Bebidas", unit: "lata", suggestedPrice: 5.00 },
  { name: "Guaraná Backus 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 2.50 },
  { name: "Kola Real 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 1.80 },
  { name: "Kola Real 3L", category: "Bebidas", unit: "botella", suggestedPrice: 7.00 },
  { name: "Concordia Piña 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 1.50 },
  { name: "Powerade 500ml", category: "Bebidas", unit: "botella", suggestedPrice: 4.00 },
  { name: "Vino Tacama Gran Tinto 750ml", category: "Bebidas", unit: "botella", suggestedPrice: 28.00 },
  { name: "Ron Cartavio Blanco 750ml", category: "Bebidas", unit: "botella", suggestedPrice: 25.00 },

  // ═══════════════════════════════════════════════════════════════════════════
  // LIMPIEZA (25)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Detergente Ace 500g", category: "Limpieza", unit: "bolsa", suggestedPrice: 5.50 },
  { name: "Detergente Ace 2.6kg", category: "Limpieza", unit: "bolsa", suggestedPrice: 25.00 },
  { name: "Detergente Ariel 400g", category: "Limpieza", unit: "bolsa", suggestedPrice: 6.50 },
  { name: "Detergente Bolívar 500g", category: "Limpieza", unit: "bolsa", suggestedPrice: 5.00 },
  { name: "Detergente Marsella 500g", category: "Limpieza", unit: "bolsa", suggestedPrice: 4.50 },
  { name: "Jabón Bolívar Barra 240g", category: "Limpieza", unit: "barra", suggestedPrice: 3.50 },
  { name: "Lavavajilla Sapolio Limón 360g", category: "Limpieza", unit: "bolsa", suggestedPrice: 3.80 },
  { name: "Lavavajilla Ayudín 180g", category: "Limpieza", unit: "bolsa", suggestedPrice: 2.50 },
  { name: "Lejía Clorox 1L", category: "Limpieza", unit: "botella", suggestedPrice: 5.50 },
  { name: "Lejía Clorox 500ml", category: "Limpieza", unit: "botella", suggestedPrice: 3.20 },
  { name: "Limpiador Sapolio Multiusos 900ml", category: "Limpieza", unit: "botella", suggestedPrice: 6.50 },
  { name: "Limpiador Poett Lavanda 900ml", category: "Limpieza", unit: "botella", suggestedPrice: 7.00 },
  { name: "Papel Higiénico Scott x4", category: "Limpieza", unit: "paquete", suggestedPrice: 6.50 },
  { name: "Papel Higiénico Elite x4", category: "Limpieza", unit: "paquete", suggestedPrice: 8.50 },
  { name: "Papel Toalla Elite x1", category: "Limpieza", unit: "rollo", suggestedPrice: 4.50 },
  { name: "Suavizante Suavitel 500ml", category: "Limpieza", unit: "botella", suggestedPrice: 6.00 },
  { name: "Suavizante Downy 500ml", category: "Limpieza", unit: "botella", suggestedPrice: 7.50 },
  { name: "Insecticida Sapolio Mata Moscas 360ml", category: "Limpieza", unit: "spray", suggestedPrice: 9.50 },
  { name: "Esponja Scotch-Brite Verde", category: "Limpieza", unit: "unidad", suggestedPrice: 2.50 },
  { name: "Bolsa de Basura 75L x10", category: "Limpieza", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Trapeador Virutex", category: "Limpieza", unit: "unidad", suggestedPrice: 9.50 },
  { name: "Escoba Virutex", category: "Limpieza", unit: "unidad", suggestedPrice: 14.00 },
  { name: "Ambientador Glade Spray 400ml", category: "Limpieza", unit: "spray", suggestedPrice: 12.50 },
  { name: "Desinfectante Pinol 1L", category: "Limpieza", unit: "botella", suggestedPrice: 8.00 },
  { name: "Quitagrasa Sapolio 500ml", category: "Limpieza", unit: "spray", suggestedPrice: 7.50 },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIGIENE PERSONAL (20)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Jabón Protex Antibacterial 130g", category: "Higiene Personal", unit: "barra", suggestedPrice: 4.50 },
  { name: "Jabón Neko Antibacterial 125g", category: "Higiene Personal", unit: "barra", suggestedPrice: 3.80 },
  { name: "Jabón Camay 130g", category: "Higiene Personal", unit: "barra", suggestedPrice: 3.00 },
  { name: "Shampoo Head & Shoulders 375ml", category: "Higiene Personal", unit: "botella", suggestedPrice: 18.50 },
  { name: "Shampoo Pantene 400ml", category: "Higiene Personal", unit: "botella", suggestedPrice: 19.00 },
  { name: "Shampoo Sedal 340ml", category: "Higiene Personal", unit: "botella", suggestedPrice: 14.50 },
  { name: "Shampoo Sachet Head & Shoulders 10ml", category: "Higiene Personal", unit: "sachet", suggestedPrice: 1.00 },
  { name: "Pasta Dental Colgate Triple Acción 75ml", category: "Higiene Personal", unit: "tubo", suggestedPrice: 5.50 },
  { name: "Pasta Dental Colgate Máxima Protección 90g", category: "Higiene Personal", unit: "tubo", suggestedPrice: 7.00 },
  { name: "Cepillo Dental Colgate", category: "Higiene Personal", unit: "unidad", suggestedPrice: 4.00 },
  { name: "Desodorante Rexona Rollon 50ml", category: "Higiene Personal", unit: "unidad", suggestedPrice: 9.50 },
  { name: "Desodorante Old Spice Barra 50g", category: "Higiene Personal", unit: "unidad", suggestedPrice: 11.00 },
  { name: "Gillette Prestobarba x3", category: "Higiene Personal", unit: "paquete", suggestedPrice: 8.50 },
  { name: "Toallas Higiénicas Always x8", category: "Higiene Personal", unit: "paquete", suggestedPrice: 5.50 },
  { name: "Toallas Higiénicas Nosotras x10", category: "Higiene Personal", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Papel Higiénico Elite Triple Hoja x1", category: "Higiene Personal", unit: "rollo", suggestedPrice: 3.50 },
  { name: "Pañales Huggies Active Sec M x10", category: "Higiene Personal", unit: "paquete", suggestedPrice: 19.50 },
  { name: "Pañales Huggies Active Sec G x10", category: "Higiene Personal", unit: "paquete", suggestedPrice: 21.00 },
  { name: "Colonia Agua de Florida 270ml", category: "Higiene Personal", unit: "botella", suggestedPrice: 8.00 },
  { name: "Talco Mexana 150g", category: "Higiene Personal", unit: "frasco", suggestedPrice: 7.50 },

  // ═══════════════════════════════════════════════════════════════════════════
  // SNACKS (25)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Papitas Lays Clásica 42g", category: "Snacks", unit: "bolsa", suggestedPrice: 3.50 },
  { name: "Papitas Lays Clásica 130g", category: "Snacks", unit: "bolsa", suggestedPrice: 8.50 },
  { name: "Doritos 44g", category: "Snacks", unit: "bolsa", suggestedPrice: 3.50 },
  { name: "Cheetos Horneados 39g", category: "Snacks", unit: "bolsa", suggestedPrice: 2.50 },
  { name: "Chifles Karinto 45g", category: "Snacks", unit: "bolsa", suggestedPrice: 2.00 },
  { name: "Chifles Karinto 200g", category: "Snacks", unit: "bolsa", suggestedPrice: 7.50 },
  { name: "Galleta Casino Chocolate x6", category: "Snacks", unit: "paquete", suggestedPrice: 2.50 },
  { name: "Galleta Casino Fresa x6", category: "Snacks", unit: "paquete", suggestedPrice: 2.50 },
  { name: "Galleta Oreo x6", category: "Snacks", unit: "paquete", suggestedPrice: 3.50 },
  { name: "Galleta Soda Field x6", category: "Snacks", unit: "paquete", suggestedPrice: 2.00 },
  { name: "Galleta Margarita x6", category: "Snacks", unit: "paquete", suggestedPrice: 1.80 },
  { name: "Chocolate Sublime 30g", category: "Snacks", unit: "unidad", suggestedPrice: 2.50 },
  { name: "Chocolate Sublime Sonrisa 32g", category: "Snacks", unit: "unidad", suggestedPrice: 2.50 },
  { name: "Chocolate Cua Cua 20g", category: "Snacks", unit: "unidad", suggestedPrice: 1.50 },
  { name: "Chocolate Triángulo 30g", category: "Snacks", unit: "unidad", suggestedPrice: 2.00 },
  { name: "Caramelo Halls Mentol x9", category: "Snacks", unit: "paquete", suggestedPrice: 2.50 },
  { name: "Chicle Trident Menta x18", category: "Snacks", unit: "paquete", suggestedPrice: 3.00 },
  { name: "Gomitas Ambrosoli 100g", category: "Snacks", unit: "bolsa", suggestedPrice: 3.50 },
  { name: "Maní Molitalia 100g", category: "Snacks", unit: "bolsa", suggestedPrice: 3.50 },
  { name: "Nick Jr Galleta Animalitos 40g", category: "Snacks", unit: "bolsa", suggestedPrice: 1.50 },
  { name: "Wafer Tango 50g", category: "Snacks", unit: "paquete", suggestedPrice: 1.80 },
  { name: "Morocha 30g", category: "Snacks", unit: "unidad", suggestedPrice: 1.50 },
  { name: "Princesa 30g", category: "Snacks", unit: "unidad", suggestedPrice: 2.00 },
  { name: "Cereal Angel Flakes 200g", category: "Snacks", unit: "caja", suggestedPrice: 5.50 },
  { name: "Cereal Corn Flakes Ángel 500g", category: "Snacks", unit: "caja", suggestedPrice: 12.00 },

  // ═══════════════════════════════════════════════════════════════════════════
  // LÁCTEOS Y FRESCOS (20)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Yogurt Gloria Fresa 1L", category: "Lácteos y Frescos", unit: "botella", suggestedPrice: 7.50 },
  { name: "Yogurt Gloria Vainilla 1L", category: "Lácteos y Frescos", unit: "botella", suggestedPrice: 7.50 },
  { name: "Yogurt Gloria Durazno 200g", category: "Lácteos y Frescos", unit: "vaso", suggestedPrice: 2.50 },
  { name: "Yogurt Laive Fresa 1L", category: "Lácteos y Frescos", unit: "botella", suggestedPrice: 7.00 },
  { name: "Mantequilla Laive 200g", category: "Lácteos y Frescos", unit: "barra", suggestedPrice: 7.50 },
  { name: "Mantequilla Gloria 200g", category: "Lácteos y Frescos", unit: "barra", suggestedPrice: 7.00 },
  { name: "Margarina Sello de Oro 250g", category: "Lácteos y Frescos", unit: "pote", suggestedPrice: 4.50 },
  { name: "Queso Bonle Edam 200g", category: "Lácteos y Frescos", unit: "paquete", suggestedPrice: 9.50 },
  { name: "Queso Laive Parmesano Rallado 40g", category: "Lácteos y Frescos", unit: "sobre", suggestedPrice: 3.50 },
  { name: "Queso Fresco Serranita 400g", category: "Lácteos y Frescos", unit: "paquete", suggestedPrice: 12.00 },
  { name: "Huevos La Calera x15", category: "Lácteos y Frescos", unit: "bandeja", suggestedPrice: 9.50 },
  { name: "Huevos La Calera x30", category: "Lácteos y Frescos", unit: "bandeja", suggestedPrice: 18.00 },
  { name: "Huevos de Corral x6", category: "Lácteos y Frescos", unit: "bolsa", suggestedPrice: 6.50 },
  { name: "Leche Gloria UHT 1L", category: "Lácteos y Frescos", unit: "caja", suggestedPrice: 6.50 },
  { name: "Leche Laive UHT 1L", category: "Lácteos y Frescos", unit: "caja", suggestedPrice: 6.00 },
  { name: "Crema de Leche Nestlé 200ml", category: "Lácteos y Frescos", unit: "caja", suggestedPrice: 5.50 },
  { name: "Leche Condensada Nestlé 393g", category: "Lácteos y Frescos", unit: "lata", suggestedPrice: 6.50 },
  { name: "Manjar Blanco Nestlé 200g", category: "Lácteos y Frescos", unit: "doypack", suggestedPrice: 5.50 },
  { name: "Chicha Morada Naturale 1L", category: "Lácteos y Frescos", unit: "botella", suggestedPrice: 5.00 },
  { name: "Jugo de Naranja Laive 1L", category: "Lácteos y Frescos", unit: "caja", suggestedPrice: 5.50 },

  // ═══════════════════════════════════════════════════════════════════════════
  // PANADERÍA (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Pan de Molde Bimbo Blanco 480g", category: "Panadería", unit: "bolsa", suggestedPrice: 8.50 },
  { name: "Pan de Molde Bimbo Integral 480g", category: "Panadería", unit: "bolsa", suggestedPrice: 9.50 },
  { name: "Pan de Molde Bell's 350g", category: "Panadería", unit: "bolsa", suggestedPrice: 5.50 },
  { name: "Tostadas Bimbo x22", category: "Panadería", unit: "paquete", suggestedPrice: 5.50 },
  { name: "Pan Ciabatta x4", category: "Panadería", unit: "paquete", suggestedPrice: 4.50 },
  { name: "Keke Bimbo Mármol 200g", category: "Panadería", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Piononos Bimbo x6", category: "Panadería", unit: "paquete", suggestedPrice: 4.50 },
  { name: "Bizcocho Don Mamino 200g", category: "Panadería", unit: "paquete", suggestedPrice: 4.00 },
  { name: "Pan Francés (unidad)", category: "Panadería", unit: "unidad", suggestedPrice: 0.30 },
  { name: "Pan Hamburguesa x4", category: "Panadería", unit: "paquete", suggestedPrice: 5.50 },

  // ═══════════════════════════════════════════════════════════════════════════
  // OTROS (30)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Pilas Duracell AA x2", category: "Otros", unit: "paquete", suggestedPrice: 7.50 },
  { name: "Pilas Duracell AAA x2", category: "Otros", unit: "paquete", suggestedPrice: 7.50 },
  { name: "Pilas Energizer AA x2", category: "Otros", unit: "paquete", suggestedPrice: 8.00 },
  { name: "Fósforos Inti x10", category: "Otros", unit: "paquete", suggestedPrice: 1.50 },
  { name: "Encendedor BIC", category: "Otros", unit: "unidad", suggestedPrice: 3.50 },
  { name: "Velas Blancas x4", category: "Otros", unit: "paquete", suggestedPrice: 3.00 },
  { name: "Gas Balón 10kg", category: "Otros", unit: "balón", suggestedPrice: 48.00 },
  { name: "Carbón Vegetal 3kg", category: "Otros", unit: "bolsa", suggestedPrice: 8.50 },
  { name: "Bolsas Plásticas Pequeñas x100", category: "Otros", unit: "paquete", suggestedPrice: 3.00 },
  { name: "Bolsas Plásticas Medianas x100", category: "Otros", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Bolsas Plásticas Grandes x50", category: "Otros", unit: "paquete", suggestedPrice: 6.50 },
  { name: "Cinta Scotch 3M Transparente", category: "Otros", unit: "rollo", suggestedPrice: 3.50 },
  { name: "Pegamento La Gotita 3g", category: "Otros", unit: "unidad", suggestedPrice: 3.00 },
  { name: "Cuchillas Gillette x5", category: "Otros", unit: "paquete", suggestedPrice: 5.50 },
  { name: "Globos Surtidos x50", category: "Otros", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Cuaderno Justus A4 100 hojas", category: "Otros", unit: "unidad", suggestedPrice: 4.50 },
  { name: "Lapicero Faber Castell Azul", category: "Otros", unit: "unidad", suggestedPrice: 1.50 },
  { name: "Corrector Artesco", category: "Otros", unit: "unidad", suggestedPrice: 3.00 },
  { name: "Platos Descartables x25", category: "Otros", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Vasos Descartables 7oz x50", category: "Otros", unit: "paquete", suggestedPrice: 4.50 },
  { name: "Cubiertos Descartables x50", category: "Otros", unit: "paquete", suggestedPrice: 5.00 },
  { name: "Papel Aluminio 30cm x 7.5m", category: "Otros", unit: "rollo", suggestedPrice: 6.50 },
  { name: "Film Transparente 30m", category: "Otros", unit: "rollo", suggestedPrice: 5.50 },
  { name: "Guantes de Látex x100", category: "Otros", unit: "caja", suggestedPrice: 18.00 },
  { name: "Mascarillas Descartables x50", category: "Otros", unit: "caja", suggestedPrice: 12.00 },
  { name: "Alcohol 96° Alkofarma 250ml", category: "Otros", unit: "botella", suggestedPrice: 5.50 },
  { name: "Agua Oxigenada 120ml", category: "Otros", unit: "botella", suggestedPrice: 3.50 },
  { name: "Algodón 50g", category: "Otros", unit: "bolsa", suggestedPrice: 4.00 },
  { name: "Curitas Band-Aid x10", category: "Otros", unit: "caja", suggestedPrice: 4.50 },
  { name: "Recarga Claro/Movistar S/10", category: "Otros", unit: "unidad", suggestedPrice: 10.00 },
];
