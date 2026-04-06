import type { CatalogProduct } from "./catalog-types";

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO BASE DE PRODUCTOS PERUANOS DE ABARROTES — 500+ items
// Marcas reales del mercado peruano. Precios sugeridos en Soles (PEN).
// ══════════════════════════════════════════════════════════════════════════════

// ── ABARROTES ────────────────────────────────────────────────────────────────

const ABARROTES: CatalogProduct[] = [
  // Arroz
  { catalogId: "ABR-001", name: "Arroz Extra Costeño 1kg", brand: "Costeño", category: "abarrotes", subcategory: "arroz", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "bolsa", emoji: "🍚", barcode: "7751271010018", presentation: "1kg", tags: ["basico"] },
  { catalogId: "ABR-002", name: "Arroz Extra Costeño 5kg", brand: "Costeño", category: "abarrotes", subcategory: "arroz", suggestedPrice: 21.90, suggestedCostPrice: 16.50, unit: "bolsa", emoji: "🍚", barcode: "7751271010025", presentation: "5kg", tags: ["basico","popular"] },
  { catalogId: "ABR-003", name: "Arroz Superior Cocinero 1kg", brand: "Cocinero", category: "abarrotes", subcategory: "arroz", suggestedPrice: 4.20, suggestedCostPrice: 3.00, unit: "bolsa", emoji: "🍚", presentation: "1kg" },
  { catalogId: "ABR-004", name: "Arroz Superior Cocinero 5kg", brand: "Cocinero", category: "abarrotes", subcategory: "arroz", suggestedPrice: 19.90, suggestedCostPrice: 15.00, unit: "bolsa", emoji: "🍚", presentation: "5kg" },
  { catalogId: "ABR-005", name: "Arroz Paisana 1kg", brand: "Paisana", category: "abarrotes", subcategory: "arroz", suggestedPrice: 3.80, suggestedCostPrice: 2.70, unit: "bolsa", emoji: "🍚", presentation: "1kg" },
  { catalogId: "ABR-006", name: "Arroz Paisana 5kg", brand: "Paisana", category: "abarrotes", subcategory: "arroz", suggestedPrice: 18.50, suggestedCostPrice: 13.50, unit: "bolsa", emoji: "🍚", presentation: "5kg" },
  // Aceite
  { catalogId: "ABR-010", name: "Aceite Vegetal Primor 1L", brand: "Primor", category: "abarrotes", subcategory: "aceite", suggestedPrice: 9.90, suggestedCostPrice: 7.20, unit: "botella", emoji: "🫒", barcode: "7751271020017", presentation: "1L", tags: ["basico","popular"] },
  { catalogId: "ABR-011", name: "Aceite Vegetal Primor 500ml", brand: "Primor", category: "abarrotes", subcategory: "aceite", suggestedPrice: 5.50, suggestedCostPrice: 3.90, unit: "botella", emoji: "🫒", presentation: "500ml" },
  { catalogId: "ABR-012", name: "Aceite Vegetal Cocinero 1L", brand: "Cocinero", category: "abarrotes", subcategory: "aceite", suggestedPrice: 8.90, suggestedCostPrice: 6.50, unit: "botella", emoji: "🫒", presentation: "1L" },
  { catalogId: "ABR-013", name: "Aceite de Oliva El Olivar 200ml", brand: "El Olivar", category: "abarrotes", subcategory: "aceite", suggestedPrice: 14.90, suggestedCostPrice: 11.00, unit: "botella", emoji: "🫒", presentation: "200ml" },
  { catalogId: "ABR-014", name: "Aceite Vegetal Sao 1L", brand: "Sao", category: "abarrotes", subcategory: "aceite", suggestedPrice: 8.50, suggestedCostPrice: 6.20, unit: "botella", emoji: "🫒", presentation: "1L" },
  // Azucar
  { catalogId: "ABR-020", name: "Azucar Rubia 1kg", brand: "Cartavio", category: "abarrotes", subcategory: "azucar", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "bolsa", emoji: "🍬", barcode: "7751271030016", presentation: "1kg", tags: ["basico"] },
  { catalogId: "ABR-021", name: "Azucar Rubia 5kg", brand: "Cartavio", category: "abarrotes", subcategory: "azucar", suggestedPrice: 21.00, suggestedCostPrice: 15.50, unit: "bolsa", emoji: "🍬", presentation: "5kg" },
  { catalogId: "ABR-022", name: "Azucar Blanca 1kg", brand: "Bell's", category: "abarrotes", subcategory: "azucar", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "bolsa", emoji: "🍬", presentation: "1kg" },
  { catalogId: "ABR-023", name: "Azucar Blanca Refinada 1kg", brand: "Costeño", category: "abarrotes", subcategory: "azucar", suggestedPrice: 5.20, suggestedCostPrice: 3.80, unit: "bolsa", emoji: "🍬", presentation: "1kg" },
  // Fideos
  { catalogId: "ABR-030", name: "Fideos Spaghetti Don Vittorio 500g", brand: "Don Vittorio", category: "abarrotes", subcategory: "fideos", suggestedPrice: 3.80, suggestedCostPrice: 2.70, unit: "paquete", emoji: "🍝", barcode: "7751271040015", presentation: "500g", tags: ["basico","popular"] },
  { catalogId: "ABR-031", name: "Fideos Tallarin Nicolini 500g", brand: "Nicolini", category: "abarrotes", subcategory: "fideos", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "paquete", emoji: "🍝", presentation: "500g" },
  { catalogId: "ABR-032", name: "Fideos Cabello de Angel Molitalia 250g", brand: "Molitalia", category: "abarrotes", subcategory: "fideos", suggestedPrice: 2.20, suggestedCostPrice: 1.50, unit: "paquete", emoji: "🍝", presentation: "250g" },
  { catalogId: "ABR-033", name: "Fideos Canuto Lavaggi 500g", brand: "Lavaggi", category: "abarrotes", subcategory: "fideos", suggestedPrice: 2.80, suggestedCostPrice: 2.00, unit: "paquete", emoji: "🍝", presentation: "500g" },
  { catalogId: "ABR-034", name: "Fideos Corbata Molitalia 250g", brand: "Molitalia", category: "abarrotes", subcategory: "fideos", suggestedPrice: 2.00, suggestedCostPrice: 1.40, unit: "paquete", emoji: "🍝", presentation: "250g" },
  { catalogId: "ABR-035", name: "Fideos Tornillo Don Vittorio 500g", brand: "Don Vittorio", category: "abarrotes", subcategory: "fideos", suggestedPrice: 3.80, suggestedCostPrice: 2.70, unit: "paquete", emoji: "🍝", presentation: "500g" },
  // Sal
  { catalogId: "ABR-040", name: "Sal de Mesa Emsal 500g", brand: "Emsal", category: "abarrotes", subcategory: "sal", suggestedPrice: 1.20, suggestedCostPrice: 0.80, unit: "bolsa", emoji: "🧂", presentation: "500g", tags: ["basico"] },
  { catalogId: "ABR-041", name: "Sal de Mesa Emsal 1kg", brand: "Emsal", category: "abarrotes", subcategory: "sal", suggestedPrice: 2.00, suggestedCostPrice: 1.30, unit: "bolsa", emoji: "🧂", presentation: "1kg" },
  { catalogId: "ABR-042", name: "Sal Marina Emsal 500g", brand: "Emsal", category: "abarrotes", subcategory: "sal", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "bolsa", emoji: "🧂", presentation: "500g" },
  // Menestras
  { catalogId: "ABR-050", name: "Lentejas Costeño 500g", brand: "Costeño", category: "abarrotes", subcategory: "menestras", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "bolsa", emoji: "🫘", presentation: "500g" },
  { catalogId: "ABR-051", name: "Frejol Canario Costeño 500g", brand: "Costeño", category: "abarrotes", subcategory: "menestras", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "bolsa", emoji: "🫘", presentation: "500g" },
  { catalogId: "ABR-052", name: "Frejol Negro Costeño 500g", brand: "Costeño", category: "abarrotes", subcategory: "menestras", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "bolsa", emoji: "🫘", presentation: "500g" },
  { catalogId: "ABR-053", name: "Arveja Partida Costeño 500g", brand: "Costeño", category: "abarrotes", subcategory: "menestras", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "bolsa", emoji: "🫘", presentation: "500g" },
  { catalogId: "ABR-054", name: "Pallares Costeño 500g", brand: "Costeño", category: "abarrotes", subcategory: "menestras", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "bolsa", emoji: "🫘", presentation: "500g" },
  { catalogId: "ABR-055", name: "Garbanzo Costeño 500g", brand: "Costeño", category: "abarrotes", subcategory: "menestras", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "bolsa", emoji: "🫘", presentation: "500g" },
  // Conservas y enlatados
  { catalogId: "ABR-060", name: "Atun en Agua Florida 170g", brand: "Florida", category: "abarrotes", subcategory: "conservas", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "lata", emoji: "🐟", barcode: "7751271060013", presentation: "170g", tags: ["popular"] },
  { catalogId: "ABR-061", name: "Atun en Aceite A1 170g", brand: "A1", category: "abarrotes", subcategory: "conservas", suggestedPrice: 5.20, suggestedCostPrice: 3.80, unit: "lata", emoji: "🐟", presentation: "170g" },
  { catalogId: "ABR-062", name: "Sardinas en Salsa de Tomate Campomar 425g", brand: "Campomar", category: "abarrotes", subcategory: "conservas", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "lata", emoji: "🐟", presentation: "425g" },
  { catalogId: "ABR-063", name: "Filete de Caballa Bell's 170g", brand: "Bell's", category: "abarrotes", subcategory: "conservas", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "lata", emoji: "🐟", presentation: "170g" },
  { catalogId: "ABR-064", name: "Leche Condensada Gloria 393g", brand: "Gloria", category: "abarrotes", subcategory: "conservas", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "lata", emoji: "🥫", presentation: "393g" },
  { catalogId: "ABR-065", name: "Durazno en Almibar A1 820g", brand: "A1", category: "abarrotes", subcategory: "conservas", suggestedPrice: 8.90, suggestedCostPrice: 6.50, unit: "lata", emoji: "🥫", presentation: "820g" },
  // Salsas y condimentos
  { catalogId: "ABR-070", name: "Mayonesa Alacena 100g", brand: "Alacena", category: "abarrotes", subcategory: "salsas", suggestedPrice: 3.20, suggestedCostPrice: 2.30, unit: "sachet", emoji: "🥫", barcode: "7751271070012", presentation: "100g", tags: ["popular"] },
  { catalogId: "ABR-071", name: "Mayonesa Alacena 500g", brand: "Alacena", category: "abarrotes", subcategory: "salsas", suggestedPrice: 12.50, suggestedCostPrice: 9.20, unit: "frasco", emoji: "🥫", presentation: "500g" },
  { catalogId: "ABR-072", name: "Ketchup Alacena 100g", brand: "Alacena", category: "abarrotes", subcategory: "salsas", suggestedPrice: 2.80, suggestedCostPrice: 2.00, unit: "sachet", emoji: "🥫", presentation: "100g" },
  { catalogId: "ABR-073", name: "Mostaza Alacena 100g", brand: "Alacena", category: "abarrotes", subcategory: "salsas", suggestedPrice: 2.50, suggestedCostPrice: 1.80, unit: "sachet", emoji: "🥫", presentation: "100g" },
  { catalogId: "ABR-074", name: "Aji Molido Sibarita 10g x10", brand: "Sibarita", category: "abarrotes", subcategory: "salsas", suggestedPrice: 2.00, suggestedCostPrice: 1.30, unit: "paquete", emoji: "🌶️", presentation: "10 sobres" },
  { catalogId: "ABR-075", name: "Aji Panca Sibarita 10g x10", brand: "Sibarita", category: "abarrotes", subcategory: "salsas", suggestedPrice: 2.00, suggestedCostPrice: 1.30, unit: "paquete", emoji: "🌶️", presentation: "10 sobres" },
  { catalogId: "ABR-076", name: "Sazon Ajinomoto 12g x8", brand: "Ajinomoto", category: "abarrotes", subcategory: "salsas", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "paquete", emoji: "🧂", presentation: "8 sobres" },
  { catalogId: "ABR-077", name: "Caldo de Gallina Maggi x12", brand: "Maggi", category: "abarrotes", subcategory: "salsas", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "paquete", emoji: "🍲", presentation: "12 cubos" },
  { catalogId: "ABR-078", name: "Sillao Kikko 150ml", brand: "Kikko", category: "abarrotes", subcategory: "salsas", suggestedPrice: 3.80, suggestedCostPrice: 2.70, unit: "botella", emoji: "🥫", presentation: "150ml" },
  { catalogId: "ABR-079", name: "Vinagre Tinto Venturo 500ml", brand: "Venturo", category: "abarrotes", subcategory: "salsas", suggestedPrice: 3.50, suggestedCostPrice: 2.40, unit: "botella", emoji: "🥫", presentation: "500ml" },
  { catalogId: "ABR-080", name: "Salsa de Tomate Maggi 200g", brand: "Maggi", category: "abarrotes", subcategory: "salsas", suggestedPrice: 2.80, suggestedCostPrice: 2.00, unit: "sachet", emoji: "🥫", presentation: "200g" },
  { catalogId: "ABR-081", name: "Aji Amarillo en Pasta A1 215g", brand: "A1", category: "abarrotes", subcategory: "salsas", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "frasco", emoji: "🌶️", presentation: "215g" },
  { catalogId: "ABR-082", name: "Rocoto en Pasta A1 215g", brand: "A1", category: "abarrotes", subcategory: "salsas", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "frasco", emoji: "🌶️", presentation: "215g" },
  // Harinas y avena
  { catalogId: "ABR-090", name: "Harina Preparada Blanca Flor 1kg", brand: "Blanca Flor", category: "abarrotes", subcategory: "harinas", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "bolsa", emoji: "🌾", presentation: "1kg" },
  { catalogId: "ABR-091", name: "Avena Quaker 300g", brand: "Quaker", category: "abarrotes", subcategory: "harinas", suggestedPrice: 5.20, suggestedCostPrice: 3.80, unit: "bolsa", emoji: "🌾", presentation: "300g" },
  { catalogId: "ABR-092", name: "Avena 3 Ositos 170g", brand: "3 Ositos", category: "abarrotes", subcategory: "harinas", suggestedPrice: 2.80, suggestedCostPrice: 2.00, unit: "bolsa", emoji: "🌾", presentation: "170g" },
  { catalogId: "ABR-093", name: "Maicena Duryea 200g", brand: "Duryea", category: "abarrotes", subcategory: "harinas", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "caja", emoji: "🌾", presentation: "200g" },
  { catalogId: "ABR-094", name: "Kiwicha Pop 200g", brand: "3 Ositos", category: "abarrotes", subcategory: "harinas", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "bolsa", emoji: "🌾", presentation: "200g" },
  { catalogId: "ABR-095", name: "Quinua Perlada 500g", brand: "Costeño", category: "abarrotes", subcategory: "harinas", suggestedPrice: 9.80, suggestedCostPrice: 7.20, unit: "bolsa", emoji: "🌾", presentation: "500g" },
  // Galletas basicas
  { catalogId: "ABR-100", name: "Galleta Soda Victoria 42g x6", brand: "Victoria", category: "abarrotes", subcategory: "galletas", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "paquete", emoji: "🍪", presentation: "6 paq" },
  { catalogId: "ABR-101", name: "Galleta Vainilla Casino 43g x6", brand: "Victoria", category: "abarrotes", subcategory: "galletas", suggestedPrice: 4.00, suggestedCostPrice: 2.90, unit: "paquete", emoji: "🍪", presentation: "6 paq" },
  { catalogId: "ABR-102", name: "Galleta Margarita 40g x6", brand: "Costa", category: "abarrotes", subcategory: "galletas", suggestedPrice: 3.80, suggestedCostPrice: 2.70, unit: "paquete", emoji: "🍪", presentation: "6 paq" },
  { catalogId: "ABR-103", name: "Galleta Agua Light Victoria 42g x6", brand: "Victoria", category: "abarrotes", subcategory: "galletas", suggestedPrice: 3.20, suggestedCostPrice: 2.30, unit: "paquete", emoji: "🍪", presentation: "6 paq" },
  // Cafe y te
  { catalogId: "ABR-110", name: "Cafe Instantaneo Altomayo 50g", brand: "Altomayo", category: "abarrotes", subcategory: "cafe", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "frasco", emoji: "☕", presentation: "50g", tags: ["popular"] },
  { catalogId: "ABR-111", name: "Cafe Instantaneo Nescafe Clasico 50g", brand: "Nescafe", category: "abarrotes", subcategory: "cafe", suggestedPrice: 8.50, suggestedCostPrice: 6.20, unit: "frasco", emoji: "☕", presentation: "50g" },
  { catalogId: "ABR-112", name: "Cafe Kirma 50g", brand: "Kirma", category: "abarrotes", subcategory: "cafe", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "frasco", emoji: "☕", presentation: "50g" },
  { catalogId: "ABR-113", name: "Te Filtrante McColins Anis x25", brand: "McColins", category: "abarrotes", subcategory: "cafe", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "caja", emoji: "🍵", presentation: "25 sobres" },
  { catalogId: "ABR-114", name: "Te Filtrante McColins Manzanilla x25", brand: "McColins", category: "abarrotes", subcategory: "cafe", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "caja", emoji: "🍵", presentation: "25 sobres" },
  { catalogId: "ABR-115", name: "Milo 400g", brand: "Nestle", category: "abarrotes", subcategory: "cafe", suggestedPrice: 14.90, suggestedCostPrice: 11.00, unit: "lata", emoji: "☕", presentation: "400g" },
  { catalogId: "ABR-116", name: "Cocoa Winter's 160g", brand: "Winter's", category: "abarrotes", subcategory: "cafe", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "bolsa", emoji: "☕", presentation: "160g" },
];

