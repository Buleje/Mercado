"use client";

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { etiquetaMedio } from "@/components/admin/pos/use-resumen-hoy";
import { cn, exportToCSV } from "@/lib/utils";
import { BASE_COMISION, TASA_POR_DEFECTO, type FilaComision, type FuenteTasa } from "@/lib/comisiones/calcular";
import { PERIODOS, useComisiones, type Periodo } from "@/components/admin/comisiones/use-comisiones";
import { fmt, tramoDias } from "@/components/admin/comisiones/formato";
import { useIndicadoresComisiones } from "@/components/admin/comisiones/use-indicadores-comisiones";
import ReglasComision from "@/components/admin/comisiones/ReglasComision";
import TablaComisiones from "@/components/admin/comisiones/TablaComisiones";
import ReglaVigente from "@/components/admin/comisiones/ReglaVigente";
import VentasDelVendedor from "@/components/admin/comisiones/VentasDelVendedor";
import { ID_PANEL_COMISIONES, SeccionesComisiones, idPestanaComisiones, type SeccionComisiones } from "@/components/admin/comisiones/SeccionesComisiones";

const FUENTE_CSV: Record<FuenteTasa, string> = { propia: "propia", general: "todo el equipo", por_defecto: `${TASA_POR_DEFECTO} % por defecto (sin regla guardada)` };

const CAMPO = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)]";

/**
 * «Comisiones» de Ventas y caja: cuánto ganó cada vendedor por lo que vendió y
 * si ya se le pagó. Todo el cálculo es del backend (`/api/commissions/calculo`);
 * acá se elige el período, se ajustan las reglas y se paga — el pago queda como
 * gasto «Comisiones».
 *
 * 10-10 (Brandon: «compactar», «sección para pasar de una a otra»): la cabecera
 * va en UNA fila (título · Vendedores|Reglas · período · Indicadores · Más) y
 * las reglas son una sección, no un panel que empujaba la tabla. Lo nuevo: las
 * ventas de cada vendedor una por una (`VentasDelVendedor`).
 */
