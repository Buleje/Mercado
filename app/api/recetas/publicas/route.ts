import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(req: NextRequest) {
  try {
    // SECURITY 2026-05-06 (pentest H10): scope por tenantId. Antes este
    // endpoint público devolvía TODAS las recetas activas de TODOS los
    // tenants con costos+ingredientes+proveedores → fuga competitiva.
    const tenantIdHeader = req.headers.get("x-tenant-id");
    if (!tenantIdHeader || tenantIdHeader === "main") {
      return NextResponse.json({ recetas: [] });
    }
    const tenantId = tenantIdHeader;

    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") ?? undefined;

    // 1. Check for admin-managed recetario entries (Notes with title "__RECETARIO__")
    try {
      const recetarioNotes = await prisma.note.findMany({
        where: {
          tenantId,
          title: "__RECETARIO__",
          ...(search ? { content: { contains: search, mode: "insensitive" as const } } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      if (recetarioNotes.length > 0) {
        const parsed = recetarioNotes
          .map(n => {
            try { return JSON.parse(n.content); } catch { return null; }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null && r.activa !== false);

        if (parsed.length > 0) {
          if (search) {
            const s = search.toLowerCase();
            return NextResponse.json(parsed.filter((r: { nombre?: string }) => r.nombre?.toLowerCase().includes(s)));
          }
          return NextResponse.json(parsed);
        }
      }
    } catch {
      // Notes table might not exist, continue to Receta model
    }

    // 2. Try Receta model (production recetas)
    const recetas = await prisma.receta.findMany({
      where: {
        tenantId,
        activa: true,
        ...(search ? { nombre: { contains: search, mode: "insensitive" as const } } : {}),
      },
      include: {
        ingredientes: {
          include: {
            producto: {
              select: { id: true, name: true, price: true, image: true, stock: true, category: true }
            }
          }
        },
        producto: {
          select: { id: true, name: true, price: true, image: true }
        }
      },
      orderBy: { createdAt: "desc" },
    });

    if (recetas.length > 0) {
      const result = recetas.map(r => ({
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        emoji: r.emoji,
        tiempoMinutos: r.tiempoMinutos,
        porciones: r.porciones,
        dificultad: r.dificultad,
        categoria: r.categoria,
        imageUrl: r.imageUrl,
        costoTotal: Number(r.costoTotal),
        productoFinal: r.producto ? {
          id: r.producto.id,
          nombre: r.producto.name,
          precio: r.producto.price,
          imagen: r.producto.image,
        } : null,
        // TD-018: ing.producto.price es Decimal
        ingredientes: r.ingredientes.map(ing => ({
          id: ing.id,
          productoId: ing.producto?.id,
          nombre: ing.producto?.name || "Ingrediente",
          cantidad: Number(ing.cantidad),
          unidad: ing.unidad,
          precio: toNumOrZero(ing.producto?.price),
          imagen: ing.producto?.image,
          stock: ing.producto?.stock || 0,
          categoria: ing.producto?.category,
        })),
        totalIngredientes: r.ingredientes.reduce((sum, ing) =>
          sum + toNumOrZero(ing.producto?.price) * Number(ing.cantidad), 0
        ),
      }));
      return NextResponse.json(result);
    }

    // 3. Fallback to demo recetas
    const demo = getRecetasDemo();
    if (search) {
      const s = search.toLowerCase();
      return NextResponse.json(demo.filter(r => r.nombre.toLowerCase().includes(s)));
    }
    return NextResponse.json(demo);
  } catch {
    // Si la tabla no existe o hay error, retornar recetas demo
    return NextResponse.json(getRecetasDemo());
  }
}

// Category color mappings for visual placeholders
const DEMO_COLORS: Record<string, { from: string; to: string }> = {
  "Entradas": { from: "#60a5fa", to: "#06b6d4" },
  "Platos de fondo": { from: "#f97316", to: "#ef4444" },
  "Postres": { from: "#f472b6", to: "#a855f7" },
  "Bebidas": { from: "#facc15", to: "#f59e0b" },
  "Sopas": { from: "#4ade80", to: "#2dd4bf" },
};

// Recetas demo peruanas (se usan si no hay datos en DB)
function getRecetasDemo() {
  return [
    {
      id: "demo-1",
      nombre: "Ceviche Clasico",
      descripcion: "El plato bandera del Peru. Pescado fresco marinado en limon con cebolla morada, aji y cilantro. Perfecto para los dias calurosos de Pucallpa.",
      emoji: "\uD83D\uDC1F",
      tiempoMinutos: 20,
      porciones: 4,
      dificultad: "Facil",
      videoUrl: "https://www.youtube.com/embed/TiSJGSPEfl8",
      categoria: "Entradas",
      colorFrom: DEMO_COLORS["Entradas"].from,
      colorTo: DEMO_COLORS["Entradas"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Pescado fresco", cantidad: 1, unidad: "kg", precio: 15.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Limones", cantidad: 10, unidad: "unidad", precio: 5.00, imagen: null, stock: 50, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3.00, imagen: null, stock: 30, productoId: null },
        { nombre: "Aji Limo", cantidad: 3, unidad: "unidad", precio: 2.00, imagen: null, stock: 20, productoId: null },
        { nombre: "Cilantro", cantidad: 1, unidad: "atado", precio: 1.00, imagen: null, stock: 15, productoId: null },
      ],
      totalIngredientes: 26.00,
      pasos: [
        "Corta el pescado en cubos de 2cm",
        "Exprime los limones y mezcla con sal",
        "Corta la cebolla en juliana fina",
        "Mezcla el pescado con el jugo de limon",
        "Agrega cebolla, aji y cilantro",
        "Deja reposar 5 minutos y sirve"
      ]
    },
    {
      id: "demo-2",
      nombre: "Lomo Saltado",
      descripcion: "Fusion chifa peruana. Lomo de res salteado con tomate, cebolla y papas fritas. Servido con arroz blanco.",
      emoji: "\uD83E\uDD69",
      tiempoMinutos: 30,
      porciones: 4,
      dificultad: "Media",
      videoUrl: "https://www.youtube.com/embed/AiMjSj0gZTw",
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Carne de Res", cantidad: 0.5, unidad: "kg", precio: 28.00, imagen: null, stock: 5, productoId: null },
        { nombre: "Tomates Frescos", cantidad: 3, unidad: "unidad", precio: 3.50, imagen: null, stock: 25, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3.00, imagen: null, stock: 30, productoId: null },
        { nombre: "Arroz Extra 5kg", cantidad: 1, unidad: "bolsa", precio: 22.50, imagen: null, stock: 10, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 1, unidad: "botella", precio: 9.90, imagen: null, stock: 15, productoId: null },
        { nombre: "Sillao", cantidad: 1, unidad: "botella", precio: 4.50, imagen: null, stock: 8, productoId: null },
      ],
      totalIngredientes: 71.40,
      pasos: [
        "Corta la carne en tiras gruesas",
        "Calienta el wok con aceite a fuego alto",
        "Sella la carne por 2 minutos, retira",
        "Saltea cebolla y tomate 2 minutos",
        "Agrega sillao, vinagre y la carne",
        "Sirve con arroz y papas fritas"
      ]
    },
    {
      id: "demo-3",
      nombre: "Arroz con Pollo",
      descripcion: "Clasico de la cocina peruana. Arroz verde con pollo tierno, cerveza negra y culantro. El favorito de la familia.",
      emoji: "\uD83C\uDF57",
      tiempoMinutos: 45,
      porciones: 6,
      dificultad: "Media",
      videoUrl: "https://www.youtube.com/embed/ZLt7XFwBKWc",
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Arroz Extra 5kg", cantidad: 1, unidad: "bolsa", precio: 22.50, imagen: null, stock: 10, productoId: null },
        { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Cerveza Pack x6", cantidad: 1, unidad: "pack", precio: 18.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Zanahoria", cantidad: 2, unidad: "unidad", precio: 2.50, imagen: null, stock: 20, productoId: null },
        { nombre: "Alverjitas", cantidad: 0.5, unidad: "kg", precio: 5.00, imagen: null, stock: 10, productoId: null },
      ],
      totalIngredientes: 60.00,
      pasos: [
        "Licua el culantro con la cerveza",
        "Dora el pollo troceado en aceite",
        "Agrega la mezcla de culantro",
        "Incorpora el arroz lavado",
        "Agrega zanahoria y alverjitas",
        "Cocina a fuego bajo 20 minutos"
      ]
    },
    {
      id: "demo-4",
      nombre: "Ensalada Fresca",
      descripcion: "Ensalada ligera con palta, tomate y aceite de oliva. Ideal para acompanar cualquier plato o como entrada.",
      emoji: "\uD83E\uDD57",
      tiempoMinutos: 10,
      porciones: 2,
      dificultad: "Facil",
      videoUrl: null,
      categoria: "Entradas",
      colorFrom: DEMO_COLORS["Entradas"].from,
      colorTo: DEMO_COLORS["Entradas"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Tomates Frescos", cantidad: 3, unidad: "unidad", precio: 3.50, imagen: null, stock: 25, productoId: null },
        { nombre: "Palta Hass", cantidad: 2, unidad: "unidad", precio: 5.00, imagen: null, stock: 15, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 1, unidad: "botella", precio: 9.90, imagen: null, stock: 15, productoId: null },
      ],
      totalIngredientes: 18.40,
      pasos: [
        "Corta los tomates en rodajas",
        "Pela y corta la palta en cubos",
        "Mezcla todo con aceite y sal",
        "Sirve frio"
      ]
    },
    {
      id: "demo-5",
      nombre: "Chicharron de Pollo",
      descripcion: "Pollo marinado en ajo y sillao, empanizado y frito hasta dorar. Crujiente por fuera, jugoso por dentro.",
      emoji: "\uD83C\uDF57",
      tiempoMinutos: 35,
      porciones: 4,
      dificultad: "Facil",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 1, unidad: "botella", precio: 9.90, imagen: null, stock: 15, productoId: null },
        { nombre: "Limones", cantidad: 5, unidad: "unidad", precio: 2.50, imagen: null, stock: 50, productoId: null },
      ],
      totalIngredientes: 24.40,
      pasos: [
        "Marina el pollo troceado con ajo, sillao y limon (1 hora)",
        "Empaniza con harina y pan molido",
        "Frie en aceite caliente hasta dorar",
        "Sirve con ensalada y limon"
      ]
    },
    {
      id: "demo-6",
      nombre: "Juane de Arroz",
      descripcion: "Plato emblematico de la selva peruana. Arroz con pollo envuelto en hoja de bijao. Sabor de Pucallpa!",
      emoji: "\uD83C\uDF3F",
      tiempoMinutos: 60,
      porciones: 6,
      dificultad: "Dificil",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Arroz Extra 5kg", cantidad: 1, unidad: "bolsa", precio: 22.50, imagen: null, stock: 10, productoId: null },
        { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 1, unidad: "botella", precio: 9.90, imagen: null, stock: 15, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3.00, imagen: null, stock: 30, productoId: null },
      ],
      totalIngredientes: 47.40,
      pasos: [
        "Cocina el arroz con curcuma y aceitunas",
        "Sancoca el pollo y desmenuza",
        "Mezcla arroz con pollo y huevo batido",
        "Envuelve en hojas de bijao",
        "Hierve los juanes por 1 hora",
        "Sirve caliente con aji de cocona"
      ]
    },
    {
      id: "demo-7",
      nombre: "Aji de Gallina",
      descripcion: "Clasico criollo peruano. Pollo deshilachado en crema de aji amarillo con galletas, nueces y aceitunas. Un plato reconfortante perfecto para el almuerzo familiar en Pucallpa.",
      emoji: "\uD83D\uDC14",
      tiempoMinutos: 45,
      porciones: 6,
      dificultad: "Media",
      videoUrl: "https://www.youtube.com/embed/yElWMwYJHRA",
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Aji Amarillo", cantidad: 4, unidad: "unidad", precio: 3.00, imagen: null, stock: 20, productoId: null },
        { nombre: "Galletas de Soda", cantidad: 1, unidad: "paquete", precio: 3.50, imagen: null, stock: 25, productoId: null },
        { nombre: "Leche Gloria 1L", cantidad: 1, unidad: "lata", precio: 7.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Nueces", cantidad: 0.1, unidad: "kg", precio: 5.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Aceitunas", cantidad: 0.1, unidad: "kg", precio: 4.00, imagen: null, stock: 10, productoId: null },
      ],
      totalIngredientes: 34.50,
      pasos: [
        "Sancoca el pollo y deshilachalo en tiras finas",
        "Licua el aji amarillo con la leche y las galletas remojadas",
        "Sofrie cebolla y ajo, agrega la crema de aji",
        "Incorpora el pollo deshilachado y cocina 10 minutos",
        "Agrega las nueces picadas y mezcla bien",
        "Sirve sobre arroz blanco con aceitunas y huevo duro",
        "Decora con perejil fresco picado"
      ]
    },
    {
      id: "demo-8",
      nombre: "Papa a la Huancaina",
      descripcion: "Entrada clasica peruana. Papas sancochadas banadas en salsa huancaina cremosa de aji amarillo y queso fresco. Facil y deliciosa para cualquier ocasion.",
      emoji: "\uD83E\uDD54",
      tiempoMinutos: 15,
      porciones: 4,
      dificultad: "Facil",
      videoUrl: "https://www.youtube.com/embed/p8VL8dYemWU",
      categoria: "Entradas",
      colorFrom: DEMO_COLORS["Entradas"].from,
      colorTo: DEMO_COLORS["Entradas"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Papa Blanca", cantidad: 1, unidad: "kg", precio: 4.00, imagen: null, stock: 30, productoId: null },
        { nombre: "Aji Amarillo", cantidad: 3, unidad: "unidad", precio: 2.50, imagen: null, stock: 20, productoId: null },
        { nombre: "Queso Fresco", cantidad: 0.25, unidad: "kg", precio: 5.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Leche Gloria 1L", cantidad: 0.5, unidad: "lata", precio: 3.50, imagen: null, stock: 12, productoId: null },
        { nombre: "Galletas de Soda", cantidad: 0.5, unidad: "paquete", precio: 1.75, imagen: null, stock: 25, productoId: null },
      ],
      totalIngredientes: 16.75,
      pasos: [
        "Sancoca las papas con sal hasta que esten tiernas",
        "Licua el aji amarillo sin venas con queso fresco y leche",
        "Agrega las galletas remojadas para espesar la salsa",
        "Pela las papas y cortalas en rodajas gruesas",
        "Bana las papas con la salsa huancaina",
        "Decora con aceitunas y huevo duro partido"
      ]
    },
    {
      id: "demo-9",
      nombre: "Causa Limena",
      descripcion: "Entrada fria y elegante de la costa peruana. Papa amarilla prensada en capas con atun, palta y mayonesa. Perfecta como entrada o plato ligero para los dias de calor.",
      emoji: "\uD83E\uDD51",
      tiempoMinutos: 20,
      porciones: 4,
      dificultad: "Facil",
      videoUrl: "https://www.youtube.com/embed/CXNxKJfMjJE",
      categoria: "Entradas",
      colorFrom: DEMO_COLORS["Entradas"].from,
      colorTo: DEMO_COLORS["Entradas"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Papa Amarilla", cantidad: 1, unidad: "kg", precio: 5.00, imagen: null, stock: 20, productoId: null },
        { nombre: "Atun en Lata", cantidad: 2, unidad: "lata", precio: 7.00, imagen: null, stock: 15, productoId: null },
        { nombre: "Palta Hass", cantidad: 2, unidad: "unidad", precio: 5.00, imagen: null, stock: 15, productoId: null },
        { nombre: "Mayonesa", cantidad: 1, unidad: "sobre", precio: 3.50, imagen: null, stock: 20, productoId: null },
        { nombre: "Limones", cantidad: 4, unidad: "unidad", precio: 2.00, imagen: null, stock: 50, productoId: null },
      ],
      totalIngredientes: 22.50,
      pasos: [
        "Sancoca las papas amarillas y prensar en caliente con aji amarillo y limon",
        "Mezcla el atun con mayonesa y cebolla picada finamente",
        "Corta la palta en laminas delgadas",
        "Arma capas: papa, atun, palta, papa",
        "Presiona firmemente y refrigera 15 minutos",
        "Desmolda y decora con mayonesa y aceituna"
      ]
    },
    {
      id: "demo-10",
      nombre: "Tacu Tacu",
      descripcion: "Plato criollo hecho con arroz y frijoles del dia anterior, refritos hasta formar una tortilla crujiente. En Pucallpa se acompana con lomo saltado o huevo frito.",
      emoji: "\uD83E\uDED8",
      tiempoMinutos: 25,
      porciones: 4,
      dificultad: "Media",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Arroz Extra 5kg", cantidad: 0.5, unidad: "bolsa", precio: 11.25, imagen: null, stock: 10, productoId: null },
        { nombre: "Frijoles Canario", cantidad: 0.5, unidad: "kg", precio: 6.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 1, unidad: "unidad", precio: 1.50, imagen: null, stock: 30, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 0.5, unidad: "botella", precio: 4.95, imagen: null, stock: 15, productoId: null },
        { nombre: "Huevos", cantidad: 4, unidad: "unidad", precio: 4.00, imagen: null, stock: 40, productoId: null },
      ],
      totalIngredientes: 27.70,
      pasos: [
        "Sofrie cebolla y ajo en aceite hasta dorar",
        "Agrega los frijoles cocidos y aplasta con tenedor",
        "Incorpora el arroz cocido y mezcla bien",
        "Forma una tortilla gruesa y cocina a fuego medio",
        "Voltea cuando este dorada por debajo (5-7 min por lado)",
        "Frie los huevos aparte y sirve encima del tacu tacu",
        "Acompana con salsa criolla de cebolla y limon"
      ]
    },
    {
      id: "demo-11",
      nombre: "Seco de Res",
      descripcion: "Guiso emblematico peruano de res cocido lentamente con culantro fresco y cerveza negra. Se sirve con frijoles canario y arroz. Sabor intenso y reconfortante.",
      emoji: "\uD83E\uDD69",
      tiempoMinutos: 60,
      porciones: 6,
      dificultad: "Media",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Carne de Res", cantidad: 1, unidad: "kg", precio: 28.00, imagen: null, stock: 5, productoId: null },
        { nombre: "Culantro", cantidad: 2, unidad: "atado", precio: 2.00, imagen: null, stock: 15, productoId: null },
        { nombre: "Cerveza Pack x6", cantidad: 1, unidad: "botella", precio: 3.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Frijoles Canario", cantidad: 0.5, unidad: "kg", precio: 6.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3.00, imagen: null, stock: 30, productoId: null },
        { nombre: "Aji Panca", cantidad: 2, unidad: "unidad", precio: 2.50, imagen: null, stock: 15, productoId: null },
      ],
      totalIngredientes: 44.50,
      pasos: [
        "Corta la carne en trozos grandes y sazona con sal y pimienta",
        "Sella la carne en aceite caliente hasta dorar por todos los lados",
        "Licua el culantro con un poco de cerveza",
        "Sofrie cebolla, ajo y aji panca en la misma olla",
        "Agrega la carne, la crema de culantro y el resto de cerveza",
        "Cocina a fuego bajo por 45 minutos hasta que la carne este tierna",
        "Sirve con frijoles guisados y arroz blanco"
      ]
    },
    {
      id: "demo-12",
      nombre: "Pollo a la Brasa",
      descripcion: "El pollo a la brasa peruano es famoso mundialmente. Marinado con especias y hierbas, cocido al horno hasta quedar crujiente por fuera y jugoso por dentro. Tradicion de domingo en familia.",
      emoji: "\uD83C\uDF57",
      tiempoMinutos: 90,
      porciones: 6,
      dificultad: "Dificil",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Cerveza Pack x6", cantidad: 1, unidad: "botella", precio: 3.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 0.5, unidad: "botella", precio: 4.95, imagen: null, stock: 15, productoId: null },
        { nombre: "Aji Panca", cantidad: 3, unidad: "unidad", precio: 3.50, imagen: null, stock: 15, productoId: null },
        { nombre: "Papa Blanca", cantidad: 1, unidad: "kg", precio: 4.00, imagen: null, stock: 30, productoId: null },
        { nombre: "Limones", cantidad: 4, unidad: "unidad", precio: 2.00, imagen: null, stock: 50, productoId: null },
      ],
      totalIngredientes: 29.45,
      pasos: [
        "Prepara la marinada: licua aji panca, cerveza, comino, romero, ajo y sal",
        "Unta el pollo entero con la marinada y refrigera minimo 4 horas",
        "Precalienta el horno a 200 grados por 15 minutos",
        "Coloca el pollo en una bandeja con rejilla y hornea 1 hora",
        "Bana con sus jugos cada 20 minutos para mantener humedo",
        "Prepara las papas fritas cortando en bastones y friendo en aceite caliente",
        "Sirve con ensalada fresca, papas y cremas (aji, mayonesa y ketchup)"
      ]
    },
    {
      id: "demo-13",
      nombre: "Tallarines Verdes",
      descripcion: "Version peruana del pesto italiano. Pasta banada en salsa verde de albahaca, espinaca y queso fresco. Rapido de preparar y favorito de los ninos en Pucallpa.",
      emoji: "\uD83C\uDF5D",
      tiempoMinutos: 30,
      porciones: 4,
      dificultad: "Facil",
      videoUrl: "https://www.youtube.com/embed/Zr0eGnxzfCA",
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Tallarin Grueso", cantidad: 0.5, unidad: "kg", precio: 5.00, imagen: null, stock: 20, productoId: null },
        { nombre: "Albahaca", cantidad: 2, unidad: "atado", precio: 2.00, imagen: null, stock: 15, productoId: null },
        { nombre: "Espinaca", cantidad: 1, unidad: "atado", precio: 2.50, imagen: null, stock: 10, productoId: null },
        { nombre: "Queso Fresco", cantidad: 0.2, unidad: "kg", precio: 4.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Leche Gloria 1L", cantidad: 0.5, unidad: "lata", precio: 3.50, imagen: null, stock: 12, productoId: null },
      ],
      totalIngredientes: 17.00,
      pasos: [
        "Hierve los tallarines en agua con sal hasta que esten al dente",
        "Blanquea la albahaca y espinaca en agua hirviendo por 30 segundos",
        "Licua las hojas con leche, queso fresco y un poco del agua de coccion",
        "Calienta la salsa verde en una sarten sin dejar hervir",
        "Mezcla los tallarines escurridos con la salsa",
        "Sirve caliente con un bistec apanado o chuleta encima"
      ]
    },
    {
      id: "demo-14",
      nombre: "Arroz Chaufa",
      descripcion: "Arroz frito estilo chifa, la fusion chino-peruana mas popular. Con pollo, huevo, sillao y cebolla china. Rapido, sabroso y perfecto para aprovechar el arroz del dia anterior.",
      emoji: "\uD83C\uDF5A",
      tiempoMinutos: 20,
      porciones: 4,
      dificultad: "Facil",
      videoUrl: "https://www.youtube.com/embed/TF-JCCqRdWI",
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Arroz Extra 5kg", cantidad: 0.5, unidad: "bolsa", precio: 11.25, imagen: null, stock: 10, productoId: null },
        { nombre: "Pollo Entero", cantidad: 0.5, unidad: "unidad", precio: 6.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Sillao", cantidad: 1, unidad: "botella", precio: 4.50, imagen: null, stock: 8, productoId: null },
        { nombre: "Huevos", cantidad: 3, unidad: "unidad", precio: 3.00, imagen: null, stock: 40, productoId: null },
        { nombre: "Cebolla China", cantidad: 1, unidad: "atado", precio: 1.50, imagen: null, stock: 15, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 0.3, unidad: "botella", precio: 2.97, imagen: null, stock: 15, productoId: null },
      ],
      totalIngredientes: 29.22,
      pasos: [
        "Cocina el arroz y dejalo enfriar (mejor si es del dia anterior)",
        "Corta el pollo en cubos pequenos y saltea en wok a fuego alto",
        "Retira el pollo y prepara tortilla de huevo, corta en tiras",
        "En el mismo wok con aceite, agrega el arroz frio y saltea",
        "Agrega sillao, sal y el pollo con el huevo",
        "Incorpora la cebolla china picada al final",
        "Sirve caliente decorado con mas cebolla china"
      ]
    },
    {
      id: "demo-15",
      nombre: "Carapulcra",
      descripcion: "Guiso ancestral peruano hecho con papa seca, chancho y mani. Es uno de los platos mas antiguos del Peru con raices prehispanicas. Ideal para ocasiones especiales.",
      emoji: "\uD83E\uDD58",
      tiempoMinutos: 90,
      porciones: 6,
      dificultad: "Dificil",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Papa Seca", cantidad: 0.5, unidad: "kg", precio: 8.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Chancho", cantidad: 0.5, unidad: "kg", precio: 14.00, imagen: null, stock: 6, productoId: null },
        { nombre: "Mani Tostado", cantidad: 0.2, unidad: "kg", precio: 5.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Aji Panca", cantidad: 3, unidad: "unidad", precio: 3.50, imagen: null, stock: 15, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 2, unidad: "unidad", precio: 3.00, imagen: null, stock: 30, productoId: null },
        { nombre: "Aceite Vegetal 1L", cantidad: 0.3, unidad: "botella", precio: 2.97, imagen: null, stock: 15, productoId: null },
      ],
      totalIngredientes: 36.47,
      pasos: [
        "Tuesta la papa seca en sarten sin aceite hasta que dore ligeramente",
        "Remoja la papa seca tostada en agua caliente por 30 minutos",
        "Corta el chancho en trozos y dora en aceite",
        "Prepara el aderezo con cebolla, ajo, aji panca y comino",
        "Agrega la papa seca escurrida y el caldo necesario",
        "Incorpora el mani tostado molido para espesar",
        "Cocina a fuego bajo por 40-50 minutos hasta que la papa este suave"
      ]
    },
    {
      id: "demo-16",
      nombre: "Aguadito de Pollo",
      descripcion: "Sopa espesa y reconfortante de pollo con culantro y arroz. En Pucallpa es el remedio perfecto para las mananas frias o despues de una fiesta. Sabor de hogar.",
      emoji: "\uD83C\uDF72",
      tiempoMinutos: 40,
      porciones: 6,
      dificultad: "Facil",
      videoUrl: null,
      categoria: "Sopas",
      colorFrom: DEMO_COLORS["Sopas"].from,
      colorTo: DEMO_COLORS["Sopas"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Pollo Entero", cantidad: 1, unidad: "unidad", precio: 12.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Arroz Extra 5kg", cantidad: 0.3, unidad: "bolsa", precio: 6.75, imagen: null, stock: 10, productoId: null },
        { nombre: "Culantro", cantidad: 2, unidad: "atado", precio: 2.00, imagen: null, stock: 15, productoId: null },
        { nombre: "Zanahoria", cantidad: 2, unidad: "unidad", precio: 2.50, imagen: null, stock: 20, productoId: null },
        { nombre: "Alverjitas", cantidad: 0.3, unidad: "kg", precio: 3.00, imagen: null, stock: 10, productoId: null },
      ],
      totalIngredientes: 26.25,
      pasos: [
        "Hierve el pollo entero con sal, cebolla y apio por 25 minutos",
        "Retira el pollo, desmenuza y reserva el caldo",
        "Licua el culantro con un poco de caldo hasta obtener crema verde",
        "Sofrie cebolla y ajo, agrega la crema de culantro",
        "Incorpora el caldo, arroz, zanahoria en cubos y alverjitas",
        "Cocina 15 minutos hasta que el arroz este suave",
        "Agrega el pollo desmenuzado y sirve bien caliente"
      ]
    },
    {
      id: "demo-17",
      nombre: "Mazamorra Morada",
      descripcion: "Postre tradicional peruano hecho con maiz morado, frutas y especias. Se sirve con arroz con leche formando el clasico combinado. Dulce favorito del Senor de los Milagros.",
      emoji: "\uD83C\uDF47",
      tiempoMinutos: 45,
      porciones: 8,
      dificultad: "Media",
      videoUrl: "https://www.youtube.com/embed/J2J5_d7xSy8",
      categoria: "Postres",
      colorFrom: DEMO_COLORS["Postres"].from,
      colorTo: DEMO_COLORS["Postres"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Maiz Morado", cantidad: 0.5, unidad: "kg", precio: 6.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Membrillo", cantidad: 1, unidad: "unidad", precio: 3.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Pina", cantidad: 0.5, unidad: "unidad", precio: 3.50, imagen: null, stock: 10, productoId: null },
        { nombre: "Chuño (Fecula)", cantidad: 0.1, unidad: "kg", precio: 2.50, imagen: null, stock: 15, productoId: null },
        { nombre: "Canela en Rama", cantidad: 2, unidad: "unidad", precio: 1.50, imagen: null, stock: 20, productoId: null },
        { nombre: "Azucar", cantidad: 0.3, unidad: "kg", precio: 1.80, imagen: null, stock: 25, productoId: null },
      ],
      totalIngredientes: 18.30,
      pasos: [
        "Hierve el maiz morado con canela, clavo y cascara de pina por 30 minutos",
        "Cuela el liquido morado y vuelve a la olla",
        "Agrega el azucar, el membrillo y la pina en cubos pequenos",
        "Disuelve el chuno en agua fria y agrega al liquido hirviendo",
        "Revuelve constantemente hasta que espese (5-7 minutos)",
        "Retira del fuego y agrega canela en polvo al gusto",
        "Sirve tibio o frio, solo o con arroz con leche"
      ]
    },
    {
      id: "demo-18",
      nombre: "Suspiro a la Limena",
      descripcion: "Postre criollo limeno de textura suave y sabor intenso. Base de manjar blanco cubierta con merengue italiano al oporto. Elegante y perfecto para impresionar en reuniones.",
      emoji: "\uD83C\uDF6E",
      tiempoMinutos: 30,
      porciones: 6,
      dificultad: "Media",
      videoUrl: null,
      categoria: "Postres",
      colorFrom: DEMO_COLORS["Postres"].from,
      colorTo: DEMO_COLORS["Postres"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Leche Gloria 1L", cantidad: 2, unidad: "lata", precio: 14.00, imagen: null, stock: 12, productoId: null },
        { nombre: "Leche Condensada", cantidad: 1, unidad: "lata", precio: 7.50, imagen: null, stock: 10, productoId: null },
        { nombre: "Yemas de Huevo", cantidad: 6, unidad: "unidad", precio: 6.00, imagen: null, stock: 40, productoId: null },
        { nombre: "Azucar", cantidad: 0.2, unidad: "kg", precio: 1.20, imagen: null, stock: 25, productoId: null },
        { nombre: "Esencia de Vainilla", cantidad: 1, unidad: "sobre", precio: 1.50, imagen: null, stock: 18, productoId: null },
      ],
      totalIngredientes: 30.20,
      pasos: [
        "Mezcla la leche evaporada con la leche condensada y cocina a fuego bajo",
        "Revuelve constantemente por 20 minutos hasta obtener manjar blanco",
        "Retira del fuego y agrega las yemas batidas, mezclando rapido",
        "Vuelve al fuego bajo y cocina 5 minutos mas hasta espesar",
        "Agrega vainilla, vierte en copas y deja enfriar",
        "Prepara merengue batiendo claras con azucar a punto de nieve",
        "Corona cada copa con merengue y espolvorea canela"
      ]
    },
    {
      id: "demo-19",
      nombre: "Chicha Morada",
      descripcion: "Bebida refrescante emblematica del Peru. Hecha con maiz morado hervido con pina, canela y clavo. Endulzada con azucar y limon. Imprescindible en toda mesa peruana y bodega de Pucallpa.",
      emoji: "\uD83E\uDD64",
      tiempoMinutos: 40,
      porciones: 10,
      dificultad: "Facil",
      videoUrl: "https://www.youtube.com/embed/bQ1GJVK4E5g",
      categoria: "Bebidas",
      colorFrom: DEMO_COLORS["Bebidas"].from,
      colorTo: DEMO_COLORS["Bebidas"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Maiz Morado", cantidad: 0.5, unidad: "kg", precio: 6.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Pina", cantidad: 1, unidad: "unidad", precio: 7.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Canela en Rama", cantidad: 2, unidad: "unidad", precio: 1.50, imagen: null, stock: 20, productoId: null },
        { nombre: "Limones", cantidad: 4, unidad: "unidad", precio: 2.00, imagen: null, stock: 50, productoId: null },
        { nombre: "Azucar", cantidad: 0.3, unidad: "kg", precio: 1.80, imagen: null, stock: 25, productoId: null },
      ],
      totalIngredientes: 18.30,
      pasos: [
        "Hierve 2 litros de agua con el maiz morado, cascara de pina y canela",
        "Cocina a fuego medio por 30 minutos hasta que el maiz suelte color",
        "Cuela el liquido y descarta el maiz y las especias",
        "Agrega azucar al gusto mientras esta caliente y disuelve bien",
        "Deja enfriar completamente a temperatura ambiente",
        "Agrega el jugo de los limones y la pina picada en cubitos",
        "Refrigera y sirve bien fria con hielo"
      ]
    },
    {
      id: "demo-20",
      nombre: "Tacacho con Cecina",
      descripcion: "Plato iconico de la selva peruana y orgullo de Pucallpa. Platano verde machacado con manteca y servido con cecina ahumada. Desayuno tradicional de la Amazonia que te llena de energia.",
      emoji: "\uD83C\uDF4C",
      tiempoMinutos: 30,
      porciones: 4,
      dificultad: "Media",
      videoUrl: null,
      categoria: "Platos de fondo",
      colorFrom: DEMO_COLORS["Platos de fondo"].from,
      colorTo: DEMO_COLORS["Platos de fondo"].to,
      imagenUrl: null,
      ingredientes: [
        { nombre: "Platano Verde", cantidad: 6, unidad: "unidad", precio: 6.00, imagen: null, stock: 25, productoId: null },
        { nombre: "Cecina de Cerdo", cantidad: 0.5, unidad: "kg", precio: 18.00, imagen: null, stock: 5, productoId: null },
        { nombre: "Manteca de Cerdo", cantidad: 0.1, unidad: "kg", precio: 3.00, imagen: null, stock: 8, productoId: null },
        { nombre: "Chorizo Regional", cantidad: 4, unidad: "unidad", precio: 8.00, imagen: null, stock: 10, productoId: null },
        { nombre: "Cebolla Roja", cantidad: 1, unidad: "unidad", precio: 1.50, imagen: null, stock: 30, productoId: null },
      ],
      totalIngredientes: 36.50,
      pasos: [
        "Asa los platanos verdes con cascara en la parrilla o hierve en agua con sal",
        "Pela los platanos calientes y machaca en batan o mortero",
        "Agrega la manteca de cerdo poco a poco mientras machacas",
        "Forma bolas medianas con las manos untadas de manteca",
        "Asa la cecina y el chorizo en parrilla o sarten hasta dorar",
        "Prepara ensalada de cebolla con tomate, limon y culantro",
        "Sirve 2 tacachos por plato con cecina, chorizo y ensalada"
      ]
    }
  ];
}
