"use client";

/**
 * Los destinos de «Lee un papel», todos por endpoints que ya existen: compra
 * (`/api/purchases`), cobro de fiado (`/api/fiados/cobrar`), el drive (lo mismo
 * que el escáner de Documentos) y la pasarela a «Precios en bloque». Tras cada
 * guardado, el recibo de Comandos IA (si todavía no existe, no rompe nada).
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { scanToPdf, subirArchivosAlDrive } from "@/hooks/use-documents";
import type { FilaPrecio, ProductoSugerido } from "@/lib/admin/comandos-ia/papel";
import type { Papel } from "./use-leer-papel";

export type SubComandos = "papel" | "precios" | "mensajes" | "historial";

export interface FilaCompraBorrador {
  clave: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  producto: ProductoSugerido | null;
  alternativas: ProductoSugerido[];
}

async function enviar<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: unknown; message?: unknown } | null) ?? {};
    const msg = typeof e.error === "string" ? e.error : typeof e.message === "string" ? e.message : null;
    throw new Error(msg ?? (res.status === 403 ? "Tu rol no puede guardar esto." : `No se pudo guardar (${res.status}).`));
  }
  return data as T;
}

/** El recibo de lo que hizo la IA. Fuego y olvido: si la ruta aún no existe, sólo se anota en el log. */
export function anotarRecibo(body: { tipo: "compra" | "cobro" | "documento"; resumen: string; filas?: number; costoIaUsd?: number; refId?: string }): void {
  enviar("/api/admin/comandos-ia/recibos", { ...body, resumen: body.resumen.slice(0, 200) })
    .catch((err) => logger.warn("[comandos-ia/papel] recibo no anotado", { err: String(err) }));
}

export interface CompraYaCargada {
  id: string;
  total: number;
  fecha: string;
  proveedor: string;
}

/**
 * ¿Ya hay una compra (no cancelada) con ese N.º de comprobante? Para avisar antes
 * de duplicarla. Un GET por número: una fila, sin bajar todas las compras.
 */
