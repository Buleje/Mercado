import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { TemplateField } from "@/lib/types/documents";

/**
 * Plantillas del sistema (tenantId=null, isSystem=true).
 * Se cargan lazy al primer GET /templates si no existen.
 */

interface SystemTemplate {
  key: string;
  name: string;
  description: string;
  body: string;
  fields: TemplateField[];
}

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: "contrato-alquiler",
    name: "Contrato de alquiler",
    description: "Contrato simple de alquiler de local comercial o vivienda.",
    body: `# CONTRATO DE ALQUILER

Entre **{{arrendador}}** identificado con DNI/RUC **{{dniArrendador}}** (en adelante el ARRENDADOR) y **{{arrendatario}}** identificado con DNI/RUC **{{dniArrendatario}}** (en adelante el ARRENDATARIO), se acuerda lo siguiente:

## 1. Bien arrendado
El ARRENDADOR cede en uso el inmueble ubicado en **{{direccion}}**, distrito de {{distrito}}, provincia de {{provincia}}.

## 2. Precio y forma de pago
La renta mensual será de S/ **{{monto}}** pagaderos los primeros 5 días de cada mes.

## 3. Plazo
El contrato tiene una duración de **{{plazoMeses}}** meses contados desde el {{fechaInicio}}.

## 4. Garantía
El ARRENDATARIO entrega como garantía S/ **{{garantia}}** que será devuelta al término del contrato si no hay deudas pendientes.

## 5. Conformidad
Ambas partes aceptan las condiciones del presente contrato y firman en señal de conformidad.

Pucallpa, {{fechaInicio}}`,
    fields: [
      { name: "arrendador", label: "Nombre del arrendador", type: "text", required: true },
      { name: "dniArrendador", label: "DNI/RUC arrendador", type: "text", required: true },
      { name: "arrendatario", label: "Nombre del arrendatario", type: "text", required: true },
      { name: "dniArrendatario", label: "DNI/RUC arrendatario", type: "text", required: true },
      { name: "direccion", label: "Dirección del inmueble", type: "text", required: true },
      { name: "distrito", label: "Distrito", type: "text" },
      { name: "provincia", label: "Provincia", type: "text", placeholder: "Coronel Portillo" },
      { name: "monto", label: "Renta mensual (S/)", type: "currency", required: true },
      { name: "plazoMeses", label: "Plazo en meses", type: "number", required: true },
      { name: "garantia", label: "Garantía (S/)", type: "currency" },
      { name: "fechaInicio", label: "Fecha de inicio", type: "date", required: true },
    ],
  },
  {
    key: "recibo-pago",
    name: "Recibo de pago",
    description: "Recibo simple por servicios o productos recibidos.",
    body: `# RECIBO

## Recibí de: {{cliente}}

La suma de S/ **{{monto}}** ({{montoLetras}})

Por concepto de: **{{concepto}}**

Pucallpa, {{fecha}}

_____________________
{{firmante}}
{{dniFirmante}}`,
    fields: [
      { name: "cliente", label: "Cliente / Pagador", type: "text", required: true },
      { name: "monto", label: "Monto (S/)", type: "currency", required: true },
      { name: "montoLetras", label: "Monto en letras", type: "text", placeholder: "cien soles" },
      { name: "concepto", label: "Concepto", type: "textarea", required: true },
      { name: "fecha", label: "Fecha", type: "date", required: true },
      { name: "firmante", label: "Firmado por", type: "text", required: true },
      { name: "dniFirmante", label: "DNI", type: "text" },
    ],
  },
  {
    key: "cotizacion",
    name: "Cotización",
    description: "Cotización formal para un cliente o licitación.",
    body: `# COTIZACIÓN N° {{numero}}

## Cliente: {{cliente}}
RUC/DNI: {{ruc}}
Fecha: {{fecha}}
Válida hasta: {{validez}}

## Detalle:
{{detalle}}

## Total: S/ **{{total}}**

## Condiciones:
- Forma de pago: {{formaPago}}
- Tiempo de entrega: {{tiempoEntrega}}
- IGV incluido

Atentamente,
{{vendedor}}`,
    fields: [
      { name: "numero", label: "N° de cotización", type: "text", placeholder: "COT-2026-0001", required: true },
      { name: "cliente", label: "Cliente", type: "text", required: true },
      { name: "ruc", label: "RUC/DNI", type: "text" },
      { name: "fecha", label: "Fecha", type: "date", required: true },
      { name: "validez", label: "Válida hasta", type: "date", required: true },
      { name: "detalle", label: "Detalle de productos/servicios", type: "textarea", required: true },
      { name: "total", label: "Total (S/)", type: "currency", required: true },
      { name: "formaPago", label: "Forma de pago", type: "text", placeholder: "Contado / Crédito 30 días" },
      { name: "tiempoEntrega", label: "Tiempo de entrega", type: "text", placeholder: "3 días hábiles" },
      { name: "vendedor", label: "Vendedor responsable", type: "text", required: true },
    ],
  },
  {
    key: "acuerdo-proveedor",
    name: "Acuerdo con proveedor",
    description: "Acuerdo simple de suministro recurrente con un proveedor.",
    body: `# ACUERDO DE SUMINISTRO

Entre **{{empresa}}** (Cliente) y **{{proveedor}}** (Proveedor), se establece el siguiente acuerdo:

## 1. Objeto
El Proveedor se compromete a suministrar **{{producto}}** según los pedidos del Cliente.

## 2. Precio
El precio acordado es de S/ **{{precioUnit}}** por unidad. Variaciones >5% requieren acuerdo escrito.

## 3. Frecuencia
Entregas: **{{frecuencia}}**. Mínimo de pedido: **{{minimo}}** unidades.

## 4. Forma de pago
{{formaPago}} contra recepción conforme de mercadería.

## 5. Vigencia
Desde {{fechaInicio}} hasta {{fechaFin}}, renovable.

Pucallpa, {{fechaInicio}}`,
    fields: [
      { name: "empresa", label: "Nombre de la empresa (cliente)", type: "text", required: true },
      { name: "proveedor", label: "Nombre del proveedor", type: "text", required: true },
      { name: "producto", label: "Producto/servicio a suministrar", type: "textarea", required: true },
      { name: "precioUnit", label: "Precio por unidad (S/)", type: "currency", required: true },
      { name: "frecuencia", label: "Frecuencia de entrega", type: "text", placeholder: "Semanal / Mensual" },
      { name: "minimo", label: "Pedido mínimo", type: "number" },
      { name: "formaPago", label: "Forma de pago", type: "text", placeholder: "Crédito 15 días" },
      { name: "fechaInicio", label: "Fecha de inicio", type: "date", required: true },
      { name: "fechaFin", label: "Fecha de fin", type: "date", required: true },
    ],
  },
];

let _seeded = false;

/**
 * Idempotente — corre una sola vez por process. Si la plantilla key existe (tenantId=null),
 * no la toca. Solo crea las faltantes.
 */
export async function ensureSystemTemplatesSeeded(): Promise<void> {
  if (_seeded) return;
  try {
    for (const t of SYSTEM_TEMPLATES) {
      const exists = await prisma.documentTemplate.findFirst({
        where: { key: t.key, tenantId: null },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.documentTemplate.create({
        data: {
          tenantId: null,
          key: t.key,
          name: t.name,
          description: t.description,
          body: t.body,
          fields: t.fields as unknown as object,
          isSystem: true,
        },
      });
    }
    _seeded = true;
  } catch (err) {
    logger.warn("documents.templates.seed_fail", { err: String(err) });
  }
}