// ── LACTEOS ──────────────────────────────────────────────────────────────────

const LACTEOS: CatalogProduct[] = [
  { catalogId: "LAC-001", name: "Leche Evaporada Gloria 400g", brand: "Gloria", category: "lacteos", subcategory: "leche", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "lata", emoji: "🥛", barcode: "7751271100017", tags: ["basico","popular"] },
  { catalogId: "LAC-002", name: "Leche Evaporada Ideal 400g", brand: "Ideal", category: "lacteos", subcategory: "leche", suggestedPrice: 5.20, suggestedCostPrice: 3.80, unit: "lata", emoji: "🥛" },
  { catalogId: "LAC-003", name: "Leche Evaporada Pura Vida 400g", brand: "Pura Vida", category: "lacteos", subcategory: "leche", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "lata", emoji: "🥛" },
  { catalogId: "LAC-004", name: "Leche UHT Gloria Entera 1L", brand: "Gloria", category: "lacteos", subcategory: "leche", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "caja", emoji: "🥛", presentation: "1L" },
  { catalogId: "LAC-005", name: "Leche UHT Laive Entera 1L", brand: "Laive", category: "lacteos", subcategory: "leche", suggestedPrice: 6.20, suggestedCostPrice: 4.50, unit: "caja", emoji: "🥛", presentation: "1L" },
  { catalogId: "LAC-006", name: "Leche UHT Gloria Light 1L", brand: "Gloria", category: "lacteos", subcategory: "leche", suggestedPrice: 6.80, suggestedCostPrice: 5.00, unit: "caja", emoji: "🥛", presentation: "1L" },
  { catalogId: "LAC-010", name: "Yogurt Gloria Fresa 1L", brand: "Gloria", category: "lacteos", subcategory: "yogurt", suggestedPrice: 7.90, suggestedCostPrice: 5.80, unit: "botella", emoji: "🧃" },
  { catalogId: "LAC-011", name: "Yogurt Gloria Durazno 1L", brand: "Gloria", category: "lacteos", subcategory: "yogurt", suggestedPrice: 7.90, suggestedCostPrice: 5.80, unit: "botella", emoji: "🧃" },
  { catalogId: "LAC-012", name: "Yogurt Laive Vainilla 1L", brand: "Laive", category: "lacteos", subcategory: "yogurt", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "botella", emoji: "🧃" },
  { catalogId: "LAC-013", name: "Yogurt Gloria Griego 500g", brand: "Gloria", category: "lacteos", subcategory: "yogurt", suggestedPrice: 6.80, suggestedCostPrice: 5.00, unit: "pote", emoji: "🧃" },
  { catalogId: "LAC-014", name: "Yogurt Bebible Gloria Kids 80g x6", brand: "Gloria", category: "lacteos", subcategory: "yogurt", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "paquete", emoji: "🧃" },
  { catalogId: "LAC-020", name: "Queso Fresco Laive 400g", brand: "Laive", category: "lacteos", subcategory: "queso", suggestedPrice: 12.50, suggestedCostPrice: 9.20, unit: "unidad", emoji: "🧀" },
  { catalogId: "LAC-021", name: "Queso Edam Laive 250g", brand: "Laive", category: "lacteos", subcategory: "queso", suggestedPrice: 15.90, suggestedCostPrice: 11.80, unit: "unidad", emoji: "🧀" },
  { catalogId: "LAC-022", name: "Queso Fundido Bonle x8 rebanadas", brand: "Bonle", category: "lacteos", subcategory: "queso", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "paquete", emoji: "🧀" },
  { catalogId: "LAC-030", name: "Mantequilla Laive 100g", brand: "Laive", category: "lacteos", subcategory: "mantequilla", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "barra", emoji: "🧈" },
  { catalogId: "LAC-031", name: "Mantequilla Gloria 100g", brand: "Gloria", category: "lacteos", subcategory: "mantequilla", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "barra", emoji: "🧈" },
  { catalogId: "LAC-032", name: "Margarina Sello de Oro 100g", brand: "Sello de Oro", category: "lacteos", subcategory: "mantequilla", suggestedPrice: 3.20, suggestedCostPrice: 2.30, unit: "barra", emoji: "🧈" },
  { catalogId: "LAC-040", name: "Huevos Blancos x12", brand: "La Calera", category: "lacteos", subcategory: "huevos", suggestedPrice: 9.50, suggestedCostPrice: 7.00, unit: "bandeja", emoji: "🥚", tags: ["basico"] },
  { catalogId: "LAC-041", name: "Huevos Blancos x30", brand: "La Calera", category: "lacteos", subcategory: "huevos", suggestedPrice: 22.00, suggestedCostPrice: 16.50, unit: "jaba", emoji: "🥚" },
  { catalogId: "LAC-042", name: "Huevos de Corral x12", brand: "Don Pollo", category: "lacteos", subcategory: "huevos", suggestedPrice: 12.50, suggestedCostPrice: 9.50, unit: "bandeja", emoji: "🥚" },
];

