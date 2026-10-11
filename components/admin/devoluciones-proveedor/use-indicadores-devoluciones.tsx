"use client";

/**
 * Indicadores plegables de Devoluciones: cuántas hay, cuántas faltan por enviar,
 * cuántas esperan respuesta del proveedor y cuánto se le reclama. El gráfico por
 * mes y los tops viven adentro: repetían estas mismas cuentas en un panel aparte.
 */
import type { ReactNode } from "react";
import { Clock, RotateCcw, Send, Wallet } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { DIAS_LIMITE_RESPUESTA, conteoPorEstado, diasEsperando, montoPorReclamar, soles, type Devolucion } from "./tipos";

interface Tarjeta { rotulo: string; valor: string; detalle?: string; icono: typeof Clock; tono?: "aviso" | "ok"; ayuda?: ReactNode }

export function useIndicadoresDevoluciones(devoluciones: Devolucion[], cargando: boolean) {
  const c = conteoPorEstado(devoluciones);
  const vencidas = devoluciones.filter((d) => diasEsperando(d) > DIAS_LIMITE_RESPUESTA).length;
  const mesActual = new Date().toISOString().slice(0, 7);
  const delMes = devoluciones.filter((d) => d.createdAt.startsWith(mesActual));
  const itemsMes = delMes.reduce((s, d) => s + d.items.reduce((a, i) => a + i.cantidad, 0), 0);
  const { total: porReclamar, sinPrecio } = montoPorReclamar(devoluciones);

  const tarjetas: Tarjeta[] = [
    { rotulo: "Devoluciones", valor: String(devoluciones.length), detalle: `${c.RESUELTA} resuelta${c.RESUELTA === 1 ? "" : "s"} · ${delMes.length} este mes (${itemsMes} unidades)`, icono: RotateCcw },
    { rotulo: "Por enviar", valor: String(c.PENDIENTE), detalle: "la mercadería sale del stock al enviarla", icono: Send, tono: c.PENDIENTE > 0 ? "aviso" : undefined },
    {
      rotulo: "Esperando respuesta", valor: String(c.ENVIADA), icono: Clock,
      detalle: vencidas > 0 ? `${vencidas} vencida${vencidas === 1 ? "" : "s"} (más de ${DIAS_LIMITE_RESPUESTA} días)` : "nota de crédito o reposición",
      tono: vencidas > 0 ? "aviso" : undefined,
    },
    {
      rotulo: "Por reclamar", valor: soles(porReclamar), icono: Wallet,
      detalle: sinPrecio > 0 ? `${sinPrecio} ítem${sinPrecio === 1 ? "" : "s"} sin costo` : "sin resolver, al costo registrado",
      ayuda: "Suma lo devuelto que todavía no está resuelto, al costo que tenía el producto al registrar. Es un cálculo de esta pantalla: la nota de crédito se aplica en Por pagar.",
    },
  ];

  return useKpisPlegables({
    claveMemoria: "devoluciones-proveedor",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando && devoluciones.length === 0,
    resumen: `${devoluciones.length} · ${c.PENDIENTE + c.ENVIADA} abiertas · ${soles(porReclamar)}`,
    tarjetas: tarjetas.map(({ rotulo, valor, detalle, icono: Icono, tono, ayuda }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className={cn("text-lg font-extrabold tabular-nums", tono === "aviso" ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]")}>{valor}</p>
        {detalle && <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>}
      </div>
    )),
  });
}
