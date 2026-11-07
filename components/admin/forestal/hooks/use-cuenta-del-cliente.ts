"use client";

/**
 * La cuenta del cliente de una carga, leída del panel para el «Estado de
 * cuenta» (Brandon 03-11: «saldo y adelantos solos»). Usa la MISMA cuenta por
 * persona que Adelantos (Adelantos + cuenta forestal unidas): primero la
 * lista, después el detalle de la elegida, recién cuando hay una.
 *
 * Se elige sola por la ficha del Directorio de la cubicación o por el nombre
 * del cliente; si no hay ninguna que calce, queda en «sin cuenta» y el papel
 * sale con lo escrito a mano.
 */
import { useEffect, useMemo, useState } from "react";
import { useCuentasPersonas } from "@/hooks/use-cuentas-personas";
import { logger } from "@/lib/logger";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoDelCliente } from "@/lib/forestal/estado-cuenta-carga";

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** La persona de la carga: por su ficha del Directorio, si no por el nombre. */
export function personaDeLaCarga(personas: readonly CuentaPersona[], parteId: string | undefined, cliente: string): CuentaPersona | null {
  if (parteId) {
    const porFicha = personas.find((p) => p.parteId === parteId);
    if (porFicha) return porFicha;
  }
  const n = normal(cliente);
  if (n.length < 3) return null;
  return personas.find((p) => normal(p.nombre) === n) ?? null;
}

export interface CuentaDelCliente {
  personas: CuentaPersona[];
  elegida: CuentaPersona | null;
  elegir: (clave: string | null) => void;
  movimientos: MovimientoDelCliente[];
  cargando: boolean;
  error: string | null;
}

export function useCuentaDelCliente(parteId: string | undefined, cliente: string): CuentaDelCliente {
  const { personas, loading, error: errorLista } = useCuentasPersonas();
  /* `undefined` = todavía no la tocó: manda la elegida sola. */
  const [clave, setClave] = useState<string | null | undefined>(undefined);
  const elegida = useMemo(() => {
    if (clave === null) return null;
    if (clave) return personas.find((p) => p.clave === clave) ?? null;
    return personaDeLaCarga(personas, parteId, cliente);
  }, [clave, personas, parteId, cliente]);

  const [movimientos, setMovimientos] = useState<MovimientoDelCliente[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  useEffect(() => {
    setMovimientos([]);
    setErrorDetalle(null);
    if (!elegida) return;
    const params = new URLSearchParams();
    if (elegida.beneficiarioId) params.set("beneficiario", elegida.beneficiarioId);
    if (elegida.parteId) params.set("parte", elegida.parteId);
    let vivo = true;
    setCargandoDetalle(true);
    fetch(`/api/adelantos/cuentas/estado?${params.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { lineas?: MovimientoDelCliente[]; error?: string } | null;
        if (!vivo) return;
        if (!res.ok) { setErrorDetalle(body?.error ?? "No se pudo leer su cuenta"); return; }
        setMovimientos(Array.isArray(body?.lineas) ? body.lineas : []);
      })
      .catch((err) => {
        logger.warn("[estado-cuenta-carga] no se leyó la cuenta del cliente", { error: String(err) });
        if (vivo) setErrorDetalle("No se pudo leer su cuenta");
      })
      .finally(() => { if (vivo) setCargandoDetalle(false); });
    return () => { vivo = false; };
  }, [elegida]);

  return {
    personas,
    elegida,
    elegir: setClave,
    movimientos,
    cargando: loading || cargandoDetalle,
    error: errorLista ?? errorDetalle,
  };
}