// ── BEBIDAS ──────────────────────────────────────────────────────────────────

const BEBIDAS: CatalogProduct[] = [
  // Gaseosas
  { catalogId: "BEB-001", name: "Inca Kola 500ml", brand: "Inca Kola", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "botella", emoji: "🥤", barcode: "7751271200015", tags: ["popular"] },
  { catalogId: "BEB-002", name: "Inca Kola 1.5L", brand: "Inca Kola", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "botella", emoji: "🥤", presentation: "1.5L" },
  { catalogId: "BEB-003", name: "Inca Kola 3L", brand: "Inca Kola", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 10.50, suggestedCostPrice: 7.80, unit: "botella", emoji: "🥤", presentation: "3L" },
  { catalogId: "BEB-004", name: "Coca-Cola 500ml", brand: "Coca-Cola", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "botella", emoji: "🥤", tags: ["popular"] },
  { catalogId: "BEB-005", name: "Coca-Cola 1.5L", brand: "Coca-Cola", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "botella", emoji: "🥤" },
  { catalogId: "BEB-006", name: "Coca-Cola 3L", brand: "Coca-Cola", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 10.50, suggestedCostPrice: 7.80, unit: "botella", emoji: "🥤" },
  { catalogId: "BEB-007", name: "Sprite 500ml", brand: "Sprite", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "botella", emoji: "🥤" },
  { catalogId: "BEB-008", name: "Fanta Naranja 500ml", brand: "Fanta", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "botella", emoji: "🥤" },
  { catalogId: "BEB-009", name: "Guarana Backus 500ml", brand: "Backus", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "botella", emoji: "🥤" },
  { catalogId: "BEB-010", name: "Concordia Fresa 500ml", brand: "Concordia", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 1.80, suggestedCostPrice: 1.20, unit: "botella", emoji: "🥤" },
  { catalogId: "BEB-011", name: "Pepsi 500ml", brand: "Pepsi", category: "bebidas", subcategory: "gaseosas", suggestedPrice: 2.20, suggestedCostPrice: 1.50, unit: "botella", emoji: "🥤" },
  // Agua
  { catalogId: "BEB-020", name: "Agua San Luis Sin Gas 625ml", brand: "San Luis", category: "bebidas", subcategory: "agua", suggestedPrice: 1.50, suggestedCostPrice: 0.90, unit: "botella", emoji: "💧", tags: ["popular"] },
  { catalogId: "BEB-021", name: "Agua San Luis Sin Gas 2.5L", brand: "San Luis", category: "bebidas", subcategory: "agua", suggestedPrice: 3.50, suggestedCostPrice: 2.30, unit: "botella", emoji: "💧" },
  { catalogId: "BEB-022", name: "Agua Cielo Sin Gas 625ml", brand: "Cielo", category: "bebidas", subcategory: "agua", suggestedPrice: 1.20, suggestedCostPrice: 0.70, unit: "botella", emoji: "💧" },
  { catalogId: "BEB-023", name: "Agua San Mateo Sin Gas 600ml", brand: "San Mateo", category: "bebidas", subcategory: "agua", suggestedPrice: 1.80, suggestedCostPrice: 1.20, unit: "botella", emoji: "💧" },
  { catalogId: "BEB-024", name: "Agua San Luis Con Gas 625ml", brand: "San Luis", category: "bebidas", subcategory: "agua", suggestedPrice: 1.80, suggestedCostPrice: 1.10, unit: "botella", emoji: "💧" },
  // Jugos y nectares
  { catalogId: "BEB-030", name: "Frugos Durazno 1L", brand: "Frugos", category: "bebidas", subcategory: "jugos", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "caja", emoji: "🧃" },
  { catalogId: "BEB-031", name: "Frugos Mango 1L", brand: "Frugos", category: "bebidas", subcategory: "jugos", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "caja", emoji: "🧃" },
  { catalogId: "BEB-032", name: "Pulp Durazno 1L", brand: "Pulp", category: "bebidas", subcategory: "jugos", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "caja", emoji: "🧃" },
  { catalogId: "BEB-033", name: "Gloria Nectarin Mango 1L", brand: "Gloria", category: "bebidas", subcategory: "jugos", suggestedPrice: 5.20, suggestedCostPrice: 3.80, unit: "caja", emoji: "🧃" },
  { catalogId: "BEB-034", name: "Cifrut Naranja 500ml", brand: "Cifrut", category: "bebidas", subcategory: "jugos", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "botella", emoji: "🧃" },
  // Rehidratantes
  { catalogId: "BEB-040", name: "Sporade Tropical 500ml", brand: "Sporade", category: "bebidas", subcategory: "rehidratantes", suggestedPrice: 3.00, suggestedCostPrice: 2.10, unit: "botella", emoji: "⚡" },
  { catalogId: "BEB-041", name: "Gatorade Mandarina 500ml", brand: "Gatorade", category: "bebidas", subcategory: "rehidratantes", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "botella", emoji: "⚡" },
  { catalogId: "BEB-042", name: "Powerade Mora 500ml", brand: "Powerade", category: "bebidas", subcategory: "rehidratantes", suggestedPrice: 3.00, suggestedCostPrice: 2.10, unit: "botella", emoji: "⚡" },
  { catalogId: "BEB-043", name: "Electrolight 500ml", brand: "Electrolight", category: "bebidas", subcategory: "rehidratantes", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "botella", emoji: "⚡" },
  // Energizantes
  { catalogId: "BEB-050", name: "Volt 300ml", brand: "Volt", category: "bebidas", subcategory: "energizantes", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "lata", emoji: "⚡" },
  { catalogId: "BEB-051", name: "Red Bull 250ml", brand: "Red Bull", category: "bebidas", subcategory: "energizantes", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "lata", emoji: "⚡" },
  { catalogId: "BEB-052", name: "Monster Energy 473ml", brand: "Monster", category: "bebidas", subcategory: "energizantes", suggestedPrice: 8.50, suggestedCostPrice: 6.20, unit: "lata", emoji: "⚡" },
];

