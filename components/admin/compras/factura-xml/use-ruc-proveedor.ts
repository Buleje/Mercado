"use client";

/**
 * RUC del proveedor de la factura XML contra SUNAT (estado y condición).
 *
 * Por qué: el art. 19 del TUO de la Ley del IGV dice que no dan crédito fiscal
 * los comprobantes de emisores que, a la fecha de emisión, tenían el RUC de baja
 * o la condición de NO HABIDO. La consulta trae el estado de HOY, así que el
 * aviso dice «si ya estaba así el día de la factura» y manda al contador.
 *
 * Fuente del dato: `GET /api/sunat/lookup-ruc?ruc=` (padrón SUNAT, caché 1 h).
 */
import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

const RUC_VALIDO = /^[12]\d{10}$/;

export type EstadoRucProveedor =
  | { fase: "cargando" }
  | { fase: "listo"; estado: string | null; condicion: string | null }
  | { fase: "no-existe" }
  | { fase: "sin-respuesta" };

export type NivelRuc = "bien" | "cuidado" | "grave" | "sin-dato";

export interface LecturaRuc {
  nivel: NivelRuc;
  /** Una línea: lo que se ve sin abrir nada. */
  titulo: string;
  /** El porqué y qué hacer (va en el ⓘ). */
  detalle?: string;
}

const normal = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/** Pura: estado/condición de SUNAT → lo que el dueño necesita saber antes de pagar. */
export function leerRucProveedor(e: EstadoRucProveedor, fechaFactura: string): LecturaRuc {
  if (e.fase === "cargando") return { nivel: "sin-dato", titulo: "Consultando el RUC en SUNAT…" };
  if (e.fase === "sin-respuesta") {
    return { nivel: "sin-dato", titulo: "SUNAT no respondió: revisa el RUC más tarde", detalle: "No se pudo consultar el padrón ahora. La compra se puede guardar igual." };
  }
  if (e.fase === "no-existe") {
    return {
      nivel: "grave",
      titulo: "SUNAT no reconoce este RUC",
      detalle: "Revisa la factura: un RUC que no está en el padrón de SUNAT no sirve para tu crédito fiscal. Pídele al proveedor que la corrija.",
    };
  }
  const estado = normal(e.estado);
  const condicion = normal(e.condicion);
  if (!estado && !condicion) return { nivel: "sin-dato", titulo: "SUNAT no dio el estado de este RUC" };

  const deBaja = estado.includes("BAJA");
  const noHabido = condicion === "NO HABIDO";
  if (deBaja || noHabido) {
    const como = deBaja ? `con el RUC en ${estado.toLowerCase()}` : "como NO HABIDO";
    return {
      nivel: "grave",
      titulo: `SUNAT tiene a este proveedor ${como}`,
      detalle: `Si ya estaba así el ${fechaFactura}, el IGV de esta factura no te da crédito fiscal (Ley del IGV, art. 19). Pregúntale a tu contador antes de pagarle.`,
    };
  }
  if (estado === "ACTIVO" && condicion === "HABIDO") return { nivel: "bien", titulo: "SUNAT: RUC activo y habido" };
  const partes = [estado, condicion].filter(Boolean).map((s) => s.toLowerCase());
  return {
    nivel: "cuidado",
    titulo: `SUNAT: ${partes.join(" · ")}`,
    detalle: "No es «activo y habido». Confirma con tu contador si esta factura te sirve para el crédito fiscal.",
  };
}

interface Respuesta {
  ruc: string;
  estado: EstadoRucProveedor;
}

/** Consulta el RUC una vez por número (el endpoint ya guarda 1 h en caché). */
export function useRucProveedor(ruc: string): EstadoRucProveedor {
  const limpio = ruc.replace(/\D/g, "");
  const valido = RUC_VALIDO.test(limpio);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);

  useEffect(() => {
    if (!valido) return;
    const ctrl = new AbortController();
    fetch(`/api/sunat/lookup-ruc?ruc=${encodeURIComponent(limpio)}`, { credentials: "include", signal: ctrl.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { estado?: string | null; condicion?: string | null } | null;
        if (ctrl.signal.aborted) return;
        if (res.status === 404) return setRespuesta({ ruc: limpio, estado: { fase: "no-existe" } });
        if (!res.ok || !json) return setRespuesta({ ruc: limpio, estado: { fase: "sin-respuesta" } });
        setRespuesta({ ruc: limpio, estado: { fase: "listo", estado: json.estado ?? null, condicion: json.condicion ?? null } });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[compras/factura-xml] consulta de RUC no llegó", { err: String(err) });
        setRespuesta({ ruc: limpio, estado: { fase: "sin-respuesta" } });
      });
    return () => ctrl.abort();
  }, [limpio, valido]);

  if (!valido) return { fase: "no-existe" };
  return respuesta?.ruc === limpio ? respuesta.estado : { fase: "cargando" };
}
