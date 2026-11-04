"use client";

/**
 * Estado de «Compra desde la factura XML»: leer el archivo → vista previa
 * (`POST /api/purchases/desde-xml`, no escribe) → elegir productos → crear la
 * compra por `POST /api/purchases` (el total lo suma el servidor).
 * Proveedor nuevo: se da de alta por `POST /api/suppliers` justo antes.
 * Factura en dólares: los costos van en soles con el tipo de cambio SUNAT del
 * día de emisión (`use-tipo-cambio.ts`); sin tipo de cambio no se guarda.
 */
import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { RespuestaDesdeXml, VistaPreviaFacturaXml } from "@/lib/compras/factura-xml-cruce";
import type { ProductoSugerido } from "@/lib/admin/comandos-ia/papel";
import { leerArchivoElegido } from "./leer-archivo-xml";
import { useTipoCambio } from "./use-tipo-cambio";
import {
  cuerpoDeLaCompra,
  formaDePagoSugerida,
  lineasSinProducto,
  productosIniciales,
  type Elegidos,
  type FormaDePago,
} from "./compra-desde-factura";

export const PROVEEDOR_NUEVO = "__nuevo__";

function mensajeDe(data: unknown): string | null {
  const d = (data ?? {}) as { error?: unknown; message?: unknown };
  if (typeof d.message === "string") return d.message;
  return typeof d.error === "string" ? d.error : null;
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
    throw new Error(mensajeDe(data) ?? (res.status === 403 ? "Tu rol no puede guardar esto." : `No se pudo guardar (${res.status}).`));
  }
  return data as T;
}

export function useFacturaXml() {
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaPreviaFacturaXml | null>(null);
  const [elegidos, setElegidos] = useState<Elegidos>({});
  const [proveedor, setProveedor] = useState<string>(PROVEEDOR_NUEVO);
  const [formaDePago, setFormaDePago] = useState<FormaDePago>("contado");
  const [quitadas, setQuitadas] = useState<number[]>([]);
  const tipoCambio = useTipoCambio(vista?.factura.fecha ?? null, vista?.factura.moneda ?? null);
  // Elegir otro archivo mientras el primero se lee: gana el último.
  const pedido = useRef(0);

  const reiniciar = useCallback(() => {
    pedido.current++;
    setLeyendo(false);
    setGuardando(false);
    setError(null);
    setArchivo(null);
    setVista(null);
    setElegidos({});
    setQuitadas([]);
  }, []);

  const elegirArchivo = useCallback(async (f: File) => {
    const mio = ++pedido.current;
    setError(null);
    setVista(null);
    setQuitadas([]);
    setArchivo(f.name);
    setLeyendo(true);
    try {
      const lectura = await leerArchivoElegido(f);
      if (mio !== pedido.current) return;
      if (!lectura.ok) { setError(lectura.error); return; }
      const res = await fetch("/api/purchases/desde-xml", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ xml: lectura.xml }),
      });
      const data = (await res.json().catch(() => null)) as RespuestaDesdeXml | null;
      if (mio !== pedido.current) return;
      if (!res.ok || data?.ok !== true) {
        setError(mensajeDe(data) ?? (res.status === 403
          ? "Tu rol no puede cargar compras."
          : res.status === 429 ? "Muchos intentos seguidos. Espera un minuto y vuelve a probar." : `No se pudo leer la factura (${res.status}). Intenta de nuevo.`));
        return;
      }
      const v = data.vista;
      setVista(v);
      setElegidos(productosIniciales(v.lineas));
      setProveedor(v.proveedor.existente?.id ?? PROVEEDOR_NUEVO);
      setFormaDePago(formaDePagoSugerida(v.factura.fecha, v.factura.fechaVencimiento));
    } catch (err) {
      logger.warn("[compras/factura-xml] no se pudo leer", { err: String(err) });
      if (mio === pedido.current) setError("No se pudo leer el archivo. Revisa tu conexión e intenta de nuevo.");
    } finally {
      if (mio === pedido.current) setLeyendo(false);
    }
  }, []);

  const cambiarProducto = useCallback((numero: number, p: ProductoSugerido | null) => {
    setElegidos((prev) => ({ ...prev, [numero]: p }));
  }, []);

  /** Quitar una línea antes de guardar (o volver a ponerla). */
  const alternarLinea = useCallback((numero: number) => {
    setQuitadas((prev) => (prev.includes(numero) ? prev.filter((n) => n !== numero) : [...prev, numero]));
  }, []);

  const cambio = tipoCambio.cambio;
  const crear = useCallback(async (): Promise<{ id: string; total: number } | null> => {
    if (!vista || guardando) return null;
    if (quitadas.length >= vista.factura.lineas.length) {
      setError("Quitaste todas las líneas: deja al menos un producto para crear la compra.");
      return null;
    }
    // Antes del alta del proveedor: sin tipo de cambio no se escribe nada.
    if (vista.factura.moneda !== "PEN" && !cambio) {
      setError("Falta el tipo de cambio: sin él la compra no se pasa a soles.");
      return null;
    }
    const faltan = lineasSinProducto(vista.factura.lineas, elegidos, quitadas);
    if (faltan.length > 0) {
      setError(`Elige el producto de ${faltan.length === 1 ? "la línea" : "las líneas"} ${faltan.join(", ")} antes de crear la compra.`);
      return null;
    }
    if (vista.yaCargada) { setError("Esta factura ya está cargada: no se crea otra compra."); return null; }
    setGuardando(true);
    setError(null);
    try {
      const e = vista.factura.emisor;
      const conocido = vista.proveedor.existente?.id === proveedor
        ? vista.proveedor.existente
        : vista.proveedor.parecidos.find((p) => p.id === proveedor);
      let supplierId = conocido?.id ?? "";
      let supplierName = conocido?.nombre ?? e.razonSocial;
      if (!conocido) {
        const nombre = (e.nombreComercial || e.razonSocial).slice(0, 200);
        const nuevo = await enviar<{ id?: string }>("/api/suppliers", {
          name: nombre, razonSocial: e.razonSocial.slice(0, 200), ruc: e.ruc, tipoDocumento: "RUC", documento: e.ruc,
        });
        supplierId = nuevo.id ?? "";
        supplierName = nombre;
        // Si la compra falla después, el reintento usa este proveedor y no crea otro.
        if (nuevo.id) {
          const id = nuevo.id;
          setVista((v) => (v ? { ...v, proveedor: { ...v.proveedor, existente: { id, nombre, ruc: e.ruc } } } : v));
          setProveedor(id);
        }
      }
      return await enviar<{ id: string; total: number }>(
        "/api/purchases",
        cuerpoDeLaCompra({ factura: vista.factura, supplierId, supplierName, formaDePago, elegidos, cambio, quitadas }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la compra. Intenta de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  }, [vista, guardando, elegidos, proveedor, formaDePago, cambio, quitadas]);

  return {
    leyendo, guardando, error, archivo, vista, elegidos, proveedor, formaDePago, quitadas, tipoCambio,
    setProveedor, setFormaDePago, elegirArchivo, cambiarProducto, alternarLinea, crear, reiniciar,
  };
}
