"use client";

/**
 * Mi Plata › Resultado › Ganancias y pérdidas (ADR-451).
 *
 * Antes el navegador armaba el resultado con tres endpoints y un 55 % fijo de
 * costo, y el aserrío no existía: en Blas setiembre salía S/ 0 con
 * S/ 11 054,18 de corridas cobradas afuera. Ahora lo arma el servidor
 * (`useResultadoDelMes` → GET /api/finanzas/resultado) y esta pantalla sólo lo
 * pinta: Ingresos − Costos = Resultado, cada renglón con su detalle y su
 * origen, lo estimado con «≈», lo que no se sabe con «—».
 */

import { useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { DollarSign, Download, Lock, RefreshCw } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import DetalleRenglonModal from "@/components/admin/unified/finanzas/resultado/DetalleRenglonModal";
import ResultadoEstado from "@/components/admin/unified/finanzas/resultado/ResultadoEstado";
import ResultadoSerie from "@/components/admin/unified/finanzas/resultado/ResultadoSerie";
import { claveMes, etiquetaFuente, montoTexto, nombreMes } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { useResultadoDelMes, useVeLaPlataDelNegocio } from "@/hooks/use-resultado-del-mes";
import { cn, exportToCSV, limaDateKey } from "@/lib/utils";
import type { FuenteDetalle, ResultadoDelMes } from "@/lib/finance/resultado-del-negocio";

const MESES_DEL_ANIO = Array.from({ length: 12 }, (_, i) => {
  const n = nombreMes(claveMes(2000, i));
  return `${n.charAt(0).toUpperCase()}${n.slice(1)}`;
});

const CONTROL =
  "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

/** El CSV del mes: los mismos renglones y totales que la pantalla. `null` va vacío, no 0. */
function descargar(r: ResultadoDelMes) {
  const fila = (concepto: string, monto: number | null, estimado: boolean) => ({
    concepto,
    importe: monto,
    estimado: estimado ? "sí" : "",
  });
  exportToCSV(
    [
      ...r.ingresos.map((x) => fila(`(+) ${etiquetaFuente(x.fuente)}`, x.monto, x.certeza !== "medido")),
      fila("Total ingresos", r.totalIngresos, r.ingresos.some((x) => x.certeza !== "medido")),
      ...r.costos.map((x) => fila(`(−) ${etiquetaFuente(x.fuente)}`, x.monto == null ? null : -x.monto, x.certeza !== "medido")),
      fila("Total costos", -r.totalCostos, r.costos.some((x) => x.certeza !== "medido")),
      fila("RESULTADO", r.resultado, r.estimado),
    ],
    `resultado-${r.mes}`,
  );
}

/** Nada anotado: ni renglones, ni compras, ni avisos. Un «—» (planilla sin permiso) no es «nada». */
const mesVacio = (r: ResultadoDelMes): boolean =>
  [...r.ingresos, ...r.costos].every((x) => x.cuantos === 0 && x.monto === 0 && !x.faltan) &&
  r.memo.cuantas + r.memo.sinCosto === 0 &&
  r.avisos.length === 0;

function Recuadro({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center", className)}>
      {children}
    </div>
  );
}

export default function PLTab() {
  // El mes «actual» es el de Lima: con la hora del navegador, a las 20:00 del
  // último día (o fuera de Perú) abría el mes siguiente.
  const hoyLima = limaDateKey();
  const anioLima = Number(hoyLima.slice(0, 4));
  const [mes, setMes] = useState(hoyLima.slice(0, 7));
  const [abierto, setAbierto] = useState<FuenteDetalle | null>(null);
  const ve = useVeLaPlataDelNegocio();
  const { datos, cargando, error, sinPermiso, recargar } = useResultadoDelMes(ve === "si" ? mes : null);

  const anio = Number(mes.slice(0, 4));
  const mes0 = Number(mes.slice(5, 7)) - 1;
  /* Los datos de otro mes (el pedido anterior) no se muestran como si fueran de este. */
  const delMes = datos && datos.actual.mes === mes ? datos : null;
  const noLoVe = ve === "no" || sinPermiso;
  const anterior = delMes ? (delMes.serie[delMes.serie.length - 2] ?? null) : null;

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        as="h2"
        title="Ganancias y pérdidas del mes"
        description="Lo que ganaste: ingresos menos costos, con el aserrío y la madera adentro"
        icon={DollarSign}
      >
        <select value={mes0} onChange={(e) => setMes(claveMes(anio, Number(e.target.value)))} aria-label="Mes" className={CONTROL}>
          {MESES_DEL_ANIO.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <select value={anio} onChange={(e) => setMes(claveMes(Number(e.target.value), mes0))} aria-label="Año" className={CONTROL}>
          {[anioLima - 1, anioLima, anioLima + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Actualizar"
          title="Actualizar"
          onClick={recargar}
          disabled={noLoVe}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4 text-[var(--text-secondary)]", cargando && delMes && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={() => delMes && descargar(delMes.actual)}
          disabled={!delMes}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden /> Descargar
        </button>
      </AdminModuleHeader>

      {noLoVe ? (
        <Recuadro>
          <Lock className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-primary)]">Esto lo ve el dueño o un administrador.</p>
        </Recuadro>
      ) : error && !delMes ? (
        <Recuadro>
          <p className="text-sm font-medium text-[var(--data-error-ink)]" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={recargar}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </Recuadro>
      ) : !delMes ? (
        <LoadingState message="Armando el resultado del mes…" />
      ) : (
        <div className={cn("space-y-4 transition-opacity", cargando && "opacity-70")} aria-busy={cargando}>
          {mesVacio(delMes.actual) ? (
            <Recuadro>
              <p className="text-sm text-[var(--text-secondary)]">
                En {nombreMes(mes)} todavía no hay ventas, aserríos ni gastos anotados.
              </p>
            </Recuadro>
          ) : (
            <ResultadoEstado actual={delMes.actual} anterior={anterior} onAbrir={setAbierto} />
          )}
          <ResultadoSerie serie={delMes.serie} elegido={mes} onElegir={setMes} />
          {error && (
            <p className="text-xs text-[var(--data-error-ink)]" role="status">
              No se pudo actualizar: {error} Lo de arriba es de la última carga ({montoTexto(delMes.actual.resultado, { signo: true })}).
            </p>
          )}
        </div>
      )}

      <DetalleRenglonModal mes={mes} fuente={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}
