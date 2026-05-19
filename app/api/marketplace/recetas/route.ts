/**
 * GET /api/marketplace/recetas
 *
 * Devuelve el recetario publico del marketplace con RESOLUCION cross-store
 * de cada ingrediente:
 *   - busca el ingrediente en StoreProducts de todas las tiendas publicadas
 *   - elige el mejor (precio mas bajo con stock > 0)
 *   - calcula si la receta es "cocinable hoy" (todos los ingredientes
 *     esenciales tienen al menos 1 tienda con stock)
 *
 * Filosofia: si la papa esta agotada, no tiene sentido mostrar Papa a la
 * Huancaina al cliente. Cuando alguna tienda vuelve a tener papa, la receta
 * se desbloquea sola (cache: 5 min).
 *
 * @cross-tenant intentional — agrega StoreProducts de todos los tenants.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { newTraceId } from "@/lib/api-error";

// ── Demo recipes (sembrados) ────────────────────────────────────────────────
//
// Esta lista es la misma fuente que /api/recetas/publicas demo, pero al estar
// aqui evitamos el filtro por tenantId que ese endpoint impone. La idea: las
// recetas son contenido publico del marketplace, los ingredientes se resuelven
// contra el catalogo cross-store.
type DemoIngrediente = {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  essential?: boolean;
};

type DemoReceta = {
  id: string;
  nombre: string;
  descripcion: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: "Facil" | "Media" | "Dificil";
  categoria: "Entradas" | "Platos de fondo" | "Sopas" | "Postres" | "Bebidas";
  videoUrl?: string | null;
  imageUrl?: string | null;
  pasos: string[];
  ingredientes: DemoIngrediente[];
};

const DEMO_RECETAS: DemoReceta[] = [
  {
    id: "demo-ceviche",
    nombre: "Ceviche Clasico",
    descripcion: "El plato bandera del Peru. Pescado fresco marinado en limon con cebolla morada, aji y cilantro. Perfecto para los dias calurosos de Pucallpa.",
    tiempoMinutos: 20, porciones: 4, dificultad: "Facil",
    categoria: "Entradas",
    videoUrl: "https://www.youtube.com/embed/TiSJGSPEfl8",
    imageUrl: null,
    pasos: [
      "Corta el pescado en cubos de 2 cm.",
      "Exprime los limones y mezcla con sal y pimienta.",
      "Corta la cebolla en juliana fina y enjuaga con agua fria.",
      "Mezcla el pescado con el jugo de limon (no mas de 2 minutos).",
      "Agrega cebolla, aji limo en rodajas y cilantro picado.",
      "Sirve inmediato con choclo, camote y yuyo.",
    ],
    ingredientes: [
      { nombre: "Pescado fresco", cantidad: 1, unidad: "kg", precio: 15, essential: true },
      { nombre: "Limones", cantidad: 10, unidad: "unidad", precio: 5, essential: true },
      { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3, essential: true },
      { nombre: "Aji Limo", cantidad: 3, unidad: "unidad", precio: 2 },
      { nombre: "Cilantro", cantidad: 1, unidad: "atado", precio: 1 },
    ],
  },
  {
    id: "demo-lomo-saltado",
    nombre: "Lomo Saltado",
    descripcion: "Fusion chifa peruana. Lomo de res salteado con tomate, cebolla y papas fritas. Servido con arroz blanco.",
    tiempoMinutos: 30, porciones: 4, dificultad: "Media",
    categoria: "Platos de fondo",
    videoUrl: "https://www.youtube.com/embed/AiMjSj0gZTw",
    imageUrl: null,
    pasos: [
      "Corta la carne en tiras gruesas.",
      "Calienta el wok con aceite a fuego alto.",
      "Sella la carne por 2 minutos y retira.",
      "Saltea cebolla y tomate 2 minutos.",
      "Agrega sillao, vinagre rojo y la carne.",
      "Sirve con arroz blanco y papas fritas calientes.",
    ],
    ingredientes: [
      { nombre: "Carne de Res", cantidad: 0.5, unidad: "kg", precio: 28, essential: true },
      { nombre: "Tomates Frescos", cantidad: 3, unidad: "unidad", precio: 3.5, essential: true },
      { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3, essential: true },
      { nombre: "Arroz Extra 5kg", cantidad: 1, unidad: "bolsa", precio: 22.5, essential: true },
      { nombre: "Aceite Vegetal 1L", cantidad: 1, unidad: "botella", precio: 9.9 },
      { nombre: "Sillao", cantidad: 1, unidad: "botella", precio: 4.5 },
    ],
  },
  {
    id: "demo-arroz-pollo",
    nombre: "Arroz con Pollo",
    descripcion: "Clasico de la cocina peruana. Arroz verde con pollo tierno, cerveza negra y culantro. El favorito de la familia.",
    tiempoMinutos: 45, porciones: 6, dificultad: "Media",
    categoria: "Platos de fondo",
    videoUrl: "https://www.youtube.com/embed/ZLt7XFwBKWc",
    imageUrl: null,
    pasos: [
      "Licua el culantro con la cerveza.",
      "Dora el pollo troceado en aceite caliente.",
      "Agrega la mezcla de culantro y deja reducir.",
      "Incorpora el arroz lavado y caldo.",
      "Agrega zanahoria y alverjitas.",
      "Cocina a fuego bajo 20 minutos hasta que el arroz seque.",
    ],
    ingredientes: [
      { nombre: "Arroz Extra 5kg", cantidad: 1, unidad: "bolsa", precio: 22.5, essential: true },
      { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12, essential: true },
      { nombre: "Cerveza Pack x6", cantidad: 1, unidad: "pack", precio: 18 },
      { nombre: "Zanahoria", cantidad: 2, unidad: "unidad", precio: 2.5 },
      { nombre: "Alverjitas", cantidad: 0.5, unidad: "kg", precio: 5 },
    ],
  },
  {
    id: "demo-aji-gallina",
    nombre: "Aji de Gallina",
    descripcion: "Clasico criollo. Pollo deshilachado en crema de aji amarillo con galletas, nueces y aceitunas.",
    tiempoMinutos: 45, porciones: 6, dificultad: "Media",
    categoria: "Platos de fondo",
    imageUrl: null,
    pasos: [
      "Sancoca el pollo y deshilachalo en tiras finas.",
      "Licua el aji amarillo con leche y galletas remojadas.",
      "Sofrie cebolla y ajo, agrega la crema de aji.",
      "Incorpora el pollo y cocina 10 minutos.",
      "Agrega nueces picadas y mezcla.",
      "Sirve sobre arroz con aceitunas y huevo duro.",
    ],
    ingredientes: [
      { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12, essential: true },
      { nombre: "Aji Amarillo", cantidad: 4, unidad: "unidad", precio: 3, essential: true },
      { nombre: "Galletas de Soda", cantidad: 1, unidad: "paquete", precio: 3.5, essential: true },
      { nombre: "Leche Gloria 1L", cantidad: 1, unidad: "lata", precio: 7 },
      { nombre: "Nueces", cantidad: 0.1, unidad: "kg", precio: 5 },
      { nombre: "Aceitunas", cantidad: 0.1, unidad: "kg", precio: 4 },
    ],
  },
  {
    id: "demo-papa-huancaina",
    nombre: "Papa a la Huancaina",
    descripcion: "Papas sancochadas banadas en salsa huancaina cremosa de aji amarillo y queso fresco.",
    tiempoMinutos: 15, porciones: 4, dificultad: "Facil",
    categoria: "Entradas",
    imageUrl: null,
    pasos: [
      "Sancoca las papas con sal hasta que esten tiernas.",
      "Licua el aji amarillo con queso fresco y leche.",
      "Agrega galletas para espesar la salsa.",
      "Pela las papas y cortalas en rodajas gruesas.",
      "Bana las papas con la salsa.",
      "Decora con aceitunas y huevo duro.",
    ],
    ingredientes: [
      { nombre: "Papa Blanca", cantidad: 1, unidad: "kg", precio: 4, essential: true },
      { nombre: "Aji Amarillo", cantidad: 3, unidad: "unidad", precio: 2.5, essential: true },
      { nombre: "Queso Fresco", cantidad: 0.25, unidad: "kg", precio: 5, essential: true },
      { nombre: "Leche Gloria 1L", cantidad: 0.5, unidad: "lata", precio: 3.5 },
      { nombre: "Galletas de Soda", cantidad: 0.5, unidad: "paquete", precio: 1.75 },
    ],
  },
  {
    id: "demo-causa",
    nombre: "Causa Limena",
    descripcion: "Entrada fria de papa amarilla prensada en capas con atun, palta y mayonesa.",
    tiempoMinutos: 20, porciones: 4, dificultad: "Facil",
    categoria: "Entradas",
    imageUrl: null,
    pasos: [
      "Sancoca las papas amarillas y prensar en caliente con aji amarillo y limon.",
      "Mezcla el atun con mayonesa y cebolla picada.",
      "Corta la palta en laminas delgadas.",
      "Arma capas: papa, atun, palta, papa.",
      "Presiona firme y refrigera 15 minutos.",
      "Desmolda y decora con mayonesa y aceituna.",
    ],
    ingredientes: [
      { nombre: "Papa Amarilla", cantidad: 1, unidad: "kg", precio: 5, essential: true },
      { nombre: "Atun en Lata", cantidad: 2, unidad: "lata", precio: 7, essential: true },
      { nombre: "Palta Hass", cantidad: 2, unidad: "unidad", precio: 5, essential: true },
      { nombre: "Mayonesa", cantidad: 1, unidad: "sobre", precio: 3.5 },
      { nombre: "Limones", cantidad: 4, unidad: "unidad", precio: 2 },
    ],
  },
  {
    id: "demo-tacacho",
    nombre: "Tacacho con Cecina",
    descripcion: "Plato iconico de la selva peruana y orgullo de Pucallpa. Platano verde machacado con manteca y cecina ahumada.",
    tiempoMinutos: 30, porciones: 4, dificultad: "Media",
    categoria: "Platos de fondo",
    imageUrl: null,
    pasos: [
      "Asa los platanos verdes con cascara hasta que esten blandos.",
      "Pela y machaca en batan o mortero.",
      "Agrega manteca poco a poco mientras machacas.",
      "Forma bolas medianas con las manos untadas de manteca.",
      "Asa la cecina y el chorizo hasta dorar.",
      "Sirve con ensalada de cebolla y limon.",
    ],
    ingredientes: [
      { nombre: "Platano Verde", cantidad: 6, unidad: "unidad", precio: 6, essential: true },
      { nombre: "Cecina de Cerdo", cantidad: 0.5, unidad: "kg", precio: 18, essential: true },
      { nombre: "Manteca de Cerdo", cantidad: 0.1, unidad: "kg", precio: 3, essential: true },
      { nombre: "Chorizo Regional", cantidad: 4, unidad: "unidad", precio: 8 },
      { nombre: "Cebolla Roja", cantidad: 1, unidad: "unidad", precio: 1.5 },
    ],
  },
  {
    id: "demo-chicha-morada",
    nombre: "Chicha Morada",
    descripcion: "Bebida refrescante emblematica del Peru. Maiz morado hervido con pina y especias.",
    tiempoMinutos: 40, porciones: 10, dificultad: "Facil",
    categoria: "Bebidas",
    imageUrl: null,
    pasos: [
      "Hierve 2 litros de agua con maiz morado, cascara de pina y canela.",
      "Cocina a fuego medio por 30 minutos.",
      "Cuela el liquido y descarta solidos.",
      "Agrega azucar caliente y disuelve bien.",
      "Deja enfriar a temperatura ambiente.",
      "Agrega jugo de limones y pina en cubitos. Refrigera.",
    ],
    ingredientes: [
      { nombre: "Maiz Morado", cantidad: 0.5, unidad: "kg", precio: 6, essential: true },
      { nombre: "Pina", cantidad: 1, unidad: "unidad", precio: 7, essential: true },
      { nombre: "Canela en Rama", cantidad: 2, unidad: "unidad", precio: 1.5 },
      { nombre: "Limones", cantidad: 4, unidad: "unidad", precio: 2 },
      { nombre: "Azucar", cantidad: 0.3, unidad: "kg", precio: 1.8 },
    ],
  },
  {
    id: "demo-arroz-chaufa",
    nombre: "Arroz Chaufa",
    descripcion: "Arroz frito chifa con pollo, huevo, sillao y cebolla china. Rapido y sabroso.",
    tiempoMinutos: 20, porciones: 4, dificultad: "Facil",
    categoria: "Platos de fondo",
    imageUrl: null,
    pasos: [
      "Cocina el arroz y dejalo enfriar.",
      "Corta el pollo en cubos y saltea en wok.",
      "Retira y prepara tortilla de huevo, corta en tiras.",
      "Saltea el arroz frio con aceite a fuego alto.",
      "Agrega sillao, pollo y huevo.",
      "Incorpora cebolla china al final. Sirve caliente.",
    ],
    ingredientes: [
      { nombre: "Arroz Extra 5kg", cantidad: 0.5, unidad: "bolsa", precio: 11.25, essential: true },
      { nombre: "Pollo Entero", cantidad: 0.5, unidad: "unidad", precio: 6, essential: true },
      { nombre: "Sillao", cantidad: 1, unidad: "botella", precio: 4.5, essential: true },
      { nombre: "Huevos", cantidad: 3, unidad: "unidad", precio: 3 },
      { nombre: "Cebolla China", cantidad: 1, unidad: "atado", precio: 1.5 },
    ],
  },
  {
    id: "demo-aguadito",
    nombre: "Aguadito de Pollo",
    descripcion: "Sopa espesa y reconfortante de pollo con culantro y arroz. Sabor de hogar.",
    tiempoMinutos: 40, porciones: 6, dificultad: "Facil",
    categoria: "Sopas",
    imageUrl: null,
    pasos: [
      "Hierve el pollo con sal, cebolla y apio por 25 minutos.",
      "Retira el pollo, desmenuza y reserva caldo.",
      "Licua culantro con caldo hasta obtener crema verde.",
      "Sofrie cebolla y ajo, agrega la crema.",
      "Incorpora caldo, arroz, zanahoria y alverjitas.",
      "Cocina 15 minutos. Agrega pollo y sirve.",
    ],
    ingredientes: [
      { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12, essential: true },
      { nombre: "Arroz Extra 5kg", cantidad: 0.3, unidad: "bolsa", precio: 6.75, essential: true },
      { nombre: "Culantro", cantidad: 2, unidad: "atado", precio: 2, essential: true },
      { nombre: "Zanahoria", cantidad: 2, unidad: "unidad", precio: 2.5 },
      { nombre: "Alverjitas", cantidad: 0.3, unidad: "kg", precio: 3 },
    ],
  },
];

// ── Name matching ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "y", "en", "del", "al",
  "kg", "g", "ml", "lt", "l", "unidad", "unidades", "pack", "botella",
  "fresco", "fresca", "extra", "x6", "x4", "1l", "5kg", "500ml",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function matchScore(ingredientName: string, productName: string): number {
  const ing = tokens(ingredientName);
  const prod = tokens(productName);
  if (ing.length === 0 || prod.length === 0) return 0;

  let common = 0;
  for (const t of ing) {
    if (prod.includes(t)) {
      common += 1;
    } else {
      // Match parcial: token del ingrediente aparece dentro de algun token del producto
      // (ej. "limon" dentro de "limones", "tomate" dentro de "tomates")
      for (const pt of prod) {
        if (pt.startsWith(t) || t.startsWith(pt)) {
          common += 0.7;
          break;
        }
      }
    }
  }
  return common / ing.length;
}

// ── Types de respuesta ──────────────────────────────────────────────────────

type StoreProductLite = {
  storeProductId: string;
  productId: number;
  productName: string;
  price: number;
  stock: number;
  image: string | null;
  unit: string;
  category: string;
  store: { slug: string; name: string };
};

type ResolvedIngredient = {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  essential: boolean;
  // Resuelto contra marketplace
  productoId: number | null;
  storeProductId: string | null;
  imagen: string | null;
  stock: number;
  categoria: string | null;
  availableInStores: number;
  bestPrice: number | null;
  bestStoreSlug: string | null;
  bestStoreName: string | null;
};

type ResolvedReceta = {
  id: string;
  nombre: string;
  descripcion: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: string;
  categoria: string;
  videoUrl: string | null;
  imageUrl: string | null;
  pasos: string[];
  ingredientes: ResolvedIngredient[];
  totalIngredientes: number;
  // Cocinabilidad
  cookable: boolean;
  availableCount: number;
  missingEssentials: string[];
};

// ── Handler ─────────────────────────────────────────────────────────────────

export async function GET() {
  const traceId = newTraceId();
  try {
    const data = await getOrSet("marketplace:recetas:v1", 300, async () => {
      // 1. Catalogo del marketplace (cross-store)
      const storeProducts = await prisma.storeProduct.findMany({
        where: {
          isActive: true,
          store: { isPublished: true, vacationMode: { not: true } },
        },
        select: {
          id: true,
          retailPrice: true,
          product: {
            select: { id: true, name: true, image: true, category: true, unit: true, stock: true },
          },
          store: { select: { slug: true, name: true } },
        },
        take: 5000, // sanidad: mas de 5k es un dataset muy grande para fuzzy match en memoria
      });

      const catalog: StoreProductLite[] = storeProducts
        .filter((sp) => sp.product != null && sp.store?.slug != null)
        .map((sp) => ({
          storeProductId: sp.id,
          productId: sp.product.id,
          productName: sp.product.name,
          price: toNumOrZero(sp.retailPrice),
          stock: sp.product.stock ?? 0,
          image: sp.product.image,
          unit: sp.product.unit,
          category: sp.product.category,
          store: { slug: sp.store!.slug!, name: sp.store!.name },
        }));

      // 2. Resolver cada receta
      const resolved: ResolvedReceta[] = DEMO_RECETAS.map((r) => {
        const ingredientes: ResolvedIngredient[] = r.ingredientes.map((ing) => {
          const candidates = catalog
            .map((sp) => ({ sp, score: matchScore(ing.nombre, sp.productName) }))
            .filter((c) => c.score >= 0.5)
            .sort((a, b) => {
              // Prioridad: score primero, luego stock > 0, luego precio asc
              if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
              const aStock = a.sp.stock > 0 ? 1 : 0;
              const bStock = b.sp.stock > 0 ? 1 : 0;
              if (aStock !== bStock) return bStock - aStock;
              return a.sp.price - b.sp.price;
            });

          const withStock = candidates.filter((c) => c.sp.stock > 0);
          const best = withStock[0] ?? null;

          return {
            nombre: ing.nombre,
            cantidad: ing.cantidad,
            unidad: ing.unidad,
            precio: best ? best.sp.price : ing.precio,
            essential: ing.essential === true,
            productoId: best?.sp.productId ?? null,
            storeProductId: best?.sp.storeProductId ?? null,
            imagen: best?.sp.image ?? null,
            stock: best?.sp.stock ?? 0,
            categoria: best?.sp.category ?? null,
            availableInStores: withStock.length,
            bestPrice: best?.sp.price ?? null,
            bestStoreSlug: best?.sp.store.slug ?? null,
            bestStoreName: best?.sp.store.name ?? null,
          };
        });

        const missingEssentials = ingredientes
          .filter((i) => i.essential && i.availableInStores === 0)
          .map((i) => i.nombre);

        const cookable = missingEssentials.length === 0;
        const availableCount = ingredientes.filter((i) => i.availableInStores > 0).length;

        const totalIngredientes = ingredientes.reduce(
          (s, i) => s + i.precio * i.cantidad,
          0,
        );

        return {
          id: r.id,
          nombre: r.nombre,
          descripcion: r.descripcion,
          tiempoMinutos: r.tiempoMinutos,
          porciones: r.porciones,
          dificultad: r.dificultad,
          categoria: r.categoria,
          videoUrl: r.videoUrl ?? null,
          imageUrl: r.imageUrl ?? null,
          pasos: r.pasos,
          ingredientes,
          totalIngredientes: Number(totalIngredientes.toFixed(2)),
          cookable,
          availableCount,
          missingEssentials,
        };
      });

      return {
        recetas: resolved,
        catalogSize: catalog.length,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (err) {
    logger.error("[marketplace/recetas] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    return NextResponse.json(
      { recetas: [], catalogSize: 0, updatedAt: new Date().toISOString(), traceId },
      { status: 200 }, // best-effort: front renderiza demo sin marketplace
    );
  }
}
