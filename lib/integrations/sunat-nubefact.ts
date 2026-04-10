/**
 * SUNAT Electronic Invoicing via NubeFact API
 * Emits boletas and facturas electronicas legally in Peru
 * Env: NUBEFACT_TOKEN, NUBEFACT_URL
 * Docs: https://www.nubefact.com/integracion
 */

import { z } from "zod";

const NUBEFACT_URL = process.env.NUBEFACT_URL || "https://api.nubefact.com/api/v1";
const NUBEFACT_TOKEN = process.env.NUBEFACT_TOKEN || "";

const BoletaItem = z.object({
  unidad_de_medida: z.string().default("NIU"),
  codigo: z.string(),
  descripcion: z.string(),
  cantidad: z.number().positive(),
  valor_unitario: z.number().positive(),
  precio_unitario: z.number().positive(),
  subtotal: z.number(),
  tipo_de_igv: z.number().default(1),
  igv: z.number(),
  total: z.number(),
  anticipo_regularizacion: z.boolean().default(false),
});

const BoletaInput = z.object({
  tenantId: z.string().min(1),
  serie: z.string().default("B001"),
  numero: z.number().positive(),
  cliente_tipo_documento: z.enum(["1", "6"]).default("1"), // 1=DNI, 6=RUC
  cliente_numero_documento: z.string(),
  cliente_denominacion: z.string(),
  total_gravada: z.number(),
  total_igv: z.number(),
  total: z.number(),
  items: z.array(BoletaItem).min(1),
});

export type BoletaData = z.infer<typeof BoletaInput>;

export async function emitirBoleta(input: BoletaData) {
  const parsed = BoletaInput.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  if (!NUBEFACT_TOKEN) {
    return { success: false, error: "NUBEFACT_TOKEN no configurado" };
  }

  const { serie, numero, items, ...rest } = parsed.data;

  const body = {
    operacion: "generar_comprobante",
    tipo_de_comprobante: 2, // 2 = Boleta
    serie,
    numero,
    sunat_transaction: 1, // 1 = Venta interna
    moneda: 1, // 1 = Soles
    fecha_de_emision: new Date().toISOString().split("T")[0],
    ...rest,
    items: items.map((item) => ({
      ...item,
      tipo_de_igv: 1, // Gravado
    })),
  };

  const res = await fetch(`${NUBEFACT_URL}/${NUBEFACT_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.errors || data.message || "Error SUNAT" };
  }

  return {
    success: true,
    pdf_url: data.enlace_del_pdf,
    xml_url: data.enlace_del_xml,
    cdr_url: data.enlace_del_cdr,
    hash: data.cadena_para_codigo_qr,
    sunat_accepted: data.aceptada_por_sunat,
  };
}

export async function consultarRUC(ruc: string) {
  const res = await fetch(
    `https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  return res.json() as Promise<{
    nombre: string;
    estado: string;
    direccion: string;
    departamento: string;
  }>;
}

export async function consultarDNI(dni: string) {
  const res = await fetch(
    `https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  return res.json() as Promise<{
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
  }>;
}
