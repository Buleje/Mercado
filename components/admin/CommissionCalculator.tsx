"use client";

import { useId, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, MoreHorizontal, RefreshCw, Settings } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn, exportToCSV } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import { useComisiones } from "@/components/admin/comisiones/use-comisiones";
import ReglasComision from "@/components/admin/comisiones/ReglasComision";
import TablaComisiones from "@/components/admin/comisiones/TablaComisiones";

const fmt = (n: number) => `S/ ${formatNumber(n, { min: 2 })}`;

/**
 * «Comisiones» de Ventas & Caja. Todo el cálculo es del backend
 * (`/api/commissions/calculo`); acá se elige el período, se ajustan las
 * reglas y se paga — el pago queda como gasto «Comisiones».
 */
export default function CommissionCalculator() {
  const c = useComisiones();
  const { confirm } = useConfirm();
  const [verReglas, setVerReglas] = useState(false);
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage<boolean>("ventas-caja:comisiones:kpis-abiertos", false);
  const [medio, setMedio] = useState("efectivo");
  const [pagando, setPagando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const kpisId = useId();
  const t = c.datos?.totales;

  async function pagar(cashierId: string, nombre: string, monto: number) {
    // El período de la cifra en pantalla, no el que se está cargando.
    const visto = c.datos ? { desde: c.datos.desde, hasta: c.datos.hasta } : null;
    if (!visto || c.loading) return;
    const ok = await confirm({
      title: `¿Pagar ${fmt(monto)} a ${nombre}?`,
      description: `Se registra como gasto «Comisiones» del ${visto.desde} al ${visto.hasta}, pagado en ${medio}. Si el monto cambió, el sistema no paga y te muestra el nuevo.`,
      confirmLabel: "Sí, pagar",
    });
    if (!ok) return;
    setPagando(cashierId);
    setAviso(null);
    const err = await c.pagar(cashierId, medio, visto, monto);
    setPagando(null);
    setAviso(err ? { ok: false, msg: err } : { ok: true, msg: `Comisión de ${nombre} pagada: quedó en Gastos › Comisiones.` });
  }

  const exportar = () =>
    exportToCSV(
      (c.datos?.filas ?? []).map((f) => ({
        Vendedor: f.cashierName, Ventas: f.ventas, Vendido: f.vendido.toFixed(2), "% comisión": f.tasa, Regla: f.fuente,
        Comisión: f.comision.toFixed(2), Pagado: f.pagado.toFixed(2), Pendiente: f.pendiente.toFixed(2),
      })),
      `comisiones-${c.rango.desde}-a-${c.rango.hasta}.csv`,
    );

  const indicadores = t
    ? [
        { label: "Vendedores", valor: String(c.datos?.filas.length ?? 0) },
        { label: "Vendido", valor: fmt(t.vendido) },
        { label: "Comisiones", valor: fmt(t.comision) },
        { label: "Pagado", valor: fmt(t.pagado) },
        { label: "Por pagar", valor: fmt(t.pendiente), tono: t.pendiente > 0 },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SectionTitle>Comisiones del equipo</SectionTitle>
        <InfoTip
          title="Comisiones"
          what="Lo que gana cada vendedor por lo que vendió en el período, neto de devoluciones. Lo calcula el sistema con las reglas guardadas, igual en todas las computadoras."
          affects="«Pagar» registra el pago como gasto «Comisiones» por lo pendiente del período: no se puede pagar dos veces lo mismo, ni un período que se pisa con otro ya pagado."
          example="María vendió S/ 6,000 con regla de 3 %: gana S/ 180. Si ya le pagaste S/ 60 de la primera semana, quedan S/ 120 por pagar."
        />
        <div className="ml-auto flex items-center gap-2">
          <BotonIndicadores abierto={kpisAbiertos} onAlternar={() => setKpisAbiertos((v) => !v)} controla={kpisId} />
          <button
            type="button"
            onClick={() => setVerReglas((v) => !v)}
            aria-expanded={verReglas}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors",
              verReglas ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Settings className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Reglas</span>
          </button>
          <ActionMenu
            label="Más acciones"
            soloIcono
            icon={MoreHorizontal}
            actions={[
              { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void c.cargar(), busy: c.loading },
              { id: "exportar", label: "Exportar CSV", hint: "El período elegido", icon: Download, onSelect: exportar, disabled: !c.datos?.filas.length },
            ]}
          />
        </div>
      </div>

      {t && (
        kpisAbiertos ? (
          <div id={kpisId} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {indicadores.map((k) => (
              <div key={k.label} className={cn("rounded-xl border p-4", k.tono ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10" : "border-[var(--rule-base)] bg-[var(--surface-raised)]")}>
                <p className="libro-kicker">{k.label}</p>
                <p className={cn("mt-0.5 text-xl font-extrabold tabular-nums", k.tono ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{k.valor}</p>
              </div>
            ))}
          </div>
        ) : (
          <p id={kpisId} className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
            {indicadores.map((k) => (
              <span key={k.label}>{k.label} <strong className={cn("font-bold tabular-nums", k.tono ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{k.valor}</strong></span>
            ))}
          </p>
        )
      )}

      {verReglas && (
        <ReglasComision
          reglas={c.reglas}
          equipo={c.equipo}
          nombreDe={c.nombreDe}
          onAgregar={c.agregarRegla}
          onBorrar={c.borrarRegla}
          localesPendientes={c.localesPendientes}
          onPasarLocales={c.pasarLocales}
        />
      )}

      {(c.error || aviso) && (
        <div role={c.error || !aviso?.ok ? "alert" : "status"} className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm",
          c.error || !aviso?.ok ? "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
        )}>
          {(c.error || !aviso?.ok) && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
          {c.error ?? aviso?.msg}
          {c.error && <button type="button" onClick={() => void c.cargar()} className="ml-auto min-h-10 px-2 font-bold underline">Reintentar</button>}
        </div>
      )}

      <TablaComisiones
        datos={c.datos}
        periodo={c.periodo}
        onPeriodo={c.setPeriodo}
        propio={c.propio}
        onPropio={c.setPropio}
        medio={medio}
        onMedio={setMedio}
        pagando={pagando}
        onPagar={pagar}
        onVerRango={c.verRango}
        loading={c.loading}
        onVerReglas={() => setVerReglas(true)}
      />
    </div>
  );
}
