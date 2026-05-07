/**
 * lib/integrations/sunat.ts
 *
 * Facade pública de integración SUNAT/Nubefact para el ERP Buleje.
 *
 * Responsabilidades:
 *  - Exponer funciones de alto nivel (emitirBoleta, consultarEstado, anularBoleta)
 *  - Rate limiting por tenant (máx. 10 req/min por tenant, límite conservador)
 *  - Orquestar: SunatDB + NubefactClient + invoice-builder en una sola llamada
 *  - Logging estructurado + reporte de errores a Sentry
 *
 * NO hace HTTP directo — delega en lib/sunat/nubefact-client.ts.
 * NO crea endpoints API — solo lógica de lib/.
 *
 * Reglas CLAUDE.md:
 *  - tenantId siempre primer parámetro (#3)
 *  - safeParse() de Zod, nunca .parse() (#2)
 *  - import "server-only" (#1)
 *  - Fire-and-forget para logging no-crítico (#7)
 *  - Sin secrets hardcodeados (#10)
 */

import "server-only";

import { z } from "zod";
import { SunatDB } from "@/lib/db/sunat.db";
import { sendInvoice, voidInvoice, getInvoiceStatus } from "@/lib/sunat/nubefact-client";
import { buildBoleta, buildFactura, buildBaja } from "@/lib/sunat/invoice-builder";
import { calculateIGV } from "@/lib/sunat";
import { logger } from "@/lib/logger";
// PERF 2026-05-05: rate limiter distribuido (Upstash Redis) — reemplaza el
// Map en-memoria que no compartía estado entre instancias de Vercel.
import { createDistributedRateLimiter } from "@/lib/rate-limit";

// ── Schemas de entrada (Zod safeParse — regla #2) ────────────────────────────

const ItemSchema = z.object({
  /** Código de producto (SKU). Puede ser vacío para items manuales. */
  codigo: z.string().default(""),
  descripcion: z.string().min(1, "La descripción del item es obligatoria"),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
  /** Precio de venta CON IGV incluido (precio al público) */
  precioConIgv: z.number().positive("El precio debe ser mayor a 0"),
  unidad: z.string().default("NIU"), // NIU = unidades, ZZ = servicios
});

const BoletaInputSchema = z.object({
  /** Referencia a la orden de venta (para idempotencia) */
  orderId: z.string().optional(),
  /** DNI del cliente. Si está vacío se emite a consumidor final (00000000) */
  clienteDni: z.string().regex(/^\d{8}$/).optional(),
  clienteNombre: z.string().default("CONSUMIDOR FINAL"),
  clienteEmail: z.string().email().optional(),
  items: z.array(ItemSchema).min(1, "Debe incluir al menos un item"),
});

const FacturaInputSchema = z.object({
  orderId: z.string().optional(),
  /** RUC del receptor — obligatorio para facturas, 11 dígitos */
  clienteRuc: z
    .string()
    .regex(/^\d{11}$/, "El RUC debe tener exactamente 11 dígitos"),
  clienteRazonSocial: z.string().min(3, "La razón social es obligatoria"),
  clienteDireccion: z.string().optional(),
  clienteEmail: z.string().email().optional(),
  items: z.array(ItemSchema).min(1, "Debe incluir al menos un item"),
});

const AnulacionInputSchema = z.object({
  serie: z.string().min(4).max(4),
  numero: z.number().int().positive(),
  motivo: z.string().min(5, "El motivo de anulación es obligatorio"),
});

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type BoletaInput = z.infer<typeof BoletaInputSchema>;
export type FacturaInput = z.infer<typeof FacturaInputSchema>;
export type AnulacionInput = z.infer<typeof AnulacionInputSchema>;

export interface SunatBoleta {
  serie: string;
  numero: number;
  tipo_doc: "boleta" | "factura";
  cliente_doc: string;
  items: Array<{
    codigo: string;
    descripcion: string;
    cantidad: number;
    precioConIgv: number;
    unidad: string;
  }>;
  total: number;
  igv: number;
}