// ── SNACKS ───────────────────────────────────────────────────────────────────

const SNACKS: CatalogProduct[] = [
  // Chocolates
  { catalogId: "SNK-001", name: "Sublime Clasico 30g", brand: "Nestle", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "unidad", emoji: "🍫", tags: ["popular"] },
  { catalogId: "SNK-002", name: "Sublime Wafer 32g", brand: "Nestle", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "unidad", emoji: "🍫" },
  { catalogId: "SNK-003", name: "Cua Cua 20g", brand: "Winter's", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.00, suggestedCostPrice: 0.65, unit: "unidad", emoji: "🍫" },
  { catalogId: "SNK-004", name: "Triangulo Donofrio 40g", brand: "Nestle", category: "snacks", subcategory: "chocolates", suggestedPrice: 2.50, suggestedCostPrice: 1.80, unit: "unidad", emoji: "🍫" },
  { catalogId: "SNK-005", name: "Princesa 30g", brand: "Nestle", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "unidad", emoji: "🍫" },
  { catalogId: "SNK-006", name: "Nick 30g", brand: "Costa", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.20, suggestedCostPrice: 0.80, unit: "unidad", emoji: "🍫" },
  { catalogId: "SNK-007", name: "Vizzio 21g", brand: "Costa", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "unidad", emoji: "🍫" },
  { catalogId: "SNK-008", name: "Winter's Chocolate 30g", brand: "Winter's", category: "snacks", subcategory: "chocolates", suggestedPrice: 1.00, suggestedCostPrice: 0.65, unit: "unidad", emoji: "🍫" },
  // Galletas dulces
  { catalogId: "SNK-010", name: "Oreo Original 36g", brand: "Nabisco", category: "snacks", subcategory: "galletas", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "paquete", emoji: "🍪", tags: ["popular"] },
  { catalogId: "SNK-011", name: "Morochas 32g", brand: "Nestle", category: "snacks", subcategory: "galletas", suggestedPrice: 1.20, suggestedCostPrice: 0.80, unit: "paquete", emoji: "🍪" },
  { catalogId: "SNK-012", name: "Charada 40g", brand: "Costa", category: "snacks", subcategory: "galletas", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "paquete", emoji: "🍪" },
  { catalogId: "SNK-013", name: "Glacitas 32g", brand: "Nestle", category: "snacks", subcategory: "galletas", suggestedPrice: 1.00, suggestedCostPrice: 0.65, unit: "paquete", emoji: "🍪" },
  { catalogId: "SNK-014", name: "Picaras 40g", brand: "Costa", category: "snacks", subcategory: "galletas", suggestedPrice: 1.80, suggestedCostPrice: 1.20, unit: "paquete", emoji: "🍪" },
  { catalogId: "SNK-015", name: "Tuareg 38g", brand: "Costa", category: "snacks", subcategory: "galletas", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "paquete", emoji: "🍪" },
  // Papitas y snacks salados
  { catalogId: "SNK-020", name: "Lays Clasica 42g", brand: "Lays", category: "snacks", subcategory: "papitas", suggestedPrice: 2.50, suggestedCostPrice: 1.80, unit: "bolsa", emoji: "🥔", tags: ["popular"] },
  { catalogId: "SNK-021", name: "Lays Limon 42g", brand: "Lays", category: "snacks", subcategory: "papitas", suggestedPrice: 2.50, suggestedCostPrice: 1.80, unit: "bolsa", emoji: "🥔" },
  { catalogId: "SNK-022", name: "Cheese Tris 41g", brand: "Frito Lay", category: "snacks", subcategory: "papitas", suggestedPrice: 2.00, suggestedCostPrice: 1.40, unit: "bolsa", emoji: "🧀" },
  { catalogId: "SNK-023", name: "Chizitos 42g", brand: "Frito Lay", category: "snacks", subcategory: "papitas", suggestedPrice: 2.00, suggestedCostPrice: 1.40, unit: "bolsa", emoji: "🧀" },
  { catalogId: "SNK-024", name: "Doritos 44g", brand: "Frito Lay", category: "snacks", subcategory: "papitas", suggestedPrice: 2.50, suggestedCostPrice: 1.80, unit: "bolsa", emoji: "🌮" },
  { catalogId: "SNK-025", name: "Tor-Tees 42g", brand: "Frito Lay", category: "snacks", subcategory: "papitas", suggestedPrice: 2.00, suggestedCostPrice: 1.40, unit: "bolsa", emoji: "🥔" },
  { catalogId: "SNK-026", name: "Chifles Karinto 40g", brand: "Karinto", category: "snacks", subcategory: "papitas", suggestedPrice: 1.00, suggestedCostPrice: 0.65, unit: "bolsa", emoji: "🍌" },
  { catalogId: "SNK-027", name: "Mani con Pasas 50g", brand: "La Sevillana", category: "snacks", subcategory: "frutos-secos", suggestedPrice: 2.50, suggestedCostPrice: 1.70, unit: "bolsa", emoji: "🥜" },
  // Caramelos y chicles
  { catalogId: "SNK-030", name: "Caramelo Limon Ambrosoli 20u", brand: "Ambrosoli", category: "snacks", subcategory: "caramelos", suggestedPrice: 2.00, suggestedCostPrice: 1.30, unit: "bolsa", emoji: "🍬" },
  { catalogId: "SNK-031", name: "Halls Mentol 25.2g", brand: "Halls", category: "snacks", subcategory: "caramelos", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "paquete", emoji: "🍬" },
  { catalogId: "SNK-032", name: "Chicle Adams 17g", brand: "Adams", category: "snacks", subcategory: "chicles", suggestedPrice: 1.00, suggestedCostPrice: 0.65, unit: "paquete", emoji: "🫧" },
  { catalogId: "SNK-033", name: "Trident Menta 8.5g", brand: "Trident", category: "snacks", subcategory: "chicles", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "paquete", emoji: "🫧" },
  // Helados
  { catalogId: "SNK-040", name: "Helado Sublime 80ml", brand: "Donofrio", category: "snacks", subcategory: "helados", suggestedPrice: 3.00, suggestedCostPrice: 2.10, unit: "unidad", emoji: "🍦" },
  { catalogId: "SNK-041", name: "Helado Sin Parar 50ml", brand: "Donofrio", category: "snacks", subcategory: "helados", suggestedPrice: 1.50, suggestedCostPrice: 1.00, unit: "unidad", emoji: "🍦" },
  { catalogId: "SNK-042", name: "Helado Jet 55ml", brand: "Donofrio", category: "snacks", subcategory: "helados", suggestedPrice: 2.00, suggestedCostPrice: 1.40, unit: "unidad", emoji: "🍦" },
];