export async function buscarCompraConNumero(numero: string): Promise<CompraYaCargada | null> {
  const n = numero.trim();
  if (n.length < 3) return null;
  const res = await fetch(`/api/purchases?numero=${encodeURIComponent(n.slice(0, 60))}`, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { compra?: { id: string; total: number; createdAt: string; supplierName?: string } | null } | null;
  const c = data?.compra;
  return c ? { id: c.id, total: c.total, fecha: c.createdAt, proveedor: c.supplierName ?? "" } : null;
}

export interface CobroYaHecho {
  resumen: string;
  fecha: string;
}

/**
 * ¿Ese N.º de operación ya se cobró desde aquí? Lo dice el recibo `cobro` de
 * Comandos IA (sus últimos 50). Sin número o si falla la lectura: null.
 */
export async function buscarCobroConOperacion(operacion: string): Promise<CobroYaHecho | null> {
  const n = operacion.trim();
  if (!n) return null;
  const res = await fetch("/api/admin/comandos-ia/recibos", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { recibos?: Array<{ tipo: string; entityId: string | null; resumen: string; createdAt: string }> } | null;
  const hit = data?.recibos?.find((r) => r.tipo === "cobro" && r.entityId === n);
  return hit ? { resumen: hit.resumen, fecha: hit.createdAt } : null;
}

export async function guardarCompra(input: {
  supplierId: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceType: "factura" | "boleta" | "guia" | "ninguno";
  /** false = los costos vinieron sin IGV (el papel lo suma abajo): el servidor lo agrega al total. */
  igvIncluido: boolean;
  filas: FilaCompraBorrador[];
  /** El id del papel: un reintento (red que corta tras guardar) no duplica la compra. */
  idempotencyKey: string;
}): Promise<{ id: string; total: number }> {
  return enviar<{ id: string; total: number }>("/api/purchases", {
    idempotencyKey: `comandos-ia:${input.idempotencyKey}`.slice(0, 100),
    supplierId: input.supplierId ?? "",
    supplierName: input.supplierName.slice(0, 200) || undefined,
    invoiceNumber: input.invoiceNumber.trim().slice(0, 60) || undefined,
    invoiceType: input.invoiceType,
    igvIncluded: input.igvIncluido,
    notes: "Cargada desde Comandos IA › Lee un papel",
    items: input.filas.flatMap((f) => (f.producto
      ? [{
          productId: f.producto.id,
          quantity: f.cantidad,
          unitCost: f.costoUnitario,
          unit: f.producto.unidad.slice(0, 50),
          name: f.producto.nombre.slice(0, 200),
        }]
      : [])),
  });
}

export async function cobrarConYape(input: { telefono: string; monto: number; nombre: string; operacion: string | null }): Promise<{ totalCobrado: number; remaining: number }> {
  return enviar("/api/fiados/cobrar", {
    customerPhone: input.telefono,
    monto: Math.round(input.monto * 100) / 100,
    metodo: "yape",
    aCaja: true,
    nombre: input.nombre.slice(0, 80),
    notas: input.operacion ? `Yape N.º de operación ${input.operacion}` : undefined,
  });
}

/** Al drive: la foto como PDF (igual que el escáner), el PDF tal cual, el texto como .txt. */
export async function guardarEnDocumentos(papel: Papel, nombre: string): Promise<string | null> {
  const limpio = nombre.trim().slice(0, 120) || "Papel leído";
  if (papel.origen === "imagen" && papel.archivo) {
    const r = await scanToPdf([papel.archivo], limpio, null);
    return r.document.id;
  }
  const archivo = papel.origen === "pdf" && papel.archivo
    ? papel.archivo
    : new File([papel.texto], `${limpio}.txt`, { type: "text/plain" });
  const docs = await subirArchivosAlDrive([archivo]);
  if (!docs.length) throw new Error("El drive no aceptó el archivo.");
  return docs[0].id;
}

export const CLAVE_LISTA_PRECIOS = "comandos-ia:lista-precios";

/** La lista pasa a «Precios en bloque», que la lee al montar y la borra. */
export function llevarAPrecios(filas: FilaPrecio[], irA: (sub: SubComandos) => void): void {
  try {
    sessionStorage.setItem(CLAVE_LISTA_PRECIOS, JSON.stringify({ origen: "papel", filas: filas.map((f) => ({ nombre: f.nombre, costo: f.costo })) }));
  } catch (err) {
    logger.warn("[comandos-ia/papel] sessionStorage lleno o bloqueado", { err: String(err) });
  }
  irA("precios");
}

interface FacturaVision {
  proveedor?: { nombre?: string; ruc?: string };
  fecha?: string;
  comprobante?: { tipo?: string; numero?: string };
  items?: Array<{ nombre: string; cantidad: number; precioUnitario: number }>;
  total?: number;
}

function comoDataUrl(archivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No pude abrir la foto."));
    fr.readAsDataURL(archivo);
  });
}

/**
 * La foto por la IA de visión (`/api/ocr/invoice`, ≈ US$0,02) cuando el OCR
 * gratis no la leyó bien. Devuelve un texto con la forma de una factura
 * impresa, para que lo entiendan las mismas reglas (sin otra llamada a la IA).
 */
export async function leerConVision(archivo: Blob): Promise<string> {
  const f = await enviar<FacturaVision>("/api/ocr/invoice", { image: await comoDataUrl(archivo) });
  const lineas = [
    f.proveedor?.nombre ?? "",
    f.proveedor?.ruc ? `RUC: ${f.proveedor.ruc}` : "",
    (f.comprobante?.tipo ?? "factura").toUpperCase(),
    f.comprobante?.numero ?? "",
    f.fecha ? `Fecha: ${f.fecha}` : "",
    ...(f.items ?? []).map((i) => `${i.cantidad} ${i.nombre} ${i.precioUnitario.toFixed(2)} ${(i.cantidad * i.precioUnitario).toFixed(2)}`),
    f.total != null ? `TOTAL ${Math.round(f.total * 100) / 100}` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}
