import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { gastoDeLectura, proveedorVision } from "@/lib/ai/vision-extract";
import { costoMaximoPreguntaUsd, estadoAsistenteIA, falloSinAsistente, preguntarIA } from "@/lib/ai/pregunta-ia";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { estadoVencimiento } from "@/lib/forestal/ctp-ficha-types";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/ask — Asistente del Libro CTP.
 * POST { question } → { answer }. La IA responde SOLO con el resumen real del
 * libro (existencias, ingresos, cumplimiento, habilitación) que se arma acá en
 * el server; nunca inventa datos. Guard: spec + auth + rate-limit STRICT +
 * aiCostGuard.
 *
 * 2026-10-02 («Un solo lector para guías y facturas»): la pregunta va por
 * `preguntarIA` (Claude `claude-sonnet-5-5` primero, OpenAI de respaldo). Antes
 * tenía su propio fetch con `thinking: disabled` y cada fallo era un 502 mudo
 * «falta API key o el modelo no respondió». Ahora el fallo dice qué pasó
 * (clave inválida, sin crédito, saturada) con un `codigo`, y al tope mensual
 * va lo que costó DE VERDAD (antes US$0,003 fijos, aunque la pregunta costara
 * diez veces eso), también si la respuesta salió cortada o negada.
 */

const Schema = z.object({ question: z.string().trim().min(3).max(500) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** Arma el contexto textual del libro (all-time) que la IA puede citar. */
async function buildContext(tenantId: string): Promise<string> {
  const [saldos, stats, traza, ficha] = await Promise.all([
    ForestCtpDB.saldos(tenantId),
    WoodEntriesDB.stats(tenantId),
    ForestCtpDespachoDB.trazabilidadDelPeriodo(tenantId),
    ForestCtpFichaDB.get(tenantId),
  ]);
  const existencias = saldos.porEspecie
    .map((e) => `- ${e.especie}${e.cites ? " (CITES)" : ""}: ingresado ${e.ingresoM3} m³, consumido ${e.consumidoM3} m³, saldo ${e.saldoM3} m³`)
    .join("\n") || "  (sin materia prima registrada)";
  const productos = saldos.productos
    .map((p) => `- ${p.producto}: producido ${p.producido}, despachado ${p.despachado}, stock ${p.stock}`)
    .join("\n") || "  (sin productos transformados)";
  const vencidos = [
    ...ficha.titulos.filter((t) => estadoVencimiento(t.vencimiento) === "vencido").map((t) => `título ${t.codigo || t.tipo}`),
    ...ficha.citesPermisos.filter((p) => estadoVencimiento(p.vencimiento) === "vencido").map((p) => `permiso CITES ${p.especie}`),
  ];
  return [
    `CTP: ${ficha.nombreCtp || "sin nombre"} · Código ${ficha.codigoCtp || "sin código"} · RUC ${ficha.ruc || "sin RUC"}`,
    `Ingresos de materia prima: ${stats.totalCount} guías, ${stats.totalVolumeM3} m³ totales. Especies CITES: ${stats.citesCount}. Fuera de plazo (>2 días hábiles): ${stats.lateCount}. Pendientes de validar: ${stats.byStatus.pendiente}.`,
    `EXISTENCIAS de materia prima por especie (saldo = lo que queda):\n${existencias}`,
    `STOCK de productos transformados:\n${productos}`,
    `Despachos SIN cadena de custodia completa (no pueden certificar): ${traza.incompletos} de ${traza.total}${traza.lineas.length ? ` (líneas #${traza.lineas.join(", #")})` : ""}.`,
    `Documentos habilitantes VENCIDOS: ${vencidos.length ? vencidos.join(", ") : "ninguno"}.`,
  ].join("\n\n");
}

/** Quién es el asistente. Sin «no pienses»: con `effort: "low"` no hace falta (skill `claude-api`). */
const SYSTEM =
  "Eres el asistente del Libro de Operaciones de un aserradero (Centro de Transformación Primaria) en Perú. " +
  "Responde la pregunta del operador USANDO ÚNICAMENTE los datos del libro que te paso. Sé breve, concreto y en español peruano. " +
  "Si el dato exacto no está en los datos, di que no figura en el libro — NUNCA inventes cifras. No des consejos legales.";

/** La respuesta visible: dos o tres párrafos cortos. */
const MAX_TOKENS = 500;

/** GET → { available, aviso, codigo } : ¿hay IA configurada? El widget lo usa
 *  para ocultarse en vez de mostrar una función rota (QA 2026-07-17); quien
 *  administra la plataforma (`codigo: "sin_lector"`) ve dónde va la clave. */
export const GET = withApiHandler("forestal-ctp-ask-status", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(estadoAsistenteIA(await veDetalleDeClaveIA(req)));
});

export const POST = withApiHandler("forestal-ctp-ask", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "STRICT", "ctp-ask");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "No llegó la pregunta." }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Escribe una pregunta de 3 a 500 letras." }, { status: 422 });
  }

  const verDetalleDeClave = await veDetalleDeClaveIA(req);
  if (!proveedorVision()) {
    logger.warn("[ctp.ask] sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas", { tenantId: auth.tenantId.slice(-6) });
    const f = falloSinAsistente(verDetalleDeClave);
    return NextResponse.json({ error: f.error, codigo: f.codigo }, { status: f.status });
  }

  let pregunta: string;
  try {
    pregunta = `Datos del libro:\n${await buildContext(auth.tenantId)}\n\nPregunta: ${parsed.data.question}`;
  } catch (err) {
    logger.error("[ctp.ask] buildContext failed", { error: String(err), tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "No se pudo armar el resumen del libro. Intenta de nuevo en un momento." }, { status: 500 });
  }

  /* Se reserva el TOPE (el resumen del libro crece con las especies); se anota lo que costó. */
  const reserva = costoMaximoPreguntaUsd({ system: SYSTEM, pregunta, maxTokens: MAX_TOKENS });
  const canSpend = await aiCostGuard.canSpend(auth.tenantId, reserva);
  if (!canSpend) {
    return NextResponse.json({ error: "Se acabó el presupuesto de IA de este mes.", codigo: "limite_ia" }, { status: 429 });
  }

  const r = await preguntarIA({ system: SYSTEM, pregunta, maxTokens: MAX_TOKENS, logTag: "[ctp.ask]", verDetalleDeClave });
  /* Lo cobrado se anota en los DOS caminos: una respuesta cortada o negada también se pagó. */
  const gasto = gastoDeLectura(r, reserva);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ answer: r.data });
});