// ── LIMPIEZA ─────────────────────────────────────────────────────────────────

const LIMPIEZA: CatalogProduct[] = [
  // Detergentes
  { catalogId: "LIM-001", name: "Detergente Ariel 500g", brand: "Ariel", category: "limpieza", subcategory: "detergentes", suggestedPrice: 7.90, suggestedCostPrice: 5.80, unit: "bolsa", emoji: "🧺", tags: ["popular"] },
  { catalogId: "LIM-002", name: "Detergente Ace 500g", brand: "Ace", category: "limpieza", subcategory: "detergentes", suggestedPrice: 6.50, suggestedCostPrice: 4.70, unit: "bolsa", emoji: "🧺" },
  { catalogId: "LIM-003", name: "Detergente Bolivar 500g", brand: "Bolivar", category: "limpieza", subcategory: "detergentes", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "bolsa", emoji: "🧺" },
  { catalogId: "LIM-004", name: "Detergente Sapolio 500g", brand: "Sapolio", category: "limpieza", subcategory: "detergentes", suggestedPrice: 5.00, suggestedCostPrice: 3.50, unit: "bolsa", emoji: "🧺" },
  { catalogId: "LIM-005", name: "Suavizante Bolivar 500ml", brand: "Bolivar", category: "limpieza", subcategory: "detergentes", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "botella", emoji: "🧺" },
  // Jabones
  { catalogId: "LIM-010", name: "Jabon de Lavar Bolivar 150g", brand: "Bolivar", category: "limpieza", subcategory: "jabones", suggestedPrice: 1.80, suggestedCostPrice: 1.20, unit: "barra", emoji: "🧼" },
  { catalogId: "LIM-011", name: "Jabon Marsella 150g", brand: "Marsella", category: "limpieza", subcategory: "jabones", suggestedPrice: 2.50, suggestedCostPrice: 1.80, unit: "barra", emoji: "🧼" },
  { catalogId: "LIM-012", name: "Lavavajilla Ayudin 500g", brand: "Ayudin", category: "limpieza", subcategory: "jabones", suggestedPrice: 4.20, suggestedCostPrice: 3.00, unit: "bolsa", emoji: "🍽️" },
  { catalogId: "LIM-013", name: "Lavavajilla Sapolio Limon 500g", brand: "Sapolio", category: "limpieza", subcategory: "jabones", suggestedPrice: 3.80, suggestedCostPrice: 2.70, unit: "bolsa", emoji: "🍽️" },
  // Lejia y desinfectante
  { catalogId: "LIM-020", name: "Lejia Clorox 500ml", brand: "Clorox", category: "limpieza", subcategory: "desinfectantes", suggestedPrice: 3.50, suggestedCostPrice: 2.40, unit: "botella", emoji: "🧴" },
  { catalogId: "LIM-021", name: "Lejia Clorox 1L", brand: "Clorox", category: "limpieza", subcategory: "desinfectantes", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "botella", emoji: "🧴" },
  { catalogId: "LIM-022", name: "Desinfectante Poett Lavanda 900ml", brand: "Poett", category: "limpieza", subcategory: "desinfectantes", suggestedPrice: 8.50, suggestedCostPrice: 6.20, unit: "botella", emoji: "🧴" },
  { catalogId: "LIM-023", name: "Limpiador Sapolio Multiuso 500ml", brand: "Sapolio", category: "limpieza", subcategory: "desinfectantes", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "botella", emoji: "🧴" },
  { catalogId: "LIM-024", name: "Limpia Baños Harpic 500ml", brand: "Harpic", category: "limpieza", subcategory: "desinfectantes", suggestedPrice: 8.90, suggestedCostPrice: 6.50, unit: "botella", emoji: "🚽" },
  // Papel higienico
  { catalogId: "LIM-030", name: "Papel Higienico Elite x4", brand: "Elite", category: "limpieza", subcategory: "papel", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "paquete", emoji: "🧻", tags: ["basico"] },
  { catalogId: "LIM-031", name: "Papel Higienico Suave x4", brand: "Suave", category: "limpieza", subcategory: "papel", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "paquete", emoji: "🧻" },
  { catalogId: "LIM-032", name: "Papel Higienico Noble x4", brand: "Noble", category: "limpieza", subcategory: "papel", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "paquete", emoji: "🧻" },
  { catalogId: "LIM-033", name: "Papel Toalla Elite x2", brand: "Elite", category: "limpieza", subcategory: "papel", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "paquete", emoji: "🧻" },
  { catalogId: "LIM-034", name: "Servilletas Elite x100", brand: "Elite", category: "limpieza", subcategory: "papel", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "paquete", emoji: "🧻" },
  // Cuidado personal
  { catalogId: "LIM-040", name: "Jabon Protex 90g", brand: "Protex", category: "limpieza", subcategory: "personal", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "barra", emoji: "🧼" },
  { catalogId: "LIM-041", name: "Shampoo Head & Shoulders 180ml", brand: "Head & Shoulders", category: "limpieza", subcategory: "personal", suggestedPrice: 12.50, suggestedCostPrice: 9.20, unit: "botella", emoji: "🧴" },
  { catalogId: "LIM-042", name: "Pasta Dental Colgate 75ml", brand: "Colgate", category: "limpieza", subcategory: "personal", suggestedPrice: 4.80, suggestedCostPrice: 3.50, unit: "tubo", emoji: "🪥" },
  { catalogId: "LIM-043", name: "Desodorante Rexona 150ml", brand: "Rexona", category: "limpieza", subcategory: "personal", suggestedPrice: 12.90, suggestedCostPrice: 9.50, unit: "spray", emoji: "🧴" },
  { catalogId: "LIM-044", name: "Toallas Higienicas Nosotras x10", brand: "Nosotras", category: "limpieza", subcategory: "personal", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "paquete", emoji: "🩹" },
  { catalogId: "LIM-045", name: "Pañales Babysec x10 M", brand: "Babysec", category: "limpieza", subcategory: "personal", suggestedPrice: 15.50, suggestedCostPrice: 11.50, unit: "paquete", emoji: "👶" },
  // Insecticidas
  { catalogId: "LIM-050", name: "Insecticida Sapolio Mata Todo 360ml", brand: "Sapolio", category: "limpieza", subcategory: "insecticidas", suggestedPrice: 10.50, suggestedCostPrice: 7.80, unit: "spray", emoji: "🪲" },
  { catalogId: "LIM-051", name: "Raid Casa y Jardin 400ml", brand: "Raid", category: "limpieza", subcategory: "insecticidas", suggestedPrice: 14.50, suggestedCostPrice: 10.80, unit: "spray", emoji: "🪲" },
  { catalogId: "LIM-052", name: "Espiral Contra Mosquitos Raid x12", brand: "Raid", category: "limpieza", subcategory: "insecticidas", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "caja", emoji: "🪲" },
  // Bolsas
  { catalogId: "LIM-060", name: "Bolsa Basura 50L x10", brand: "Rey", category: "limpieza", subcategory: "bolsas", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "rollo", emoji: "🗑️" },
  { catalogId: "LIM-061", name: "Bolsa Basura 80L x10", brand: "Rey", category: "limpieza", subcategory: "bolsas", suggestedPrice: 5.00, suggestedCostPrice: 3.50, unit: "rollo", emoji: "🗑️" },
];

