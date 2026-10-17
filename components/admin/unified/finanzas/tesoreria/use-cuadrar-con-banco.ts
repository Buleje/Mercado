"use client";

import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { BankRow, GrupoResumido, ParConDiferencia, ParCuadrado, SystemPayment } from "@/lib/finance/bank-reconciliation";

/** Lo que devuelve `POST /api/finanzas/conciliacion`: los totales los suma el servidor. */
export interface CuadreDelBanco {
  periodo: { desde: string; hasta: string };
  banco: { movimientos: number; descartadas: number; formato: "cabecera" | "posicional" };
  sistema: {
    movimientos: number;
    porFuente: { tesoreria: number; ventas: number; caja: number; pedidos: number };
    recortado: boolean;
  };
  resumen: Record<GrupoCuadre, GrupoResumido>;
  grupos: {
    coinciden: ParCuadrado[];
    conDiferencia: ParConDiferencia[];
    soloBanco: BankRow[];
    soloSistema: SystemPayment[];
  };
}

export type GrupoCuadre = "coinciden" | "conDiferencia" | "soloBanco" | "soloSistema";

export interface PedidoCuadre {
  archivo: File;
  /** `""` = todas las cuentas de banco. */
  cuentaId: string;
  conVentas: boolean;
}

/** Sube el extracto y trae el cruce. No guarda nada: cerrar el modal lo olvida. */
export function useCuadrarConBanco() {
  const [resultado, setResultado] = useState<CuadreDelBanco | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  /** Sólo vale la respuesta del último envío (dos clics seguidos no se pisan). */
  const ultimo = useRef(0);

  const cuadrar = useCallback(async ({ archivo, cuentaId, conVentas }: PedidoCuadre) => {
    const n = ++ultimo.current;
    setCargando(true);
    setError(null);
    const fd = new FormData();
    fd.append("archivo", archivo, archivo.name);
    if (cuentaId) fd.append("cuentaId", cuentaId);
    fd.append("conVentas", conVentas ? "1" : "0");
    try {
      const res = await fetch("/api/finanzas/conciliacion", { method: "POST", body: fd, headers: csrfHeaders() });
      const json = (await res.json().catch(() => null)) as (CuadreDelBanco & { error?: string }) | null;
      if (n !== ultimo.current) return;
      if (!res.ok || !json || json.error) {
        setResultado(null);
        setError(json?.error ?? `No se pudo cuadrar (error ${res.status}).`);
        return;
      }
      setResultado(json);
    } catch {
      if (n === ultimo.current) setError("Sin conexión: vuelve a intentarlo.");
    } finally {
      if (n === ultimo.current) setCargando(false);
    }
  }, []);

  const limpiar = useCallback(() => {
    ultimo.current++;
    setResultado(null);
    setError(null);
    setCargando(false);
  }, []);

  return { resultado, error, cargando, cuadrar, limpiar };
}