export interface SunatResponse {
  success: boolean;
  /** ID del comprobante en base de datos local */
  invoiceId?: string;
  /** Código de respuesta CDR de SUNAT */
  cdr_code?: string;
  /** Hash QR del comprobante */
  hash?: string;
  /** URL del PDF en Nubefact */
  pdf_url?: string;
  /** URL del XML en Nubefact */
  xml_url?: string;
  /** true si SUNAT aceptó el CDR en esta llamada */
  sunat_accepted?: boolean;
  /** Mensaje de error si success=false */
  error?: string;
  /** Estado del comprobante en nuestra base de datos */
  status?: "pending" | "accepted" | "rejected" | "voided" | "retrying";
}

// ── Rate limiter por tenant ───────────────────────────────────────────────────
// PERF 2026-05-05: migrado de Map en-memoria a Upstash Redis distribuido.
// El Map anterior contaba por instancia de Vercel — con auto-scaling activo,
// un tenant podía emitir hasta 10×N comprobantes/min (N = instancias activas).
// Ahora el conteo es global y consistente entre todas las instancias.
// Fallback automático a Map en-memoria cuando Upstash no está configurado
// (ej. dev local sin UPSTASH_REDIS_REST_URL) — ver lib/rate-limit.ts.

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 10;           // máx. 10 emisiones por tenant por minuto