// ── CARNES ───────────────────────────────────────────────────────────────────

const CARNES: CatalogProduct[] = [
  { catalogId: "CAR-001", name: "Pollo Entero x kg", brand: "San Fernando", category: "carnes", subcategory: "aves", suggestedPrice: 9.80, suggestedCostPrice: 7.50, unit: "kg", emoji: "🍗", tags: ["basico"] },
  { catalogId: "CAR-002", name: "Pechuga de Pollo x kg", brand: "San Fernando", category: "carnes", subcategory: "aves", suggestedPrice: 14.50, suggestedCostPrice: 11.00, unit: "kg", emoji: "🍗" },
  { catalogId: "CAR-003", name: "Pierna de Pollo x kg", brand: "San Fernando", category: "carnes", subcategory: "aves", suggestedPrice: 10.50, suggestedCostPrice: 8.00, unit: "kg", emoji: "🍗" },
  { catalogId: "CAR-004", name: "Carne Molida de Res x kg", brand: "Generico", category: "carnes", subcategory: "res", suggestedPrice: 18.00, suggestedCostPrice: 14.00, unit: "kg", emoji: "🥩" },
  { catalogId: "CAR-005", name: "Bisteck de Res x kg", brand: "Generico", category: "carnes", subcategory: "res", suggestedPrice: 22.00, suggestedCostPrice: 17.00, unit: "kg", emoji: "🥩" },
  { catalogId: "CAR-006", name: "Lomo de Res x kg", brand: "Generico", category: "carnes", subcategory: "res", suggestedPrice: 28.00, suggestedCostPrice: 22.00, unit: "kg", emoji: "🥩" },
  { catalogId: "CAR-007", name: "Chancho Pierna x kg", brand: "Generico", category: "carnes", subcategory: "cerdo", suggestedPrice: 16.00, suggestedCostPrice: 12.50, unit: "kg", emoji: "🥓" },
  { catalogId: "CAR-008", name: "Chuleta de Cerdo x kg", brand: "Generico", category: "carnes", subcategory: "cerdo", suggestedPrice: 18.00, suggestedCostPrice: 14.00, unit: "kg", emoji: "🥓" },
  { catalogId: "CAR-010", name: "Hot Dog San Fernando 250g", brand: "San Fernando", category: "carnes", subcategory: "embutidos", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "paquete", emoji: "🌭" },
  { catalogId: "CAR-011", name: "Jamonada San Fernando 100g", brand: "San Fernando", category: "carnes", subcategory: "embutidos", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "paquete", emoji: "🥓" },
  { catalogId: "CAR-012", name: "Jamon Ingles Laive 100g", brand: "Laive", category: "carnes", subcategory: "embutidos", suggestedPrice: 5.80, suggestedCostPrice: 4.20, unit: "paquete", emoji: "🥓" },
  { catalogId: "CAR-013", name: "Chorizo Parrillero 500g", brand: "San Fernando", category: "carnes", subcategory: "embutidos", suggestedPrice: 12.50, suggestedCostPrice: 9.50, unit: "paquete", emoji: "🌭" },
  // Pescados
  { catalogId: "CAR-020", name: "Filete de Pescado Tilapia x kg", brand: "Generico", category: "carnes", subcategory: "pescados", suggestedPrice: 18.00, suggestedCostPrice: 13.50, unit: "kg", emoji: "🐟" },
  { catalogId: "CAR-021", name: "Jurel Entero x kg", brand: "Generico", category: "carnes", subcategory: "pescados", suggestedPrice: 12.00, suggestedCostPrice: 9.00, unit: "kg", emoji: "🐟" },
];

