import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { logger } from "@/lib/logger";

// SECURITY 2026-05-12 (H2 audit AI): cap defensivo de imagen base64.
// 10MB = ~7.5MB raw image, suficiente para fotos de factura.
const MAX_IMAGE_B64_BYTES = 10_000_000;
// Costo estimado por llamada Vision (~$0.01 por imagen mediana)
const OCR_COST_USD = 0.01;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
});

const InvoiceSchema = z.object({
  proveedor: z.object({
    nombre: z.string().default("Desconocido"),
    ruc: z.string().optional(),
  }).default({ nombre: "Desconocido" }),
  fecha: z.string().optional(),
  items: z.array(z.object({
    nombre: z.string(),
    cantidad: z.number().min(0),
    precioUnitario: z.number().min(0),
  })).default([]),
  total: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-12 (H2 audit AI): auth + cost guard + rate limit STRICT.
  // Antes era abierto al mundo → atacante quemaba $30-100/dia de Vision API.
  const _rl = await applyRateLimit(req, "STRICT", "ocr-invoice"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  // Cost guard por tenant — si excede el budget mensual, rechaza con 429
  const canSpend = await aiCostGuard.canSpend(auth.tenantId, OCR_COST_USD);
  if (!canSpend) {
    logger.warn("[ocr-invoice] presupuesto AI excedido", { tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json(
      { error: "Presupuesto AI mensual agotado. Actualiza tu plan o espera al proximo ciclo." },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const { image } = parsed.data;

    // Try OpenAI first (most projects have OPENAI_API_KEY), fallback to Anthropic
    const apiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      // Use OpenAI GPT-4o-mini Vision
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Eres un extractor de datos de boletas y facturas peruanas. Extrae los datos y responde SOLO en JSON válido sin markdown. Si no puedes leer algo, usa valores por defecto razonables.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Extrae de esta boleta/factura peruana: proveedor (nombre, ruc), fecha, items (nombre, cantidad, precioUnitario), total. Responde SOLO JSON: {"proveedor":{"nombre":"...","ruc":"..."},"fecha":"...","items":[{"nombre":"...","cantidad":1,"precioUnitario":0}],"total":0}',
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image.startsWith("data:")
                      ? image
                      : `data:image/jpeg;base64,${image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1500,
          // OCR/extracción — determinístico, variación = errores de parsing.
          // Excel Agentes IA práctica #7.
          temperature: AI_TEMPERATURES.extraction,
        }),
      });

      if (!res.ok) {
        await res.text();
        return NextResponse.json(
          { error: `API error: ${res.status}` },
          { status: 502 },
        );
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      // ADR 009: parse defensivo con schema Zod unificado.
      const parsed = safeParseJSON(content, InvoiceSchema);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: "No se pudo interpretar la factura", raw: content, parseError: parsed.error },
          { status: 422 },
        );
      }
      // Record spend on success (no record on parse failures = caller no paga)
      await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);
      return NextResponse.json(parsed.data);
    } else if (anthropicKey) {
      // Use Anthropic Claude Vision
      const imageData = image.startsWith("data:")
        ? image.split(",")[1]
        : image;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          // `claude-sonnet-4-20250514` estaba deprecado con retiro el
          // 2026-06-15: la rama de Anthropic respondía 404 desde entonces, así
          // que el fallback del escáner de facturas no existía en la práctica.
          model: "claude-sonnet-5",
          max_tokens: 1500,
          // Sonnet 5 razona por defecto cuando no se manda `thinking`, y
          // `max_tokens` es el tope de razonamiento MÁS respuesta: con 1500 el
          // JSON se cortaría a la mitad. Leer una boleta es extracción, no un
          // problema a pensar — se apaga y el presupuesto queda para el JSON.
          thinking: { type: "disabled" },
          // El JSON deja de ser un pedido por prompt ("responde SOLO JSON") y
          // pasa a ser el formato garantizado por la API. Es el que más
          // importa acá: el fallo típico del OCR no es leer mal la foto, es
          // devolver el JSON envuelto en markdown y morir en el parseo.
          output_config: {
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: {
                  proveedor: {
                    type: "object",
                    properties: {
                      nombre: { type: "string" },
                      ruc: { type: "string" },
                    },
                    required: ["nombre"],
                    additionalProperties: false,
                  },
                  fecha: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nombre: { type: "string" },
                        cantidad: { type: "number" },
                        precioUnitario: { type: "number" },
                      },
                      required: ["nombre", "cantidad", "precioUnitario"],
                      additionalProperties: false,
                    },
                  },
                  total: { type: "number" },
                },
                required: ["proveedor", "items", "total"],
                additionalProperties: false,
              },
            },
          },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: imageData,
                  },
                },
                {
                  // La forma del JSON la fija `output_config.format`, así que
                  // el prompt sólo aporta lo que el schema no puede decir: que
                  // es un comprobante peruano y qué representa cada campo.
                  type: "text",
                  text: "Extrae los datos de esta boleta o factura peruana: el proveedor con su RUC, la fecha de emisión, cada ítem con su cantidad y precio unitario, y el total. Si un dato no figura en el comprobante, omitilo en vez de inventarlo.",
                },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `API error: ${res.status}` },
          { status: 502 },
        );
      }

      const data = await res.json();
      const content = data.content?.[0]?.text ?? "";
      // ADR 009: mismo pattern que la ruta de OpenAI.
      const parsed = safeParseJSON(content, InvoiceSchema);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: "No se pudo interpretar la factura", raw: content, parseError: parsed.error },
          { status: 422 },
        );
      }
      // Record spend on success (Anthropic path)
      await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);
      return NextResponse.json(parsed.data);
    } else {
      // El mensaje lo lee el encargado en el modal, no un programador: decía
      // "No se encontró API key para OCR (OPENAI_API_KEY o ANTHROPIC_API_KEY)",
      // que para quien está con la factura en la mano no significa nada ni
      // sugiere qué hacer. El detalle técnico va al log, donde sirve.
      logger.warn("[ocr-invoice] sin OPENAI_API_KEY ni ANTHROPIC_API_KEY configuradas", {
        tenantId: auth.tenantId.slice(-6),
      });
      return NextResponse.json(
        {
          error:
            "La lectura automática de facturas todavía no está activada en esta tienda. Podés cargar la compra a mano mientras tanto.",
        },
        { status: 503 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: `Error procesando factura: ${message}` },
      { status: 500 },
    );
  }
}