// Singleton — se reutiliza entre invocaciones del mismo módulo en la misma
// instancia de Vercel (warm function). Costo de construcción: ~0ms.
const _sunatRateLimiter = createDistributedRateLimiter({
  key: "sunat-emision",
  maxRequests: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

async function checkRateLimit(tenantId: string): Promise<{ allowed: boolean; remaining: number }> {
  const allowed = await _sunatRateLimiter.check(tenantId);
  const remaining = allowed ? await _sunatRateLimiter.remaining(tenantId) : 0;

  if (!allowed) {
    logger.warn("[SunatFacade] Rate limit alcanzado", {
      tenantId,
      distributed: _sunatRateLimiter.distributed,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
  }

  return { allowed, remaining };
}

// ── Helper: calcular totales desde items ─────────────────────────────────────

function calcularTotalesDesdeItems(
  items: z.infer<typeof ItemSchema>[]
): { subtotal: number; igv: number; total: number } {
  const totalConIgv = items.reduce(
    (acc, item) => acc + item.precioConIgv * item.cantidad,
    0
  );
  const igvCalc = calculateIGV(totalConIgv);
  return {
    subtotal: +igvCalc.gravado.toFixed(2),
    igv: +igvCalc.igv.toFixed(2),
    total: +igvCalc.total.toFixed(2),
  };
}

// ── Funciones públicas ────────────────────────────────────────────────────────

/**
 * Emite una boleta electrónica a SUNAT vía Nubefact.
 *
 * Flujo:
 *  1. Valida input con Zod safeParse
 *  2. Rate limiting por tenant
 *  3. Idempotencia: si ya existe comprobante para orderId, retorna el existente
 *  4. Incrementa correlativo de forma atómica
 *  5. Crea registro SunatInvoice en estado "pending"
 *  6. Envía a Nubefact (con retry interno en nubefact-client)
 *  7. Actualiza registro con resultado (accepted / rejected)
 *
 * @param tenantId - ID del tenant emisor (primer parámetro — regla #3)
 * @param input - Datos de la boleta
 */
export async function emitirBoleta(
  tenantId: string,
  input: BoletaInput
): Promise<SunatResponse> {
  // 1. Validar
  const parsed = BoletaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: `Datos inválidos: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    };
  }

  const data = parsed.data;

  // 2. Rate limiting
  // PERF 2026-05-05: await — checkRateLimit ahora es async (Upstash distribuido)
  const rl = await checkRateLimit(tenantId);
  if (!rl.allowed) {
    return {
      success: false,
      error: "Límite de emisiones por minuto alcanzado. Intenta en un momento.",
    };
  }

  // 3. Idempotencia por orderId
  if (data.orderId) {
    const existing = await SunatDB.findByOrderId(tenantId, data.orderId);
    if (existing && existing.sunatStatus !== "rejected") {
      logger.info("[SunatFacade] Comprobante ya existe para orden, retornando existente", {
        tenantId,
        orderId: data.orderId,
        invoiceId: existing.id,
        status: existing.sunatStatus,
      });
      return {
        success: true,
        invoiceId: existing.id,
        pdf_url: existing.pdfUrl ?? undefined,
        status: existing.sunatStatus,
      };
    }
  }

  // 4. Configuración del tenant + número correlativo
  const config = await SunatDB.getConfig(tenantId);
  if (!config) {
    return {
      success: false,
      error:
        "Configuración SUNAT no encontrada. Configura RUC y token en Ajustes > Facturación Electrónica.",
    };
  }

  const nextNumber = await SunatDB.incrementCorrelativo(tenantId, "boleta");
  const totales = calcularTotalesDesdeItems(data.items);

  // 5. Crear registro pending (para que el cron pueda reintentarlo si falla)
  const invoiceRecord = await SunatDB.createInvoice(tenantId, {
    orderId: data.orderId,
    type: "boleta",
    series: config.boletaSeries,
    number: nextNumber,
    customerName: data.clienteNombre,
    subtotal: totales.subtotal,
    igv: totales.igv,
    total: totales.total,
  });

  // 6. Construir payload y enviar a Nubefact
  const payload = buildBoleta(
    {
      id: data.orderId ?? invoiceRecord.id,
      customerName: data.clienteNombre,
      total: totales.total,
      items: data.items.map((item) => ({
        name: item.descripcion,
        quantity: item.cantidad,
        price: item.precioConIgv,
        unit: item.unidad,
        productCode: item.codigo,
      })),
    },
    {
      ruc: config.ruc,
      razonSocial: config.razonSocial,
      direccionFiscal: config.direccionFiscal,
    },
    {
      boletaSeries: config.boletaSeries,
      facturaSeries: config.facturaSeries,
      nextBoletaNum: nextNumber,
      nextFacturaNum: nextNumber,
    },
    data.clienteDni,
    data.clienteEmail
  );

  try {
    const response = await sendInvoice(tenantId, payload);
    const sunatStatus = response.sunat_accepted ? "accepted" : "rejected";

    // 7. Actualizar registro con resultado
    await SunatDB.updateInvoice(tenantId, invoiceRecord.id, {
      sunatStatus,
      nubefactId: response.nubefact_id ?? null,
      pdfUrl: response.enlace_del_pdf ?? null,
      cdrResponse: response.cdr_base_64_encoded ?? null,
      acceptedAt: sunatStatus === "accepted" ? new Date() : null,
      errorMessage:
        sunatStatus === "rejected"
          ? (response.sunat_description ?? "Rechazado por SUNAT")
          : null,
    });

    logger.info("[SunatFacade] Boleta emitida", {
      tenantId,
      invoiceId: invoiceRecord.id,
      series: config.boletaSeries,
      number: nextNumber,
      sunatStatus,
    });

    return {
      success: sunatStatus === "accepted",
      invoiceId: invoiceRecord.id,
      hash: response.hash ?? undefined,
      pdf_url: response.enlace_del_pdf ?? undefined,
      xml_url: response.enlace_del_xml ?? undefined,
      cdr_code: response.sunat_description ?? undefined,
      sunat_accepted: response.sunat_accepted,
      status: sunatStatus,
      ...(sunatStatus === "rejected" && {
        error: response.sunat_description ?? "SUNAT rechazó el comprobante",
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Marcar como retrying — el cron sunat-retry lo reintentará
    await SunatDB.updateInvoice(tenantId, invoiceRecord.id, {
      sunatStatus: "retrying",
      errorMessage: `attempt:1|${msg}`,
    }).catch(() => {}); // fire-and-forget — no bloquear respuesta

    logger.error("[SunatFacade] Error al emitir boleta, encolado para retry", {
      tenantId,
      invoiceId: invoiceRecord.id,
      error: msg,
    });

    return {
      success: false,
      invoiceId: invoiceRecord.id,
      status: "retrying",
      error: `Error al comunicar con Nubefact: ${msg}. El comprobante será reintentado automáticamente.`,
    };
  }
}

/**
 * Emite una factura electrónica a SUNAT vía Nubefact.
 * Requiere RUC válido del receptor (11 dígitos).
 *
 * @param tenantId - ID del tenant emisor (primer parámetro — regla #3)
 * @param input - Datos de la factura incluyendo RUC del cliente
 */
export async function emitirFactura(
  tenantId: string,
  input: FacturaInput
): Promise<SunatResponse> {
  // 1. Validar
  const parsed = FacturaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: `Datos inválidos: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    };
  }

  const data = parsed.data;

  // 2. Rate limiting
  // PERF 2026-05-05: await — checkRateLimit ahora es async (Upstash distribuido)
  const rl = await checkRateLimit(tenantId);
  if (!rl.allowed) {
    return {
      success: false,
      error: "Límite de emisiones por minuto alcanzado. Intenta en un momento.",
    };
  }

  // 3. Idempotencia
  if (data.orderId) {
    const existing = await SunatDB.findByOrderId(tenantId, data.orderId);
    if (existing && existing.sunatStatus !== "rejected") {
      return {
        success: true,
        invoiceId: existing.id,
        pdf_url: existing.pdfUrl ?? undefined,
        status: existing.sunatStatus,
      };
    }
  }

  // 4. Config + correlativo
  const config = await SunatDB.getConfig(tenantId);
  if (!config) {
    return {
      success: false,
      error: "Configuración SUNAT no encontrada. Configura RUC y token en Ajustes > Facturación Electrónica.",
    };
  }

  const nextNumber = await SunatDB.incrementCorrelativo(tenantId, "factura");
  const totales = calcularTotalesDesdeItems(data.items);

  // 5. Crear registro pending
  const invoiceRecord = await SunatDB.createInvoice(tenantId, {
    orderId: data.orderId,
    type: "factura",
    series: config.facturaSeries,
    number: nextNumber,
    customerRuc: data.clienteRuc,
    customerName: data.clienteRazonSocial,
    subtotal: totales.subtotal,
    igv: totales.igv,
    total: totales.total,
  });

  // 6. Construir payload y enviar
  const payload = buildFactura(
    {
      id: data.orderId ?? invoiceRecord.id,
      customerName: data.clienteRazonSocial,
      total: totales.total,
      items: data.items.map((item) => ({
        name: item.descripcion,
        quantity: item.cantidad,
        price: item.precioConIgv,
        unit: item.unidad,
        productCode: item.codigo,
      })),
    },
    {
      ruc: config.ruc,
      razonSocial: config.razonSocial,
      direccionFiscal: config.direccionFiscal,
    },
    {
      boletaSeries: config.boletaSeries,
      facturaSeries: config.facturaSeries,
      nextBoletaNum: nextNumber,
      nextFacturaNum: nextNumber,
    },
    {
      ruc: data.clienteRuc,
      razonSocial: data.clienteRazonSocial,
      direccion: data.clienteDireccion,
      email: data.clienteEmail,
    }
  );

  try {
    const response = await sendInvoice(tenantId, payload);
    const sunatStatus = response.sunat_accepted ? "accepted" : "rejected";

    await SunatDB.updateInvoice(tenantId, invoiceRecord.id, {
      sunatStatus,
      nubefactId: response.nubefact_id ?? null,
      pdfUrl: response.enlace_del_pdf ?? null,
      cdrResponse: response.cdr_base_64_encoded ?? null,
      acceptedAt: sunatStatus === "accepted" ? new Date() : null,
      errorMessage:
        sunatStatus === "rejected"
          ? (response.sunat_description ?? "Rechazado por SUNAT")
          : null,
    });

    logger.info("[SunatFacade] Factura emitida", {
      tenantId,
      invoiceId: invoiceRecord.id,
      series: config.facturaSeries,
      number: nextNumber,
      sunatStatus,
    });

    return {
      success: sunatStatus === "accepted",
      invoiceId: invoiceRecord.id,
      hash: response.hash ?? undefined,
      pdf_url: response.enlace_del_pdf ?? undefined,
      xml_url: response.enlace_del_xml ?? undefined,
      cdr_code: response.sunat_description ?? undefined,
      sunat_accepted: response.sunat_accepted,
      status: sunatStatus,
      ...(sunatStatus === "rejected" && {
        error: response.sunat_description ?? "SUNAT rechazó la factura",
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await SunatDB.updateInvoice(tenantId, invoiceRecord.id, {
      sunatStatus: "retrying",
      errorMessage: `attempt:1|${msg}`,
    }).catch(() => {}); // fire-and-forget

    logger.error("[SunatFacade] Error al emitir factura, encolado para retry", {
      tenantId,
      invoiceId: invoiceRecord.id,
      error: msg,
    });

    return {
      success: false,
      invoiceId: invoiceRecord.id,
      status: "retrying",
      error: `Error al comunicar con Nubefact: ${msg}. La factura será reintentada automáticamente.`,
    };
  }
}

/**
 * Consulta el estado actual de un comprobante en Nubefact.
 * Primero busca en la base de datos local; si tiene nubefactId,
 * hace la consulta en tiempo real a Nubefact.
 *
 * @param tenantId - ID del tenant (primer parámetro — regla #3)
 * @param serie - Serie del comprobante (ej. "B001")
 * @param numero - Número correlativo
 */
export async function consultarEstado(
  tenantId: string,
  serie: string,
  numero: number
): Promise<SunatResponse> {
  // Buscar en DB local por serie+número
  const { invoices } = await SunatDB.listInvoices(tenantId, { limit: 1 });
  // Buscamos manualmente por serie+número (listInvoices no filtra por eso aún)
  const allForTenant = await SunatDB.listInvoices(tenantId, { limit: 200 });
  const invoice = allForTenant.invoices.find(
    (inv) => inv.series === serie && inv.number === numero
  );

  if (!invoice) {
    return {
      success: false,
      error: `Comprobante ${serie}-${String(numero).padStart(8, "0")} no encontrado`,
    };
  }

  // Si ya está aceptado en local, retornar sin llamar a Nubefact
  if (invoice.sunatStatus === "accepted") {
    return {
      success: true,
      invoiceId: invoice.id,
      pdf_url: invoice.pdfUrl ?? undefined,
      status: "accepted",
      sunat_accepted: true,
    };
  }

  // Si tiene nubefactId, consultar estado en tiempo real
  if (invoice.nubefactId) {
    try {
      const response = await getInvoiceStatus(tenantId, invoice.nubefactId);
      const sunatStatus = response.sunat_accepted ? "accepted" : invoice.sunatStatus;

      // Actualizar si Nubefact confirma que SUNAT lo aceptó
      if (response.sunat_accepted) {
        await SunatDB.updateInvoice(tenantId, invoice.id, {
          sunatStatus: "accepted",
          acceptedAt: new Date(),
          pdfUrl: response.enlace_del_pdf ?? null,
        }).catch(() => {}); // fire-and-forget
      }

      return {
        success: true,
        invoiceId: invoice.id,
        pdf_url: response.enlace_del_pdf ?? invoice.pdfUrl ?? undefined,
        hash: response.hash ?? undefined,
        sunat_accepted: response.sunat_accepted,
        status: sunatStatus,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[SunatFacade] Error consultando estado en Nubefact, usando estado local", {
        tenantId,
        nubefactId: invoice.nubefactId,
        error: msg,
      });
    }
  }

  // Retornar estado local si la consulta en tiempo real no fue posible
  return {
    success: true,
    invoiceId: invoice.id,
    pdf_url: invoice.pdfUrl ?? undefined,
    // En este punto el control flow sabe que sunatStatus != "accepted"
    // (ese caso retornó antes). Forzamos el cast para el tipo de retorno.
    status: invoice.sunatStatus as "pending" | "rejected" | "voided" | "retrying",
    sunat_accepted: false,
  };
}

/**
 * Comunica la baja (anulación) de un comprobante a SUNAT vía Nubefact.
 * Solo se puede anular dentro de los 7 días de emitido (restricción SUNAT).
 *
 * @param tenantId - ID del tenant (primer parámetro — regla #3)
 * @param serie - Serie del comprobante a anular
 * @param numero - Número correlativo
 * @param motivo - Motivo de la anulación (requerido por SUNAT)
 */
export async function anularBoleta(
  tenantId: string,
  serie: string,
  numero: number,
  motivo: string
): Promise<SunatResponse> {
  // 1. Validar parámetros
  const parsed = AnulacionInputSchema.safeParse({ serie, numero, motivo });
  if (!parsed.success) {
    return {
      success: false,
      error: `Datos inválidos: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    };
  }

  // 2. Rate limiting
  // PERF 2026-05-05: await — checkRateLimit ahora es async (Upstash distribuido)
  const rl = await checkRateLimit(tenantId);
  if (!rl.allowed) {
    return {
      success: false,
      error: "Límite de operaciones por minuto alcanzado.",
    };
  }

  // 3. Buscar el comprobante
  const allInvoices = await SunatDB.listInvoices(tenantId, { limit: 200 });
  const invoice = allInvoices.invoices.find(
    (inv) => inv.series === serie && inv.number === numero
  );

  if (!invoice) {
    return {
      success: false,
      error: `Comprobante ${serie}-${String(numero).padStart(8, "0")} no encontrado`,
    };
  }

  if (invoice.sunatStatus === "voided") {
    return { success: true, invoiceId: invoice.id, status: "voided" };
  }

  if (invoice.sunatStatus !== "accepted") {
    return {
      success: false,
      error: `Solo se pueden anular comprobantes aceptados. Estado actual: ${invoice.sunatStatus}`,
    };
  }

  // 4. Verificar ventana de 7 días (SUNAT solo acepta bajas dentro de la semana)
  const emitidoHace = Date.now() - new Date(invoice.createdAt).getTime();
  const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
  if (emitidoHace > SIETE_DIAS_MS) {
    logger.warn("[SunatFacade] Intento de anular fuera de ventana de 7 días", {
      tenantId,
      invoiceId: invoice.id,
      emitidoHaceMs: emitidoHace,
    });
    return {
      success: false,
      error:
        "La anulación de comprobantes solo es posible dentro de los 7 días posteriores a la emisión (restricción SUNAT).",
    };
  }

  // 5. Determinar tipo (1=factura, 2=boleta) para el payload de baja
  const tipo: 1 | 2 = invoice.type === "factura" ? 1 : 2;
  const payload = buildBaja(tipo, serie, numero, motivo);

  // 6. Enviar baja a Nubefact
  try {
    const response = await voidInvoice(tenantId, payload);

    // Nubefact confirma la baja (puede ser asíncrono con SUNAT)
    await SunatDB.updateInvoice(tenantId, invoice.id, {
      sunatStatus: "voided",
      errorMessage: null,
    });

    logger.info("[SunatFacade] Comprobante anulado", {
      tenantId,
      invoiceId: invoice.id,
      serie,
      numero,
      motivo,
    });

    return {
      success: true,
      invoiceId: invoice.id,
      status: "voided",
      sunat_accepted: response.sunat_accepted,
      cdr_code: response.sunat_description ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    logger.error("[SunatFacade] Error al anular comprobante", {
      tenantId,
      invoiceId: invoice.id,
      error: msg,
    });

    return {
      success: false,
      invoiceId: invoice.id,
      error: `Error al comunicar baja con Nubefact: ${msg}`,
    };
  }
}