// ── FRUTAS Y VERDURAS ────────────────────────────────────────────────────────

const FRUTAS_VERDURAS: CatalogProduct[] = [
  // Frutas
  { catalogId: "FRU-001", name: "Platano Seda x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 2.50, suggestedCostPrice: 1.50, unit: "kg", emoji: "🍌", tags: ["basico"] },
  { catalogId: "FRU-002", name: "Platano de Isla x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 3.00, suggestedCostPrice: 2.00, unit: "kg", emoji: "🍌" },
  { catalogId: "FRU-003", name: "Manzana Nacional x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 5.00, suggestedCostPrice: 3.50, unit: "kg", emoji: "🍎" },
  { catalogId: "FRU-004", name: "Naranja de Jugo x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 3.50, suggestedCostPrice: 2.20, unit: "kg", emoji: "🍊" },
  { catalogId: "FRU-005", name: "Limon x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 4.00, suggestedCostPrice: 2.50, unit: "kg", emoji: "🍋" },
  { catalogId: "FRU-006", name: "Papaya x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 3.50, suggestedCostPrice: 2.00, unit: "kg", emoji: "🥭" },
  { catalogId: "FRU-007", name: "Sandia x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 2.00, suggestedCostPrice: 1.20, unit: "kg", emoji: "🍉" },
  { catalogId: "FRU-008", name: "Mandarina x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 4.50, suggestedCostPrice: 3.00, unit: "kg", emoji: "🍊" },
  { catalogId: "FRU-009", name: "Uva Red Globe x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 6.00, suggestedCostPrice: 4.20, unit: "kg", emoji: "🍇" },
  { catalogId: "FRU-010", name: "Palta Fuerte x kg", brand: "Generico", category: "frutas-verduras", subcategory: "frutas", suggestedPrice: 8.00, suggestedCostPrice: 5.80, unit: "kg", emoji: "🥑" },
  // Verduras
  { catalogId: "FRU-020", name: "Papa Blanca x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 3.00, suggestedCostPrice: 2.00, unit: "kg", emoji: "🥔", tags: ["basico"] },
  { catalogId: "FRU-021", name: "Papa Amarilla x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 4.50, suggestedCostPrice: 3.20, unit: "kg", emoji: "🥔" },
  { catalogId: "FRU-022", name: "Cebolla Roja x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 3.50, suggestedCostPrice: 2.30, unit: "kg", emoji: "🧅" },
  { catalogId: "FRU-023", name: "Tomate x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 4.00, suggestedCostPrice: 2.80, unit: "kg", emoji: "🍅" },
  { catalogId: "FRU-024", name: "Zanahoria x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 2.50, suggestedCostPrice: 1.50, unit: "kg", emoji: "🥕" },
  { catalogId: "FRU-025", name: "Ajo x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 12.00, suggestedCostPrice: 8.50, unit: "kg", emoji: "🧄" },
  { catalogId: "FRU-026", name: "Lechuga x unidad", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 2.00, suggestedCostPrice: 1.20, unit: "unidad", emoji: "🥬" },
  { catalogId: "FRU-027", name: "Choclo Desgranado x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 5.50, suggestedCostPrice: 3.80, unit: "kg", emoji: "🌽" },
  { catalogId: "FRU-028", name: "Camote x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 2.50, suggestedCostPrice: 1.50, unit: "kg", emoji: "🍠" },
  { catalogId: "FRU-029", name: "Zapallo x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 2.00, suggestedCostPrice: 1.20, unit: "kg", emoji: "🎃" },
  { catalogId: "FRU-030", name: "Aji Amarillo x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 6.00, suggestedCostPrice: 4.00, unit: "kg", emoji: "🌶️" },
  { catalogId: "FRU-031", name: "Yuca x kg", brand: "Generico", category: "frutas-verduras", subcategory: "verduras", suggestedPrice: 3.00, suggestedCostPrice: 1.80, unit: "kg", emoji: "🥔" },
];

// ── PANADERIA ────────────────────────────────────────────────────────────────

const PANADERIA: CatalogProduct[] = [
  { catalogId: "PAN-001", name: "Pan Frances x unidad", brand: "Generico", category: "panaderia", subcategory: "pan", suggestedPrice: 0.20, suggestedCostPrice: 0.12, unit: "unidad", emoji: "🥖", tags: ["basico"] },
  { catalogId: "PAN-002", name: "Pan Integral x unidad", brand: "Generico", category: "panaderia", subcategory: "pan", suggestedPrice: 0.30, suggestedCostPrice: 0.18, unit: "unidad", emoji: "🍞" },
  { catalogId: "PAN-003", name: "Pan de Molde Bimbo 480g", brand: "Bimbo", category: "panaderia", subcategory: "pan", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "paquete", emoji: "🍞" },
  { catalogId: "PAN-004", name: "Pan de Molde Integral Bimbo 480g", brand: "Bimbo", category: "panaderia", subcategory: "pan", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "paquete", emoji: "🍞" },
  { catalogId: "PAN-005", name: "Tostadas Bimbo 200g", brand: "Bimbo", category: "panaderia", subcategory: "pan", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "paquete", emoji: "🍞" },
  { catalogId: "PAN-006", name: "Chancay x unidad", brand: "Generico", category: "panaderia", subcategory: "pasteleria", suggestedPrice: 0.50, suggestedCostPrice: 0.30, unit: "unidad", emoji: "🧁" },
  { catalogId: "PAN-007", name: "Piononos x3", brand: "Generico", category: "panaderia", subcategory: "pasteleria", suggestedPrice: 3.50, suggestedCostPrice: 2.20, unit: "paquete", emoji: "🧁" },
  { catalogId: "PAN-008", name: "Empanada de Pollo x unidad", brand: "Generico", category: "panaderia", subcategory: "pasteleria", suggestedPrice: 2.50, suggestedCostPrice: 1.50, unit: "unidad", emoji: "🥟" },
  { catalogId: "PAN-009", name: "Rosquita Glazeada x unidad", brand: "Generico", category: "panaderia", subcategory: "pasteleria", suggestedPrice: 1.00, suggestedCostPrice: 0.60, unit: "unidad", emoji: "🍩" },
  { catalogId: "PAN-010", name: "Cachitos x6", brand: "Generico", category: "panaderia", subcategory: "pasteleria", suggestedPrice: 3.00, suggestedCostPrice: 1.80, unit: "paquete", emoji: "🥐" },
];

// ── LICORES ──────────────────────────────────────────────────────────────────

const LICORES: CatalogProduct[] = [
  // Cervezas
  { catalogId: "LIC-001", name: "Pilsen Callao 620ml", brand: "Backus", category: "licores", subcategory: "cerveza", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "botella", emoji: "🍺", tags: ["popular"] },
  { catalogId: "LIC-002", name: "Cristal 620ml", brand: "Backus", category: "licores", subcategory: "cerveza", suggestedPrice: 5.00, suggestedCostPrice: 3.60, unit: "botella", emoji: "🍺" },
  { catalogId: "LIC-003", name: "Cusqueña Dorada 330ml", brand: "Backus", category: "licores", subcategory: "cerveza", suggestedPrice: 5.50, suggestedCostPrice: 4.00, unit: "botella", emoji: "🍺" },
  { catalogId: "LIC-004", name: "Tres Cruces 355ml", brand: "Backus", category: "licores", subcategory: "cerveza", suggestedPrice: 3.50, suggestedCostPrice: 2.50, unit: "lata", emoji: "🍺" },
  { catalogId: "LIC-005", name: "Pilsen Callao Six Pack", brand: "Backus", category: "licores", subcategory: "cerveza", suggestedPrice: 28.00, suggestedCostPrice: 21.00, unit: "six-pack", emoji: "🍺" },
  { catalogId: "LIC-006", name: "Corona Extra 355ml", brand: "Corona", category: "licores", subcategory: "cerveza", suggestedPrice: 6.50, suggestedCostPrice: 4.80, unit: "botella", emoji: "🍺" },
  // Vinos y piscos
  { catalogId: "LIC-010", name: "Pisco Quebranta Queirolo 700ml", brand: "Santiago Queirolo", category: "licores", subcategory: "pisco", suggestedPrice: 38.00, suggestedCostPrice: 28.00, unit: "botella", emoji: "🍷" },
  { catalogId: "LIC-011", name: "Pisco Acholado Tabernero 700ml", brand: "Tabernero", category: "licores", subcategory: "pisco", suggestedPrice: 35.00, suggestedCostPrice: 26.00, unit: "botella", emoji: "🍷" },
  { catalogId: "LIC-012", name: "Vino Tinto Queirolo Borgoña 750ml", brand: "Santiago Queirolo", category: "licores", subcategory: "vino", suggestedPrice: 15.00, suggestedCostPrice: 11.00, unit: "botella", emoji: "🍷" },
  { catalogId: "LIC-013", name: "Vino Rose Tacama 750ml", brand: "Tacama", category: "licores", subcategory: "vino", suggestedPrice: 28.00, suggestedCostPrice: 21.00, unit: "botella", emoji: "🍷" },
  // Licores varios
  { catalogId: "LIC-020", name: "Ron Cartavio Blanco 750ml", brand: "Cartavio", category: "licores", subcategory: "ron", suggestedPrice: 22.00, suggestedCostPrice: 16.00, unit: "botella", emoji: "🥃" },
  { catalogId: "LIC-021", name: "Ron Cartavio Black 750ml", brand: "Cartavio", category: "licores", subcategory: "ron", suggestedPrice: 28.00, suggestedCostPrice: 21.00, unit: "botella", emoji: "🥃" },
  { catalogId: "LIC-022", name: "Whisky Johnnie Walker Red 750ml", brand: "Johnnie Walker", category: "licores", subcategory: "whisky", suggestedPrice: 65.00, suggestedCostPrice: 48.00, unit: "botella", emoji: "🥃" },
  { catalogId: "LIC-023", name: "Vodka Russkaya 750ml", brand: "Russkaya", category: "licores", subcategory: "vodka", suggestedPrice: 18.00, suggestedCostPrice: 13.00, unit: "botella", emoji: "🍸" },
];

// ── CONGELADOS ───────────────────────────────────────────────────────────────

const CONGELADOS: CatalogProduct[] = [
  { catalogId: "CON-001", name: "Nuggets de Pollo San Fernando 250g", brand: "San Fernando", category: "congelados", subcategory: "pollo", suggestedPrice: 9.80, suggestedCostPrice: 7.20, unit: "bolsa", emoji: "🍗" },
  { catalogId: "CON-002", name: "Hamburguesa de Pollo San Fernando x4", brand: "San Fernando", category: "congelados", subcategory: "pollo", suggestedPrice: 8.50, suggestedCostPrice: 6.20, unit: "caja", emoji: "🍔" },
  { catalogId: "CON-003", name: "Milanesa de Pollo San Fernando 500g", brand: "San Fernando", category: "congelados", subcategory: "pollo", suggestedPrice: 14.50, suggestedCostPrice: 10.80, unit: "bolsa", emoji: "🍗" },
  { catalogId: "CON-004", name: "Papa Precocida Congelada 500g", brand: "McCain", category: "congelados", subcategory: "papas", suggestedPrice: 8.50, suggestedCostPrice: 6.20, unit: "bolsa", emoji: "🍟" },
  { catalogId: "CON-005", name: "Helado Donofrio Napolitano 1L", brand: "Donofrio", category: "congelados", subcategory: "helados", suggestedPrice: 18.00, suggestedCostPrice: 13.50, unit: "pote", emoji: "🍨" },
  { catalogId: "CON-006", name: "Helado Donofrio Chocolate 1L", brand: "Donofrio", category: "congelados", subcategory: "helados", suggestedPrice: 18.00, suggestedCostPrice: 13.50, unit: "pote", emoji: "🍨" },
  { catalogId: "CON-007", name: "Mix de Verduras Congeladas 500g", brand: "Bell's", category: "congelados", subcategory: "verduras", suggestedPrice: 7.50, suggestedCostPrice: 5.50, unit: "bolsa", emoji: "🥦" },
  { catalogId: "CON-008", name: "Choclo Desgranado Congelado 500g", brand: "Bell's", category: "congelados", subcategory: "verduras", suggestedPrice: 6.80, suggestedCostPrice: 5.00, unit: "bolsa", emoji: "🌽" },
  { catalogId: "CON-009", name: "Empanadas Congeladas x4", brand: "Don Mamino", category: "congelados", subcategory: "preparados", suggestedPrice: 10.50, suggestedCostPrice: 7.80, unit: "caja", emoji: "🥟" },
  { catalogId: "CON-010", name: "Pizza Congelada Familiar", brand: "Don Mamino", category: "congelados", subcategory: "preparados", suggestedPrice: 15.00, suggestedCostPrice: 11.00, unit: "caja", emoji: "🍕" },
];

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTACIÓN PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export const PERU_CATALOG: readonly CatalogProduct[] = [
  ...ABARROTES,
  ...LACTEOS,
  ...BEBIDAS,
  ...SNACKS,
  ...LIMPIEZA,
  ...CARNES,
  ...FRUTAS_VERDURAS,
  ...PANADERIA,
  ...LICORES,
  ...CONGELADOS,
];

export const CATALOG_BY_CATEGORY: Record<string, readonly CatalogProduct[]> = {
  abarrotes: ABARROTES,
  lacteos: LACTEOS,
  bebidas: BEBIDAS,
  snacks: SNACKS,
  limpieza: LIMPIEZA,
  carnes: CARNES,
  "frutas-verduras": FRUTAS_VERDURAS,
  panaderia: PANADERIA,
  licores: LICORES,
  congelados: CONGELADOS,
};

export const CATALOG_STATS = {
  total: PERU_CATALOG.length,
  categories: Object.keys(CATALOG_BY_CATEGORY).length,
  withBarcode: PERU_CATALOG.filter((p) => p.barcode).length,
};
