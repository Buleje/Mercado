import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { logger } from "@/lib/logger";

/**
 * POST /api/chef-ia — "¿Qué cocino hoy?" con IA.
 *
 * Genera 3 recetas peruanas segun:
 *   - presupuesto (S/)
 *   - personas (2-10)
 *   - ingredientes que ya tiene el usuario (opcional)
 *   - restriccion (vegetariano, sin gluten, etc)
 *
 * Uso del Vercel AI Gateway con plain string "anthropic/claude-haiku-4-5"
 * — si AI_GATEWAY_API_KEY no esta configurado, devuelve 6 recetas mock
 * precargadas de cocina peruana (nunca falla el endpoint).
 */

// Next 16 + cacheComponents prohibe segment configs — runtime se infiere de
// Fluid Compute. Ver ADR-019.

const RequestSchema = z.object({
  presupuesto: z.number().min(10).max(500),
  personas: z.number().int().min(1).max(10),
  ingredientesEnCasa: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  restriccion: z
    .enum(["ninguna", "vegetariano", "sin-gluten", "sin-lactosa"])
    .optional()
    .default("ninguna"),
});

const RecetaSchema = z.object({
  nombre: z.string(),
  descripcion: z.string(),
  tiempo: z.string(),
  dificultad: z.enum(["facil", "media", "dificil"]),
  ingredientes: z.array(
    z.object({
      nombre: z.string(),
      cantidad: z.string(),
      precioEstimado: z.number(),
    }),
  ),
  pasos: z.array(z.string()),
  totalEstimado: z.number(),
});

const ResponseSchema = z.object({
  recetas: z.array(RecetaSchema).min(3).max(3),
});

type Receta = z.infer<typeof RecetaSchema>;

const MOCK_RECETAS: Receta[] = [
  {
    nombre: "Arroz con pollo",
    descripcion:
      "Clásico peruano reconfortante: arroz cocido con culantro, pollo y arvejas.",
    tiempo: "45 min",
    dificultad: "facil",
    ingredientes: [
      { nombre: "Pollo trozado", cantidad: "1 kg", precioEstimado: 14.0 },
      { nombre: "Arroz Costeño", cantidad: "500 g", precioEstimado: 3.5 },
      { nombre: "Culantro fresco", cantidad: "1 atado", precioEstimado: 1.5 },
      { nombre: "Arvejas", cantidad: "200 g", precioEstimado: 3.0 },
      { nombre: "Cebolla", cantidad: "1 grande", precioEstimado: 1.0 },
      { nombre: "Ajo", cantidad: "5 dientes", precioEstimado: 0.5 },
    ],
    pasos: [
      "Licuar culantro con un poco de agua.",
      "Dorar pollo sazonado con sal y pimienta.",
      "Añadir cebolla, ajo, y el culantro licuado.",
      "Agregar arroz, caldo, arvejas y cocinar 20 min.",
    ],
    totalEstimado: 23.5,
  },
  {
    nombre: "Aji de gallina",
    descripcion:
      "Crema suave de gallina con ají amarillo, nueces y pan. Servido con papa y arroz.",
    tiempo: "1 h",
    dificultad: "media",
    ingredientes: [
      { nombre: "Pechuga de gallina", cantidad: "500 g", precioEstimado: 12.0 },
      { nombre: "Ají amarillo", cantidad: "150 g", precioEstimado: 4.0 },
      { nombre: "Pan molde", cantidad: "6 tajadas", precioEstimado: 3.0 },
      { nombre: "Leche evaporada", cantidad: "1 lata", precioEstimado: 4.5 },
      { nombre: "Papa amarilla", cantidad: "500 g", precioEstimado: 3.5 },
      { nombre: "Nueces", cantidad: "50 g", precioEstimado: 3.5 },
    ],
    pasos: [
      "Hervir la gallina con aromáticos y deshilachar.",
      "Saltear ají amarillo con ajo y cebolla.",
      "Mezclar con pan remojado en leche y licuar.",
      "Servir con papa cocida y aceituna.",
    ],
    totalEstimado: 30.5,
  },
  {
    nombre: "Lomo saltado",
    descripcion:
      "Carne salteada en wok con cebolla morada, tomate y ají. Chifa-peruano al tope.",
    tiempo: "30 min",
    dificultad: "facil",
    ingredientes: [
      { nombre: "Lomo de res", cantidad: "500 g", precioEstimado: 18.0 },
      { nombre: "Cebolla morada", cantidad: "2 unidades", precioEstimado: 2.5 },
      { nombre: "Tomate", cantidad: "3 unidades", precioEstimado: 3.0 },
      { nombre: "Papas amarillas", cantidad: "500 g", precioEstimado: 3.5 },
      { nombre: "Sillao", cantidad: "2 cdas", precioEstimado: 1.5 },
      { nombre: "Arroz", cantidad: "300 g", precioEstimado: 2.5 },
    ],
    pasos: [
      "Freír papas en bastones.",
      "Saltear carne a fuego alto 2 min.",
      "Agregar cebolla, tomate, sillao, vinagre.",
      "Servir con arroz y papas fritas encima.",
    ],
    totalEstimado: 31.0,
  },
];