export default function CommissionCalculator() {
  const c = useComisiones();
  const { confirm } = useConfirm();
  const [seccion, setSeccion] = useState<SeccionComisiones>("vendedores");
  const [pagando, setPagando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const [verVentas, setVerVentas] = useState<FilaComision | null>(null);
  const kpis = useIndicadoresComisiones(c.datos);
  const visto = c.datos ? { desde: c.datos.desde, hasta: c.datos.hasta } : null;

  async function pagar(f: FilaComision, medio: string) {
    // El período de la cifra en pantalla, no el que se está cargando.
    if (!visto || c.loading) return;
    const ok = await confirm({
      title: `¿Pagar ${fmt(f.pendiente)} a ${f.cashierName}?`,
      description: `Se registra como gasto «Comisiones» del ${visto.desde} al ${visto.hasta}, pagado en ${etiquetaMedio(medio)}. Si el monto cambió, el sistema no paga y te muestra el nuevo.`,
      confirmLabel: "Sí, pagar",
    });
    if (!ok) return;
    setPagando(f.cashierId);
    setAviso(null);
    const err = await c.pagar(f.cashierId, medio, visto, f.pendiente);
    setPagando(null);
    setAviso(err ? { ok: false, msg: err } : { ok: true, msg: `Comisión de ${f.cashierName} pagada: quedó en Gastos › Comisiones.` });
  }

  const exportar = () =>
    exportToCSV(
      (c.datos?.filas ?? []).map((f) => ({
        // Base y tramo en el archivo (M46): quien lo abre en Excel sabe sobre qué se calculó.
        Vendedor: f.cashierName, Ventas: f.ventas, Vendido: f.vendido.toFixed(2), Base: BASE_COMISION.corta,
        "% comisión": f.tasa, Regla: FUENTE_CSV[f.fuente], Tramo: f.tramo ?? "todo lo vendido",
        Comisión: f.comision.toFixed(2), Pagado: f.pagado.toFixed(2), Pendiente: f.pendiente.toFixed(2),
      })),
      `comisiones-${c.rango.desde}-a-${c.rango.hasta}.csv`,
    );

  const conError = c.error != null || aviso?.ok === false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-1.5">
          <SectionTitle>Comisiones</SectionTitle>
          <InfoTip
            title="Comisiones"
            what="Lo que gana cada vendedor por lo que vendió en el período, neto de devoluciones. Lo calcula el sistema con las reglas guardadas, igual en todas las computadoras. Toca un nombre para ver sus ventas una por una."
            affects="«Pagar» registra el pago como gasto «Comisiones» por lo pendiente del período: no se puede pagar dos veces lo mismo, ni un período que se pisa con otro ya pagado."
            example="María vendió S/ 6,000 con regla de 3 %: gana S/ 180. Si ya le pagaste S/ 60 de la primera semana, quedan S/ 120 por pagar."
          />
        </div>
        <SeccionesComisiones valor={seccion} onCambiar={setSeccion} reglas={c.reglas.length} />
        {seccion === "vendedores" && (
          <select aria-label="Período" title={`Del ${tramoDias(c.rango)}`} value={c.periodo} onChange={(e) => c.setPeriodo(e.target.value as Periodo)} className={CAMPO}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {seccion === "vendedores" && c.periodo === "fechas" && (
          <span className="flex items-center gap-1.5">
            <input type="date" aria-label="Desde" value={c.propio.desde} max={c.propio.hasta || undefined} onChange={(e) => c.setPropio({ ...c.propio, desde: e.target.value })} className={CAMPO} />
            <input type="date" aria-label="Hasta" value={c.propio.hasta} min={c.propio.desde || undefined} onChange={(e) => c.setPropio({ ...c.propio, hasta: e.target.value })} className={CAMPO} />
          </span>
        )}
        {kpis.boton}
        <ActionMenu
          label="Más acciones"
          soloIcono
          size="md"
          actions={[
            { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void c.cargar(), busy: c.loading },
            { id: "exportar", label: "Exportar CSV", hint: "El período elegido", icon: Download, onSelect: exportar, disabled: !c.datos?.filas.length },
          ]}
        />
      </div>

      {kpis.panel}

      {(c.error || aviso) && (
        <div role={conError ? "alert" : "status"} className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm",
          conError ? "bg-[var(--data-error-50)] text-[var(--data-error-ink)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
        )}>
          {conError && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
          {c.error ?? aviso?.msg}
          {c.error && <button type="button" onClick={() => void c.cargar()} className="ml-auto min-h-12 px-2 font-bold underline">Reintentar</button>}
        </div>
      )}

      <div id={ID_PANEL_COMISIONES} role="tabpanel" aria-labelledby={idPestanaComisiones(seccion)}>
      {seccion === "reglas" ? (
        <ReglasComision
          reglas={c.reglas}
          equipo={c.equipo}
          nombreDe={c.nombreDe}
          onAgregar={c.agregarRegla}
          onBorrar={c.borrarRegla}
          localesPendientes={c.localesPendientes}
          onPasarLocales={c.pasarLocales}
        />
      ) : (
        <div className="space-y-3">
        <ReglaVigente reglas={c.reglas} onVerReglas={() => setSeccion("reglas")} />
        <TablaComisiones
          datos={c.datos}
          pagando={pagando}
          onPagar={(f, medio) => void pagar(f, medio)}
          onVerRango={c.verRango}
          onVerVentas={setVerVentas}
          loading={c.loading}
          onVerReglas={() => setSeccion("reglas")}
        />
        </div>
      )}
      </div>

      <VentasDelVendedor fila={verVentas} rango={visto} onCerrar={() => setVerVentas(null)} />
    </div>
  );
}
