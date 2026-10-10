import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductsDB } from "@/lib/db/products.db";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { estimadoIaUsd, llamarIa } from "@/lib/admin/comandos-ia/ia-llamada";
import { logger } from "@/lib/logger";
import {
  aplicarOperacion,
  armarFila,
  describirPlan,
  emparejarNombre,
  extraerJson,
  filtrarPorOrden,
  interpretarOrdenConReglas,
  normalizar,
  precioManteniendoMargen,
  precioParaMargen,
  redondear,
  type FilaDiferencia,
  type PlanOrden,
  type ProductoPrecio,
} from "@/lib/admin/comandos-ia/precios";

/**
 * POST /api/admin/comandos-ia/precios/plan — la DIFERENCIA de precios, sin escribir nada.
 *
 * Dos entradas, una salida (filas Hoy → Queda armadas aquí, en el servidor):
 *  · `{orden}`: reglas primero ($0); si no alcanzan, IA `balanced` con
 *    las categorías reales del tenant (nunca productos ni precios) y su JSON
 *    pasa por Zod. Ambigua o fallida → `{estado:"dudas", opciones}`: jamás se
 *    aplica a ciegas.
 *  · `{lista, politica}`: emparejado por nombre sin IA; IA `cheap` sólo
 *    para las líneas ambiguas.
 * IA por `llamarIa` (lo mismo que Mensajes y Papel): `canSpend` con el precio
 * del modelo que va a responder, gasto anotado con el que respondió, 25 s de
 * tope, y «sin clave» / «tardó» / «falló» separados de «no entendí».
 */

const MAX_TOKENS = 500;

const Redondeo = z.union([z.literal(0), z.literal(0.1), z.literal(0.5), z.literal(1)]);
const Body = z.union([
  z.object({ orden: z.string().trim().min(3).max(400) }),
  z.object({
    lista: z
      .array(z.object({ nombre: z.string().trim().min(1).max(120), costo: z.number().positive().max(1_000_000) }))
      .min(1)
      .max(200),
    politica: z.union([z.literal("mantener-margen"), z.object({ margen: z.number().gt(0).lt(95) })]),
    redondeo: Redondeo.optional(),
  }),
]);

const Texto = z.string().trim().min(1).max(200);
const DudasIA = z.object({ dudas: z.array(Texto).max(3).optional(), opciones: z.array(Texto).max(3).optional() });
const PlanIA = z.object({
  filtro: z.object({
    categorias: z.array(z.string().max(80)).max(30).default([]),
    incluye: z.array(z.string().max(80)).max(30).default([]),
    excluye: z.array(z.string().max(80)).max(30).default([]),
  }),
  operacion: z.object({ tipo: z.enum(["pct", "monto", "margen"]), valor: z.number().finite() }),
  redondeo: Redondeo.catch(0),
});
const EleccionesIA = z.object({
  elecciones: z.array(z.object({ i: z.number().int().min(0), productId: z.number().int().positive().nullable() })).max(50),
});

type Gasto = { usd: number };
type SinIa = "sin-clave" | "tardo" | "fallo";

async function preguntar(tenantId: string, tier: "cheap" | "balanced", system: string, user: string, gasto: Gasto) {
  // ~3 caracteres por token en español: estimado del modelo que va a responder.
  const estimado = estimadoIaUsd(tier, Math.ceil((system.length + user.length) / 3), MAX_TOKENS);
  if (!(await aiCostGuard.canSpend(tenantId, estimado))) return { tope: true as const, json: null };
  const ia = await llamarIa(
    tenantId,
    tier,
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      maxTokens: MAX_TOKENS,
      label: "comandos-ia-precios",
    },
    "comandos-ia/precios",
  );
  if (!ia.ok) return { tope: false as const, json: null, sinIa: ia.motivo };
  gasto.usd += ia.costoIaUsd;
  return { tope: false as const, json: ia.res.content ? extraerJson(ia.res.content) : null };
}

/** Por qué no hubo IA, en una línea: «reintenta» sólo si puede servir. */
const SIN_IA: Record<SinIa, string> = {
  "sin-clave": "La IA no está conectada: escribe la orden como los ejemplos y la entiendo sin IA.",
  tardo: "La IA tardó demasiado. Vuelve a intentar o escríbela como los ejemplos.",
  fallo: "La IA no respondió. Vuelve a intentar o escríbela como los ejemplos.",
};

function ejemplos(categorias: string[]): string[] {
  const [a = "Abarrotes", b = a, c = b] = categorias;
  return [`Sube 5 % ${a} y redondea a 10 céntimos`, `Lleva a 30 % de margen ${b}`, `Baja 10 céntimos ${c}`];
}

/**
 * Las opciones de la IA son botones que se tocan: sólo órdenes concretas (con
 * cifra, sin «X %» ni «(pct)» de plantilla). Si quedan menos de 2, se completan
 * con ejemplos armados con las categorías reales.
 */