function buildPrompt(input: z.infer<typeof RequestSchema>): string {
  const ingredientes = input.ingredientesEnCasa.length
    ? `\nIngredientes que el usuario ya tiene: ${input.ingredientesEnCasa.join(", ")}`
    : "";
  const restriccion =
    input.restriccion !== "ninguna" ? `\nRestriccion: ${input.restriccion}` : "";
  return `Eres un chef peruano. Genera 3 recetas para ${input.personas} personas con presupuesto maximo S/${input.presupuesto}.${ingredientes}${restriccion}

Reglas:
- Solo recetas peruanas o con ingredientes disponibles en Peru (Pucallpa).
- Precios realistas de bodega local (sol peruano).
- Cada receta: nombre, descripcion corta, tiempo, dificultad (facil|media|dificil), ingredientes con cantidad y precio estimado, 3-5 pasos cortos, totalEstimado.
- El totalEstimado de cada receta no debe superar S/${input.presupuesto}.
- Priorizar recetas distintas (no 3 de arroz).`;
}

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-12 (H3 audit AI): bucket cost por IP en lugar de global.
  // Antes "__chef_ia__" era un bucket único → 1 atacante quemaba el budget de
  // TODOS los usuarios. Ahora cada IP tiene su propio cap mensual.
  const { applyRateLimit } = await import("@/lib/rate-limit");
  const rl = applyRateLimit(req, "STRICT", "chef-ia");
  if (rl) return rl;
  const { aiCostGuard } = await import("@/lib/ai/cost-control");
  const ESTIMATED_COST_USD = 0.003;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const bucketKey = `__chef_ia__:${ip}`;
  if (!await aiCostGuard.canSpend(bucketKey, ESTIMATED_COST_USD, "free")) {
    return NextResponse.json(
      { error: "Chef IA quota exceeded. Try again later." },
      { status: 429 },
    );
  }
  // SECURITY 2026-05-12 (audit code-reviewer P1-4): await + catch para que
  // si la función falla, no se quede el gasto sin registrar (atacante podría
  // exceder budget). Fire-and-forget con .catch para no bloquear response.
  aiCostGuard.recordSpend(bucketKey, ESTIMATED_COST_USD).catch((err) =>
    logger.warn("[chef-ia] recordSpend failed", { err: String(err) }),
  );

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametros invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // Si no hay API key del gateway/provider, devolver mock enriquecido
  const hasAiKey =
    !!process.env.AI_GATEWAY_API_KEY || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAiKey) {
    return NextResponse.json({
      recetas: MOCK_RECETAS,
      source: "mock",
    });
  }

  try {
    const { object } = await generateObject({
      model: "anthropic/claude-haiku-4-5",
      schema: ResponseSchema,
      prompt: buildPrompt(input),
      temperature: 0.7,
    });
    return NextResponse.json({ recetas: object.recetas, source: "ai" });
  } catch (err) {
    // Fallback silencioso a mock si la IA falla
    return NextResponse.json({
      recetas: MOCK_RECETAS,
      source: "fallback",
      warn: err instanceof Error ? err.message : "AI error",
    });
  }
}
