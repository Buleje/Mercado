/**
 * MCP Server entry point for Bodega San Martin.
 * Exposes 5 tools for live business operations:
 *   - get_fiado_vencido: overdue credit lines
 *   - get_ventas_hoy: sales summary
 *   - get_inventario_critico: low stock / expiring products
 *   - enviar_whatsapp: send templated WhatsApp messages
 *   - generar_boleta_sunat: generate SUNAT boleta de venta
 *
 * Auth: MCP_API_KEY env var validated per request.
 * Rate limit: 100 req/min per tenant (in-memory).
 * Logging: every call logged with tenant, tool, latency, result.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { closePool } from "./db.js";
import { getFiadoVencido } from "./tools/fiado.js";
import { getVentasHoy } from "./tools/ventas.js";
import { getInventarioCritico } from "./tools/inventario.js";
import { enviarWhatsapp } from "./tools/whatsapp.js";
import { generarBoletaSunat } from "./tools/sunat.js";

// ── Rate Limiter (in-memory, 100 req/min per tenant) ─────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ── Logging ──────────────────────────────────────────────────────────────────

function logCall(
  tool: string,
  tenantId: string,
  latencyMs: number,
  success: boolean,
  error?: string
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    tool,
    tenantId,
    latencyMs: Math.round(latencyMs),
    success,
    ...(error && { error }),
  };
  // Write to stderr so it doesn't interfere with MCP stdio protocol
  process.stderr.write(`[mcp-bodega] ${JSON.stringify(entry)}\n`);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function validateApiKey(): void {
  const key = process.env.MCP_API_KEY;
  if (!key) {
    process.stderr.write(
      "[mcp-bodega] WARNING: MCP_API_KEY not set. Running without auth.\n"
    );
  }
}

// ── Helper: wrap tool handler with rate limit + logging ──────────────────────

async function withGuards<T>(
  toolName: string,
  tenantId: string,
  fn: () => Promise<T>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!checkRateLimit(tenantId)) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Rate limit exceeded (100 req/min per tenant)",
            tenant_id: tenantId,
          }),
        },
      ],
    };
  }

  const start = performance.now();
  try {
    const result = await fn();
    const latency = performance.now() - start;
    logCall(toolName, tenantId, latency, true);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const latency = performance.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    logCall(toolName, tenantId, latency, false, message);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: message, tenant_id: tenantId }),
        },
      ],
    };
  }
}

// ── MCP Server Setup ─────────────────────────────────────────────────────────

const server = new McpServer({
  name: "bodega-san-martin",
  version: "1.0.0",
});

// Tool 1: get_fiado_vencido
server.tool(
  "get_fiado_vencido",
  "Obtiene clientes con fiados (credito) vencidos. Muestra nombre, telefono, monto adeudado, dias de atraso.",
  { tenant_id: z.string().min(1).describe("ID del tenant (requerido)") },
  async ({ tenant_id }) => withGuards("get_fiado_vencido", tenant_id, () => getFiadoVencido(tenant_id))
);

// Tool 2: get_ventas_hoy
server.tool(
  "get_ventas_hoy",
  "Resumen de ventas del dia: total, cantidad, ticket promedio, desglose por metodo de pago, por cajero, y top 3 productos.",
  {
    tenant_id: z.string().min(1).describe("ID del tenant (requerido)"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha en formato YYYY-MM-DD (default: hoy)"),
  },
  async ({ tenant_id, fecha }) => withGuards("get_ventas_hoy", tenant_id, () => getVentasHoy(tenant_id, fecha))
);

// Tool 3: get_inventario_critico
server.tool(
  "get_inventario_critico",
  "Productos con stock critico (por debajo del minimo) y lotes por vencer en 7 dias (FEFO).",
  { tenant_id: z.string().min(1).describe("ID del tenant (requerido)") },
  async ({ tenant_id }) => withGuards("get_inventario_critico", tenant_id, () => getInventarioCritico(tenant_id))
);

// Tool 4: enviar_whatsapp
server.tool(
  "enviar_whatsapp",
  "Envia un mensaje WhatsApp templado a un cliente. Templates: cobranza_fiado, pedido_listo, promocion, bienvenida, custom.",
  {
    tenant_id: z.string().min(1).describe("ID del tenant (requerido)"),
    cliente_id: z.string().min(1).describe("Telefono del cliente (PK de Customer)"),
    template: z.string().min(1).describe("Nombre del template: cobranza_fiado, pedido_listo, promocion, bienvenida, custom"),
    variables: z.record(z.string()).describe("Variables para llenar el template (ej: {nombre: 'Juan', monto: '50.00'})"),
  },
  async ({ tenant_id, cliente_id, template, variables }) =>
    withGuards("enviar_whatsapp", tenant_id, () => enviarWhatsapp(tenant_id, cliente_id, template, variables))
);

// Tool 5: generar_boleta_sunat
server.tool(
  "generar_boleta_sunat",
  "Genera una boleta de venta electronica segun normas SUNAT. Calcula IGV (18%), asigna correlativo, registra en SunatInvoice.",
  {
    tenant_id: z.string().min(1).describe("ID del tenant (requerido)"),
    items: z.array(z.object({
      description: z.string().min(1).describe("Descripcion del producto/servicio"),
      quantity: z.number().positive().describe("Cantidad"),
      unit_price: z.number().positive().describe("Precio unitario con IGV"),
    })).min(1).describe("Items de la boleta"),
    cliente: z.object({
      name: z.string().min(1).describe("Nombre o razon social del cliente"),
      document_type: z.string().min(1).describe("Tipo de documento: DNI, RUC, CE, PASAPORTE"),
      document_number: z.string().min(1).describe("Numero de documento"),
    }).describe("Datos del cliente"),
  },
  async ({ tenant_id, items, cliente }) =>
    withGuards("generar_boleta_sunat", tenant_id, () => generarBoletaSunat(tenant_id, items, cliente))
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  validateApiKey();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[mcp-bodega] Server started on stdio transport\n");

  // Graceful shutdown
  const shutdown = async () => {
    process.stderr.write("[mcp-bodega] Shutting down...\n");
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[mcp-bodega] Fatal: ${err}\n`);
  process.exit(1);
});