function opcionesUtiles(opciones: string[], categorias: string[]): string[] {
  const buenas = opciones
    .map((o) => o.replace(/^\s*\d+[.)-]\s*/, "").trim())
    .filter((o) => /\d/.test(o) && !/\bX\b|\((?:pct|monto|margen)\)/i.test(o));
  return [...new Set([...buenas, ...ejemplos(categorias)])].slice(0, 3);
}

/** El plan de la IA, revisado: categorías que existen y cifras con sentido. Si no, dudas. */
function revisarPlan(p: PlanOrden, categorias: string[]): string[] {
  const dudas: string[] = [];
  const reales = new Map(categorias.map((c) => [normalizar(c), c]));
  const malas = p.filtro.categorias.filter((c) => !reales.has(normalizar(c)));
  if (malas.length) dudas.push(`No tienes la categoría «${malas.join("», «")}».`);
  p.filtro.categorias = p.filtro.categorias.flatMap((c) => reales.get(normalizar(c)) ?? []);
  const { tipo, valor } = p.operacion;
  if (valor === 0) dudas.push("La orden no dice cuánto cambiar.");
  if (tipo === "pct" && (valor <= -90 || valor > 300)) dudas.push(`¿${valor} %? Es un cambio muy grande.`);
  if (tipo === "monto" && Math.abs(valor) > 1000) dudas.push(`¿S/ ${valor}? Es un cambio muy grande.`);
  if (tipo === "margen" && (valor <= 0 || valor >= 95)) dudas.push(`Un margen de ${valor} % no se puede.`);
  return dudas;
}

const SISTEMA_ORDEN = (cats: string[]) => `Eres el intérprete de órdenes de precios de una bodega en Perú.
Categorías del negocio (cópialas EXACTAS): ${JSON.stringify(cats)}.
Responde SOLO un JSON: {"filtro":{"categorias":[],"incluye":[],"excluye":[]},"operacion":{"tipo":"pct"|"monto"|"margen","valor":0},"redondeo":0|0.1|0.5|1}
- categorias: sólo de la lista. incluye: productos o marcas sueltos que no son categoría. excluye: lo que la orden saca («menos», «excepto»).
- pct: valor en %, negativo para bajar. monto: soles, negativo para bajar (50 céntimos = 0.5). margen: el margen objetivo en % (30).
- redondeo: 0 si no lo pide; 0.1 = 10 céntimos; 0.5 = 50 céntimos; 1 = sol entero.
Si es ambigua o no es un cambio de precios, responde {"dudas":["…"],"opciones":["2 o 3 órdenes completas con cifras concretas, p. ej. «Sube 5 % Bebidas»"]}.`;

async function planDeOrden(tenantId: string, orden: string, productos: ProductoPrecio[], gasto: Gasto) {
  const categorias = [...new Set(productos.map((p) => p.category))].sort();
  const porReglas = interpretarOrdenConReglas(orden, categorias);
  if (porReglas) return { plan: porReglas, origen: "reglas" as const };

  const r = await preguntar(tenantId, "balanced", SISTEMA_ORDEN(categorias), orden, gasto);
  if (r.tope) return { tope: true as const };
  if (r.sinIa) return { dudas: [SIN_IA[r.sinIa]], opciones: ejemplos(categorias) };
  const dudas = DudasIA.safeParse(r.json);
  if (dudas.success && dudas.data.dudas?.length) {
    return { dudas: dudas.data.dudas, opciones: opcionesUtiles(dudas.data.opciones ?? [], categorias) };
  }
  const plan = PlanIA.safeParse(r.json);
  if (!plan.success) {
    return { dudas: ["No entendí la orden. Prueba con una de estas o escríbela como los ejemplos."], opciones: ejemplos(categorias) };
  }
  const p: PlanOrden = plan.data;
  const problemas = revisarPlan(p, categorias);
  if (problemas.length) return { dudas: problemas, opciones: ejemplos(categorias) };
  return { plan: p, origen: "ia" as const };
}

function filasDeOrden(plan: PlanOrden, productos: ProductoPrecio[]) {
  const { incluidos, excluidos } = filtrarPorOrden(productos, plan.filtro);
  const filas: FilaDiferencia[] = [];
  const noAplica: Array<{ nombre: string; motivo: string }> = [];
  let sinCambio = 0;
  for (const p of incluidos) {
    const bruto = aplicarOperacion(p.price, p.costPrice, plan.operacion);
    if (bruto == null) noAplica.push({ nombre: p.name, motivo: "sin costo: no puedo calcular su margen" });
    else if (bruto <= 0) noAplica.push({ nombre: p.name, motivo: "quedaría en S/ 0 o menos" });
    else {
      const f = armarFila(p, { precio: redondear(bruto, plan.redondeo), costo: p.costPrice ?? null });
      if (f.precioNuevo === f.precioHoy) sinCambio++;
      else filas.push(f);
    }
  }
  for (const p of excluidos) filas.push(armarFila(p, { precio: p.price, costo: p.costPrice ?? null }, true));
  return { filas, noAplica, sinCambio };
}

