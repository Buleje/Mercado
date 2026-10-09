import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";

export type Billetera = "yape" | "plin";

export interface BilleteraNegocio {
  /** Prendido en Ajustes › Cobros. */
  activo: boolean;
  /** Imagen del QR que el negocio subió (la de su app Yape/Plin: esa sí se escanea). */
  qr: string;
  titular: string;
  numero: string;
}

export type Billeteras = Record<Billetera, BilleteraNegocio>;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Lee Yape y Plin de la respuesta de GET /api/settings (columnas yapeX y plinX de Settings). */
export function leerBilleteras(d: Record<string, unknown> | null): Billeteras {
  return {
    yape: { activo: d?.yapeEnabled === true, qr: texto(d?.yapeImage), titular: texto(d?.yapeName), numero: texto(d?.yapePhone) },
    plin: { activo: d?.plinEnabled === true, qr: texto(d?.plinImage), titular: texto(d?.plinName), numero: texto(d?.plinPhone) },
  };
}

/** Hay QR para mostrarle al cliente: el método está prendido y tiene imagen subida. */
export function tieneQR(b: BilleteraNegocio | null | undefined): b is BilleteraNegocio {
  return !!b && b.activo && b.qr.length > 0;
}

const URL_BILLETERAS = "/api/settings?_t=pos-billetera";
/** GET /api/settings del POS (una sola llamada): también la lee `useTopeDescuentoCajero`. */
export const pedirBilleteras = () => cachedJson<Record<string, unknown>>(URL_BILLETERAS, 60_000, { cache: "no-store" });

/** El POS lo pide al montar: así, al abrir el cobro y tocar Yape, el QR ya está (si no, no se abría). */
export function precargarBilleteras(): void {
  void pedirBilleteras();
}

/**
 * Yape y Plin del negocio tal como se guardan en Ajustes › Cobros. `null` mientras carga.
 * Clave propia en cachedJson (el `?_t=` el servidor lo ignora): el contexto de la tienda usa otra.
 */
export function useBilleteraNegocio(): Billeteras | null {
  const [billeteras, setBilleteras] = useState<Billeteras | null>(null);
  useEffect(() => {
    let vivo = true;
    void pedirBilleteras().then((d) => {
      if (vivo) setBilleteras(leerBilleteras(d));
    });
    return () => {
      vivo = false;
    };
  }, []);
  return billeteras;
}
