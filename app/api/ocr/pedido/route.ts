import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import {
  FORMATOS_IMAGEN,
  costoMaximoLecturaUsd,
  falloSinLector,
  gastoDeLectura,
  proveedorVision,
  visionExtractJSON,
} from "@/lib/ai/vision-extract";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { CotizacionesDB } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MAX_ALTERNATIVAS, cantidadValida, decidirLinea, type Candidato, type LineaEmparejada, type LineaLeida } from "@/lib/ventas/emparejar-pedido";

/**
 * /api/ocr/pedido — «Venta desde una foto» (copiado de Alegra, 18-10): lee la
 * foto del pedido de un cliente (una lista escrita a mano, un WhatsApp impreso)
 * y empareja cada línea con el catálogo del negocio.
 *
 * Sólo LEE: no guarda nada. La persona revisa las líneas en «Nueva cotización»,
 * corrige las dudosas y guarda un BORRADOR por `POST /api/cotizaciones`, que
 * vuelve a calcular el total con el precio del catálogo. El precio escrito en
 * el papel vuelve como referencia (`precioLeido`) y nunca entra al total.
 *
 * Mismo lector, tope de imagen, de tokens y de gasto que `/api/ocr/invoice`;
 * los roles son los de crear una cotización.
 */

/* Como la ruta hermana: ~7,5 MB de foto. */
const MAX_IMAGE_B64_BYTES = 10_000_000;
/* Una lista de ~40 líneas entra en 1500 tokens de respuesta (como una boleta). */
const MAX_TOKENS = 1500;
const RESERVA_USD = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS });
/* Un pedido de más de 60 líneas no es una foto: se lee lo primero. */
const MAX_LINEAS = 60;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
});

const PedidoSchema = z.object({
  cliente: z
    .object({
      nombre: z.string().max(200).optional().catch(undefined),
      documento: z.string().max(20).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  items: z
    .array(
      z.object({
        texto: z.string().max(300),
        cantidad: z.number().optional().catch(undefined),
        precio: z.number().min(0).optional().catch(undefined),
      }),
    )
    .default([]),
});

/** Lo que Claude tiene que devolver (`output_config.format`). Lo que el papel no trae, se omite. */
const JSON_SCHEMA_PEDIDO = {
  type: "object",
  properties: {
    cliente: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        documento: { type: "string" },
      },
      additionalProperties: false,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          texto: { type: "string" },
          cantidad: { type: "number" },
          precio: { type: "number" },
        },
        required: ["texto", "cantidad"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const PROMPT =
  "Esta foto es el pedido de un cliente a una bodega o tienda de Perú: una lista escrita a mano o impresa. " +
  "Por cada producto pedido, devuelve: `texto` = la línea tal cual está escrita, con su cantidad y unidad (ej. «2 cj leche gloria»); " +
  "`cantidad` = cuántas pide (número; si no lo dice, 1); `precio` = el precio unitario SOLO si está escrito en el papel. " +
  "Si el papel trae el nombre del cliente o su DNI/RUC, ponlos en `cliente`. " +
  "Ignora lo tachado, los totales, las fechas y las firmas. No inventes productos, precios ni clientes: si un dato no figura, omítelo. " +
  'Responde SOLO JSON: {"cliente":{"nombre":"...","documento":"..."},"items":[{"texto":"2 cj leche gloria","cantidad":2,"precio":7.2}]}.';

/** Lo que recibe la pantalla (contrato de `.claude/autonomo/alegra-copiar/contrato.md` §2.2). */
export interface PedidoLeido {
  cliente?: { nombre?: string; documento?: string };
  items: LineaEmparejada[];
  costoIaUsd: number | null;
}

const limpio = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export async function POST(req: NextRequest) {
  // Después del login y por negocio + usuario, como `/api/ocr/invoice` (17-10);
  // la plata la topa `aiCostGuard.canSpend` por negocio.
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const _rl = applyRateLimit(req, "MODERATE", `ocr-pedido:${auth.tenantId}:${auth.username}`);
  if (_rl) return _rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No llegó la foto del pedido." }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const verDetalleDeClave = await veDetalleDeClaveIA(req);
  if (!proveedorVision()) {
    logger.warn("[ocr-pedido] sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas", { tenantId: auth.tenantId.slice(-6) });
    const f = falloSinLector(verDetalleDeClave);
    return NextResponse.json({ error: f.error, codigo: f.codigo }, { status: f.status });
  }

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, RESERVA_USD);
  if (!canSpend) {
    logger.warn("[ocr-pedido] presupuesto AI excedido", { tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "Se acabó el presupuesto de lectura con IA de este mes.", codigo: "limite_ia" }, { status: 429 });
  }

  const r = await visionExtractJSON({
    imageBase64: parsed.data.image,
    formatos: FORMATOS_IMAGEN,
    prompt: PROMPT,
    schema: PedidoSchema,
    jsonSchema: JSON_SCHEMA_PEDIDO,
    maxTokens: MAX_TOKENS,
    logTag: "[ocr-pedido]",
    verDetalleDeClave,
  });
  const gasto = gastoDeLectura(r, RESERVA_USD);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!r.ok) {
    const dePapel = r.codigo == null || r.codigo === "ilegible" || r.codigo === "pedido_rechazado";
    const error = dePapel ? "No se pudo leer el pedido. Prueba con una foto más nítida, de frente y con buena luz." : r.error;
    return NextResponse.json({ error, codigo: r.codigo ?? "ilegible" }, { status: r.status });
  }

  const lineas: LineaLeida[] = r.data.items
    .map((i) => ({ textoLeido: limpio(i.texto), cantidad: cantidadValida(i.cantidad), precioLeido: i.precio ?? null }))
    .filter((l) => l.textoLeido.length > 0)
    .slice(0, MAX_LINEAS);

  let candidatos: Candidato[][];
  try {
    candidatos = await CotizacionesDB.productosPorTexto(auth.tenantId, lineas.map((l) => l.textoLeido), 1 + MAX_ALTERNATIVAS);
  } catch (e) {
    logger.error("[ocr-pedido] catálogo", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "Se leyó el pedido pero no se pudo revisar tu catálogo. Prueba de nuevo." }, { status: 503 });
  }

  const nombre = limpio(r.data.cliente?.nombre);
  // DNI (8) o RUC (11); otro largo no es un documento y no se propone.
  const digitos = limpio(r.data.cliente?.documento).replace(/\D/g, "");
  const documento = digitos.length === 8 || digitos.length === 11 ? digitos : "";
  const respuesta: PedidoLeido = {
    ...((nombre || documento) && { cliente: { ...(nombre && { nombre }), ...(documento && { documento }) } }),
    items: lineas.map((l, i) => decidirLinea(l, candidatos[i] ?? [])),
    costoIaUsd: r.costoUsd ?? null,
  };
  return NextResponse.json(respuesta);
}
