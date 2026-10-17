"use client";

/**
 * La ventana «Emitir comprobante» en tres pasos: elegir el pedido → revisar
 * (cliente, líneas, total, qué se crea) → resultado según lo que respondió el
 * servidor. Mismo endpoint y mismo cuerpo de siempre (`generate-invoice`): el
 * flujo de emisión del servidor no cambia (auditoría de comprobantes p1, 17-10).
 */
import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  comprobanteVivo, resultadoDeEmision, resultadoTrasRevisar,
  type DatosCliente, type PedidoElegible, type RespuestaEmision, type ResultadoEmision,
} from "./emision-reglas";
import type { EDocument } from "./tipos";

export type PasoEmision = "origen" | "revisar" | "resultado";

/** Boleta sin nombre del cliente: SUNAT admite «Clientes varios» por debajo del tope. */
function datosDe(p: PedidoElegible): DatosCliente {
  return { tipo: "boleta", nombre: p.cliente || "Clientes varios", documento: "" };
}

export function useEmision(recargar: () => Promise<EDocument[] | null>) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<PasoEmision>("origen");
  const [pedido, setPedido] = useState<PedidoElegible | null>(null);
  const [datos, setDatos] = useState<DatosCliente>({ tipo: "boleta", nombre: "", documento: "" });
  const [enviando, setEnviando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  /** El pedido con que se abrió desde otra pantalla (`?emitir=<id>`). */
  const [preelegido, setPreelegido] = useState<string | null>(null);
  // Un doble clic no manda dos pedidos: el estado tarda un render en verse.
  const enVuelo = useRef(false);

  const abrir = useCallback((orderId: string | null = null) => {
    setPaso("origen");
    setPedido(null);
    setResultado(null);
    setPreelegido(orderId);
    setAbierto(true);
  }, []);

  const cerrar = useCallback(() => {
    if (enVuelo.current) return;
    setAbierto(false);
  }, []);

  const elegir = useCallback((p: PedidoElegible) => {
    setPedido(p);
    setDatos(datosDe(p));
    setResultado(null);
    setPreelegido(null);
    setPaso("revisar");
  }, []);

  const volverAlOrigen = useCallback(() => {
    setPaso("origen");
    setResultado(null);
  }, []);

  const corregir = useCallback(() => {
    setResultado(null);
    setPaso("revisar");
  }, []);

  const confirmar = useCallback(async () => {
    if (!pedido || enVuelo.current) return;
    enVuelo.current = true;
    setEnviando(true);
    let httpStatus: number | null = null;
    let data: RespuestaEmision = {};
    try {
      const res = await fetch("/api/admin/sunat/generate-invoice", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderId: pedido.id,
          tipo: datos.tipo,
          clienteNombre: datos.nombre.trim(),
          clienteDocumento: datos.documento.trim() || undefined,
          clienteTipoDocumento: datos.tipo === "factura" ? "RUC" : "DNI",
        }),
      });
      httpStatus = res.status;
      data = (await res.json().catch(() => ({}))) as RespuestaEmision;
    } catch (err) {
      // Sin respuesta: puede haberse emitido igual. Se dice y se revisa antes de reintentar (B3).
      logger.warn("[comprobantes] emisión sin respuesta", { error: String(err) });
    } finally {
      enVuelo.current = false;
      setEnviando(false);
    }
    setResultado(resultadoDeEmision(httpStatus, data));
    setPaso("resultado");
    await recargar();
  }, [pedido, datos, recargar]);

  /** «¿Quedó o no?»: vuelve a pedir la lista y mira si el pedido ya tiene comprobante vivo (F42). */
  const revisar = useCallback(async () => {
    if (!pedido) return;
    setRevisando(true);
    try {
      const lista = await recargar();
      if (lista === null) return;
      setResultado(resultadoTrasRevisar(comprobanteVivo(lista, pedido.id)));
    } finally {
      setRevisando(false);
    }
  }, [pedido, recargar]);

  return {
    abierto, paso, pedido, datos, setDatos, enviando, revisando, resultado, preelegido,
    abrir, cerrar, elegir, volverAlOrigen, corregir, confirmar, revisar,
  };
}

export type Emision = ReturnType<typeof useEmision>;
