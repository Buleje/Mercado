"use client";

/**
 * Los meses del año con la MISMA cuenta que «Impuestos del mes»
 * (`calcularImpuestosDelMes`): ingresos de Mi Plata + IGV registrado de cada
 * mes. Antes «Resumen anual» multiplicaba los pedidos web por 18 % y daba otra
 * cifra que la del mes para el mismo mes.
 */
import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { RegimenTributario } from "@/lib/tax/obligaciones-peru";
import type { IgvDelMes } from "@/components/admin/unified/finanzas/resumen/igv";
import { calcularImpuestosDelMes, type ImpuestosDelMes } from "./impuestos-del-mes";
import type { IngresoMes } from "./use-impuestos";

export interface MesDelAnio { mes: string; ingresos: number; calculo: ImpuestosDelMes }
type Estado = { fase: "cargando" } | { fase: "error" } | { fase: "lista"; meses: MesDelAnio[] };

export function useAnioTributario(anio: number, hoy: string, regimen: RegimenTributario): Estado {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [crudo, setCrudo] = useState<{ ingresos: IngresoMes[]; igv: Record<string, IgvDelMes | null> } | null>(null);

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "cargando" });
    setCrudo(null);
    // El año en curso llega hasta este mes; uno pasado, hasta diciembre.
    const hasta = String(anio) === hoy.slice(0, 4) ? hoy : `${anio}-12`;
    const n = Number(hasta.slice(5, 7));
    const meses = Array.from({ length: n }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
    Promise.all([
      fetch(`/api/finanzas/monthly-summary?months=${n}&hasta=${hasta}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      Promise.all(meses.map((m) => fetch(`/api/finanzas/igv-del-mes?mes=${m}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))),
    ])
      .then(([ingresos, igv]: [IngresoMes[], Array<IgvDelMes | null>]) => {
        if (vivo) setCrudo({ ingresos: Array.isArray(ingresos) ? ingresos : [], igv: Object.fromEntries(meses.map((m, i) => [m, igv[i] ?? null])) });
      })
      .catch((err) => {
        logger.warn("[impuestos] año load failed", { error: String(err) });
        if (vivo) setEstado({ fase: "error" });
      });
    return () => { vivo = false; };
  }, [anio, hoy]);

  useEffect(() => {
    if (!crudo) return;
    let acum = 0;
    const meses = [...crudo.ingresos].sort((a, b) => a.month.localeCompare(b.month)).map((f) => {
      acum += f.ingresos;
      return { mes: f.month, ingresos: f.ingresos, calculo: calcularImpuestosDelMes({ regimen, igv: crudo.igv[f.month] ?? null, ingresosMes: f.ingresos, ingresosAcumAnio: acum }) };
    });
    setEstado({ fase: "lista", meses });
  }, [crudo, regimen]);

  return estado;
}
