"use client";

/**
 * Los indicadores de Cotizaciones con el patrón del panel (`useKpisPlegables`):
 * el botón va en la fila del título y, plegado, lleva el titular adentro.
 *
 * Reemplaza a la pestaña «Dashboard» (4 tarjetas + embudo + gráficos) y a la
 * copia de esas mismas tarjetas y embudo que repetía la pestaña «Lista».
 *  · El embudo (cuántas hay en cada estado) vive ahora en los chips de estado
 *    de la lista, con su cuenta: el mismo dato, donde además filtra.
 *  · «Convertidas» es la cuenta del chip «Convertida» en Cerradas; acá queda
 *    la tasa, y en su lugar entra «En juego» (lo que todavía puede venderse).
 *  · Los gráficos (por mes y mejores clientes) dicen algo que las cifras no:
 *    van dentro del panel, debajo de las tarjetas, y sólo cuando hay datos.
 */
import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency, formatMonth, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mesLima, SECCION, type Cotizacion } from "./tipos";

const CotizacionesChart = dynamic(() => import("@/components/admin/CotizacionesChart"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />,
});

const CLAVE = "cotizaciones";
const pct = (n: number) => `${formatNumber(n, { max: 1 })} %`;

interface Tarjeta { rotulo: string; valor: string; ayuda?: ReactNode; detalle?: string; tono?: "aviso" }

export function useIndicadoresCotizaciones(lista: readonly Cotizacion[], cargada: boolean, abrirAlEntrar: boolean) {
  /* `?sub=dashboard` (el «Dashboard» de antes, enlaces guardados y el buscador)
     llega con el panel abierto: se escribe lo recordado ANTES de que el hook lo lea. */
  useState(() => {
    if (!abrirAlEntrar) return null;
    try { localStorage.setItem(`ctp-kpis-v2:${CLAVE}`, "1"); } catch { /* modo privado */ }
    return null;
  });

  const c = useMemo(() => {
    const ahora = new Date();
    const mes = mesLima(ahora);
    const mesAnterior = mesLima(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 15));
    const delMes = lista.filter((x) => mesLima(x.createdAt) === mes);
    const delAnterior = lista.filter((x) => mesLima(x.createdAt) === mesAnterior);
    const tasaDe = (xs: readonly Cotizacion[]) => (xs.length ? (xs.filter((x) => x.status === "CONVERTIDA").length / xs.length) * 100 : 0);
    const enJuego = lista.filter((x) => SECCION["en-curso"].estados.includes(x.status));

    // Cotizaciones por mes (6 meses) y los 5 clientes con más monto cotizado.
    const porMes = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - (5 - k), 15);
      const clave = mesLima(d);
      return { mes: formatMonth(d), count: lista.filter((x) => mesLima(x.createdAt) === clave).length };
    });
    const porCliente = new Map<string, number>();
    for (const x of lista) {
      const nombre = x.clienteNombre.length > 15 ? `${x.clienteNombre.slice(0, 13)}…` : x.clienteNombre;
      porCliente.set(nombre, (porCliente.get(nombre) ?? 0) + x.total);
    }
    const topClientes = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, monto]) => ({ name, monto }));

    return {
      emitidasMes: delMes.length,
      emitidasAnterior: delAnterior.length,
      tasa: tasaDe(lista),
      tasaMes: tasaDe(delMes),
      tasaAnterior: delAnterior.length ? tasaDe(delAnterior) : null,
      monto: lista.reduce((s, x) => s + x.total, 0),
      enJuego: enJuego.reduce((s, x) => s + x.total, 0),
      porMes,
      topClientes,
    };
  }, [lista]);

  const tarjetas: Tarjeta[] = [
    { rotulo: "Emitidas este mes", valor: String(c.emitidasMes), ayuda: `El mes pasado emitiste ${c.emitidasAnterior}.` },
    {
      rotulo: "Tasa de conversión",
      valor: pct(c.tasa),
      tono: c.tasa > 0 && c.tasa < 15 ? "aviso" : undefined,
      ayuda: "De todas tus cotizaciones, qué parte terminó en pedido. Debajo de 15 % se marca para que revises precios o seguimiento.",
      detalle: c.tasaAnterior != null ? `Este mes ${pct(c.tasaMes)} · el anterior ${pct(c.tasaAnterior)}` : undefined,
    },
    { rotulo: "Monto cotizado", valor: formatCurrency(c.monto), ayuda: "La suma de todas las cotizaciones, con IGV, sin importar su estado." },
    { rotulo: "En juego", valor: formatCurrency(c.enJuego), ayuda: "Lo cotizado en borradores, enviadas y aceptadas: lo que todavía puede volverse venta." },
  ];

  const kpis = useKpisPlegables({
    claveMemoria: CLAVE,
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: !cargada,
    /* Corto a propósito: en la fila del título el botón deja ~15 caracteres antes del «…». */
    resumen: `${formatNumber(c.tasa, 0)} % a pedido`,
    tarjetas: tarjetas.map((t) => (
      <div key={t.rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{t.rotulo}</span>
          {t.ayuda && <InfoTip what={t.ayuda} />}
        </div>
        <p className={cn("text-lg font-extrabold tabular-nums", t.tono === "aviso" ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>
          {t.valor}
        </p>
        {t.detalle && <p className="mt-0.5 text-sm tabular-nums text-[var(--text-secondary)]">{t.detalle}</p>}
      </div>
    )),
  });

  const panel = kpis.panel ? (
    <div className="space-y-3">
      {kpis.panel}
      {cargada && <CotizacionesChart porMes={c.porMes} topClientes={c.topClientes} />}
    </div>
  ) : null;

  return { boton: kpis.boton, panel };
}