type BodyLista = Extract<z.infer<typeof Body>, { lista: unknown }>;

async function filasDeLista(tenantId: string, b: BodyLista, productos: ProductoPrecio[], gasto: Gasto) {
  const noAplica: Array<{ nombre: string; motivo: string }> = [];
  const elegidos = new Map<number, number>(); // productId → costo nuevo
  const ambiguos: Array<{ i: number; nombre: string; candidatos: Array<{ productId: number; nombre: string }> }> = [];
  b.lista.forEach((l, i) => {
    const e = emparejarNombre(l.nombre, productos);
    if (e.estado === "unico" && e.productId) elegidos.set(e.productId, l.costo);
    // Empate arriba = la línea no dice cuál («Costeño 500g» → lentejas o quinua): la IA sólo adivinaría.
    else if (e.estado === "ambiguo" && e.candidatos[0].puntaje === e.candidatos[1]?.puntaje) {
      noAplica.push({ nombre: l.nombre, motivo: `¿cuál? ${e.candidatos.map((c) => c.nombre).join(" / ")}` });
    } else if (e.estado === "ambiguo") ambiguos.push({ i, nombre: l.nombre, candidatos: e.candidatos });
    else noAplica.push({ nombre: l.nombre, motivo: "no está en tu catálogo" });
  });
  if (ambiguos.length) {
    const r = await preguntar(
      tenantId,
      "cheap",
      'Empareja cada línea de una lista de proveedor con UNO de sus candidatos del catálogo. Responde SOLO {"elecciones":[{"i":0,"productId":123 o null}]}. null si ninguno es el mismo producto (marca y medida) o si dudas entre dos.',
      JSON.stringify(ambiguos.slice(0, 30).map((a) => ({ i: a.i, linea: a.nombre, candidatos: a.candidatos.map((c) => ({ productId: c.productId, nombre: c.nombre })) }))),
      gasto,
    );
    const ok = EleccionesIA.safeParse(r.json);
    const porI = new Map(ok.success ? ok.data.elecciones.map((e) => [e.i, e.productId]) : []);
    for (const a of ambiguos) {
      const id = porI.get(a.i);
      if (id && a.candidatos.some((c) => c.productId === id)) elegidos.set(id, b.lista[a.i].costo);
      else noAplica.push({ nombre: a.nombre, motivo: `¿cuál? ${a.candidatos.map((c) => c.nombre).join(" / ")}` });
    }
  }
  const redondeo = b.redondeo ?? 0.1;
  const filas: FilaDiferencia[] = [];
  let sinCambio = 0;
  for (const p of productos) {
    const costo = elegidos.get(p.id);
    if (costo === undefined) continue;
    const bruto =
      b.politica === "mantener-margen"
        ? (precioManteniendoMargen(p.price, p.costPrice ?? null, costo) ?? p.price)
        : (precioParaMargen(costo, b.politica.margen / 100) ?? p.price);
    const f = armarFila(p, { precio: redondear(bruto, redondeo), costo });
    if (f.precioNuevo === f.precioHoy && f.costoNuevo === f.costoHoy) sinCambio++;
    else filas.push(f);
  }
  return { filas, noAplica, sinCambio };
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comandos-ia-precios-plan");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });

  try {
    const productos = (await ProductsDB.getAll(auth.tenantId)).filter((p) => p.active);
    const gasto: Gasto = { usd: 0 };
    const costoIaUsd = () => Math.round(gasto.usd * 1e6) / 1e6;

    if ("orden" in parsed.data) {
      const r = await planDeOrden(auth.tenantId, parsed.data.orden, productos, gasto);
      if ("tope" in r) {
        return NextResponse.json({ error: "tope-ia", mensaje: "Se acabó la IA de este mes. Escribe la orden como los ejemplos y la entiendo sin IA." }, { status: 402 });
      }
      if ("dudas" in r) return NextResponse.json({ estado: "dudas", dudas: r.dudas, opciones: r.opciones, costoIaUsd: costoIaUsd() });
      return NextResponse.json({ estado: "plan", origen: r.origen, interpretacion: describirPlan(r.plan), ...filasDeOrden(r.plan, productos), costoIaUsd: costoIaUsd() });
    }

    const b = parsed.data;
    const politica = b.politica === "mantener-margen" ? "mantén tu margen" : `lleva a ${b.politica.margen} % de margen`;
    return NextResponse.json({
      estado: "plan",
      origen: "lista",
      interpretacion: `Costos nuevos de ${b.lista.length} productos · ${politica}`,
      ...(await filasDeLista(auth.tenantId, b, productos, gasto)),
      costoIaUsd: costoIaUsd(),
    });
  } catch (e) {
    logger.error("[comandos-ia/precios/plan]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pude armar la diferencia" }, { status: 500 });
  }
}
