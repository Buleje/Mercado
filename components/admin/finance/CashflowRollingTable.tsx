"use client";

/**
 * Mi Plata › Movimientos › Proyección de caja.
 *
 * Arriba lo que ya pasó —la caja del mes, por fuente, y lo que viene (ADR-451)—
 * y debajo la proyección de 13 semanas. Resultado y caja son dos preguntas:
 * «¿cuánto gané?» vive en Resultado; acá, «¿cuánta plata tengo y tendré?».
 *
 * Los datos salen de dos hooks (`use-caja-del-negocio`); un solo «Actualizar»
 * recarga los dos. Cada bloque tiene su estado: si la caja no se puede ver (el
 * rol no la ve, 403) la proyección sigue; si la proyección falla, la caja sigue.
 */

import { useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Lock, RefreshCw, Waves } from "@buleje/design-system/icons";
import CajaDelMes from "@/components/admin/unified/finanzas/caja/CajaDelMes";
import LoQueViene from "@/components/admin/unified/finanzas/caja/LoQueViene";
import ProyeccionSemanas from "@/components/admin/unified/finanzas/caja/ProyeccionSemanas";
import DetalleRenglonModal from "@/components/admin/unified/finanzas/resultado/DetalleRenglonModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { claveMes, mesConAnio, montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { useCajaDelNegocio, useProyeccionDeCaja } from "@/hooks/use-caja-del-negocio";
import { useVeLaPlataDelNegocio } from "@/hooks/use-resultado-del-mes";
import { formatDateShort } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import type { FuenteDetalle } from "@/lib/finance/resultado-del-negocio";

const BOTON =
  "inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50";

/** Los últimos 12 meses de Lima, del más nuevo al más viejo. */
function ultimosMeses(hoy: string): string[] {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - i, 1));
    return claveMes(d.getUTCFullYear(), d.getUTCMonth());
  });
}

function Fallo({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6" role="alert">
      <AlertTriangle className="h-6 w-6 text-[var(--data-error-ink)]" aria-hidden />
      <p className="text-center text-sm font-medium text-[var(--data-error-ink)]">{texto}</p>
      <button type="button" onClick={onReintentar} className={BOTON}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
      </button>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-sm text-[var(--text-secondary)]">
      <Lock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden /> {texto}
    </div>
  );
}

export default function CashflowRollingTable() {
  const hoy = limaDateKey();
  const meses = ultimosMeses(hoy);
  const [mes, setMes] = useState(meses[0] ?? hoy.slice(0, 7));
  const [abierto, setAbierto] = useState<FuenteDetalle | null>(null);
  const ve = useVeLaPlataDelNegocio();
  const caja = useCajaDelNegocio(ve === "si" ? mes : null);
  const proy = useProyeccionDeCaja();

  const cajaDelMes = caja.datos && caja.datos.caja.mes === mes ? caja.datos : null;
  const noVeCaja = ve === "no" || caja.sinPermiso;
  const d = proy.datos;
  const critica = d?.criticalWeek ?? null;
  const recargar = () => {
    if (!noVeCaja) caja.recargar();
    proy.recargar();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Waves className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">Caja del negocio</SectionTitle>
              <InfoTip
                title="Caja del negocio"
                what="Arriba, la plata que entró y salió en el mes y lo que te deben o debes. Abajo, cómo seguiría tu caja las próximas 13 semanas."
                affects="Lo ganado del mes está en Resultado: un aserrío cobrado en setiembre y pagado en octubre es resultado de setiembre y caja de octubre."
              />
            </div>
            {d && <p className="text-xs text-[var(--text-secondary)]">Proyección al {formatDateShort(d.generatedAt)}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!noVeCaja && (
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Mes de la caja"
              className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesConAnio(m)}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={recargar} disabled={proy.cargando && caja.cargando} className={BOTON}>
            <RefreshCw className={cn("h-4 w-4", (proy.cargando || caja.cargando) && "animate-spin")} aria-hidden />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Caja del mes y lo que viene: sólo dueño y administrador ── */}
      {!noVeCaja &&
        (caja.error && !cajaDelMes ? (
          <Fallo texto={caja.error} onReintentar={caja.recargar} />
        ) : !cajaDelMes ? (
          <LoadingState message="Juntando lo que entró y salió…" />
        ) : (
          <div className={cn("space-y-4 transition-opacity", caja.cargando && "opacity-70")} aria-busy={caja.cargando}>
            <CajaDelMes caja={cajaDelMes.caja} onAbrir={setAbierto} />
            <LoQueViene viene={cajaDelMes.viene} />
          </div>
        ))}

      {/* ── Proyección de 13 semanas ── */}
      {critica !== null && d && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            <strong className="font-bold text-[var(--data-error-ink)]">En la semana {critica} tu caja podría quedar en negativo</strong>{" "}
            ({montoTexto(d.weeks[critica - 1]?.closingBalance ?? null)}). Cobra fiados vencidos, conversa pagos con tus
            proveedores o deja para después los gastos que pueden esperar.
          </p>
        </div>
      )}
      {proy.sinPermiso ? (
        <Aviso texto="Tu usuario no ve la proyección de caja." />
      ) : proy.error && !d ? (
        <Fallo texto={proy.error} onReintentar={proy.recargar} />
      ) : !d ? (
        <LoadingState message="Proyectando las próximas 13 semanas…" />
      ) : d.weeks.length === 0 ? (
        <Aviso texto="Todavía no hay cobros, fiados ni pagos para proyectar." />
      ) : (
        <ProyeccionSemanas d={d} />
      )}

      <DetalleRenglonModal mes={mes} fuente={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}
