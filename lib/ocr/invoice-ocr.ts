import "server-only";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #83 — OCR facturas proveedor
 *
 * Pipeline simple de OCR para facturas de proveedores. Acepta la URL o el
 * buffer de una imagen/PDF y devuelve los campos estructurados que
 * necesita `PurchaseOrder`: fecha, ruc, total, items[].
 *
 * La implementación inicial usa OpenAI vision API (gpt-4o-mini) porque ya
 * tenemos OPENAI_API_KEY activa. Si no hay key configurada, devuelve un
 * resultado vacío con `ok: false` y el caller muestra "ingrese manualmente".
 */

export interface OcrInvoiceResult {
  ok: boolean;
  ruc?: string;
  supplierName?: string;
  invoiceNumber?: string;
  date?: string;
  total?: number;
  items?: { description: string; quantity: number; unitPrice: number; total: number }[];
  rawText?: string;
  error?: string;
}

const OPENAI_VISION_URL = "https://api.openai.com/v1/chat/completions";

const OCR_PROMPT = `Eres un extractor de facturas peruanas. Recibes una imagen de factura (SUNAT boleta o factura) y devuelves SOLO un JSON valido con esta forma:
{
  "ruc": "20XXXXXXXX",
  "supplierName": "RAZON SOCIAL",
  "invoiceNumber": "F001-00001",
  "date": "YYYY-MM-DD",
  "total": 123.45,
  "items": [
    { "description": "ARROZ 1KG", "quantity": 10, "unitPrice": 4.5, "total": 45.0 }
  ]
}

Si algun campo no es visible, omitelo del JSON. No pongas texto extra fuera del JSON.`;

export async function ocrInvoice(imageUrl: string): Promise<OcrInvoiceResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OCR deshabilitado — falta OPENAI_API_KEY" };
  }
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    return { ok: false, error: "imageUrl invalida" };
  }

  try {
    const res = await fetch(OPENAI_VISION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `OpenAI returned ${res.status}` };
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return { ok: false, rawText: content, error: "no JSON found in response" };
    }

    const parsed = JSON.parse(match[0]) as Partial<OcrInvoiceResult>;
    return {
      ok: true,
      ruc: typeof parsed.ruc === "string" ? parsed.ruc : undefined,
      supplierName: typeof parsed.supplierName === "string" ? parsed.supplierName : undefined,
      invoiceNumber: typeof parsed.invoiceNumber === "string" ? parsed.invoiceNumber : undefined,
      date: typeof parsed.date === "string" ? parsed.date : undefined,
      total: typeof parsed.total === "number" ? parsed.total : undefined,
      items: Array.isArray(parsed.items) ? parsed.items : undefined,
      rawText: content,
    };
  } catch (err) {
    logger.error("[ocr-invoice] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
