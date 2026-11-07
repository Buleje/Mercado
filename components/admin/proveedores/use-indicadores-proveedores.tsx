"use client";

/**
 * Los indicadores de Proveedores con el patrón del panel (`useKpisPlegables`):
 * cuántos tienes, a quién le debes, a quién le compras más y cuánto tardan en
 * entregar. Reemplazan las 4 tarjetas fijas y el banner «Alertas de pagos»,
 * que repetía lo que ya dice Compras › Por pagar.
 */
import { useMemo, type ReactNode } from "react";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DbSupplier } from "@/lib/jsondb";
import { conDeuda, entregaPromedio, tieneRuc, topComprado, type CompraDeProveedor, type CuentaDeProveedor } from "./datos-proveedores";

interface Tarjeta { rotulo: string; valor: string; detalle: string; ayuda: ReactNode; aviso?: boolean }

export function useIndicadoresProveedores(
  proveedores: readonly DbSupplier[],
  cuentas: readonly CuentaDeProveedor[],
  compras: readonly CompraDeProveedor[],
  cargada: boolean,
) {
  const c = useMemo(() => {
    const deben = conDeuda(cuentas);
    const debe = cuentas.filter((x) => x.status !== "pagado" && x.amount - x.paidAmount > 0).reduce((s, x) => s + (x.amount - x.paidAmount), 0);
    const top = topComprado(compras);
    return {
      total: proveedores.length,
      conRuc: proveedores.filter(tieneRuc).length,
      conDeuda: proveedores.filter((s) => deben.has(s.id)).length,
      debe,
      top: top ? { ...top, nombre: proveedores.find((s) => s.id === top.supplierId)?.name ?? "Proveedor" } : null,
      entrega: entregaPromedio(proveedores),
    };
  }, [proveedores, cuentas, compras]);

  const tarjetas: Tarjeta[] = [
    { rotulo: "Proveedores", valor: String(c.total), detalle: `${c.conRuc} con RUC · ${c.total - c.conRuc} sin documentar`, ayuda: "Los proveedores que tienes registrados. Uno sin RUC no podrá salir en un comprobante de compra." },
    { rotulo: "Con deuda", valor: String(c.conDeuda), aviso: c.conDeuda > 0, detalle: c.conDeuda > 0 ? `Les debes ${formatCurrency(c.debe)}` : "No le debes a ninguno", ayuda: "Proveedores con una cuenta por pagar abierta. El detalle, los vencimientos y «Pagar» están en Por pagar." },
    { rotulo: "Le compras más a", valor: c.top?.nombre ?? "—", detalle: c.top ? `${formatCurrency(c.top.monto)} en ${c.top.ordenes} ${c.top.ordenes === 1 ? "orden" : "órdenes"}` : "Aún sin órdenes", ayuda: "El proveedor con más monto en tus órdenes de compra (las canceladas no cuentan)." },
    { rotulo: "Entrega en", valor: c.entrega ? `${formatNumber(c.entrega.dias, { max: 1 })} días` : "—", detalle: c.entrega ? `Promedio de ${c.entrega.declaran} que lo declaran` : "Ninguno declara sus días", ayuda: "Los días que dice tu ficha que tarda cada proveedor; de ahí sale el punto de reorden de Sugerencias." },
  ];

  return useKpisPlegables({
    claveMemoria: "compras:proveedores",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: !cargada,
    resumen: `${c.total} · ${c.conDeuda} con deuda`,
    tarjetas: tarjetas.map((t) => (
      <div key={t.rotulo} className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{t.rotulo}</span>
          <InfoTip what={t.ayuda} />
        </div>
        <p className={cn("truncate text-lg font-extrabold tabular-nums", t.aviso ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{t.valor}</p>
        <p className="mt-0.5 truncate text-sm tabular-nums text-[var(--text-secondary)]">{t.detalle}</p>
      </div>
    )),
  });
}
