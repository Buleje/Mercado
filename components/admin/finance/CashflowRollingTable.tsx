"use client";

/**
 * Mi Plata › Movimientos › Proyección de caja: «¿cuánta plata tendré?».
 *
 * Patrón del panel (noche 11-10): cabecera en una fila (título · Indicadores ·
 * «⋯»); a la vista lo que VIENE —semana a semana, en lista compacta, y lo que
 * te van a pagar y vas a pagar—; plegado, el detalle por concepto (la tabla de
 * 9 × 13) y la caja del mes, que es lo que YA pasó (ADR-451). Antes la caja
 * del mes iba primero y la vista medía 1,77 pantallas con 162 textos de 12 px.
 * Resultado y caja son dos preguntas: «¿cuánto gané?» vive en Resultado.
 *
 * Los datos salen de dos hooks (`use-caja-del-negocio`); un solo «Actualizar»
 * recarga los dos. Cada bloque tiene su estado: si la caja no se puede ver (el
 * rol no la ve, 403) la proyección sigue; si la proyección falla, la caja sigue.
 */

import { useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Landmark, Lock, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import Plegable from "@/components/admin/shared/Plegable";
import CajaDelMes from "@/components/admin/unified/finanzas/caja/CajaDelMes";
import LoQueViene from "@/components/admin/unified/finanzas/caja/LoQueViene";
import ProyeccionSemanas, { filas } from "@/components/admin/unified/finanzas/caja/ProyeccionSemanas";
import SemanasEnLista from "@/components/admin/unified/finanzas/caja/SemanasEnLista";
import { useIndicadoresProyeccion } from "@/components/admin/unified/finanzas/caja/use-indicadores-proyeccion";
import DetalleRenglonModal from "@/components/admin/unified/finanzas/resultado/DetalleRenglonModal";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { claveMes, mesConAnio, montoTexto, nombreMes } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { useCajaDelNegocio, useProyeccionDeCaja } from "@/hooks/use-caja-del-negocio";
import { useVeLaPlataDelNegocio } from "@/hooks/use-resultado-del-mes";
import { cn, limaDateKey } from "@/lib/utils";
import type { FuenteDetalle } from "@/lib/finance/resultado-del-negocio";

const BOTON =
  "inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50";

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
  const kpis = useIndicadoresProyeccion(d);
  const recargar = () => {
    if (!noVeCaja) caja.recargar();
    proy.recargar();
  };
  const acciones: MenuAccion[] = [
    { id: "actualizar", label: "Actualizar", hint: "La proyección y la caja del mes", icon: RefreshCw, onSelect: recargar },
    {
      id: "tesoreria",
      label: "Tus cuentas en Tesorería",
      hint: "El saldo de hoy es su suma",
      icon: Landmark,
      onSelect: () => irAlOrigen({ tab: "plata", params: { vista: "tesoreria" } }),
    },
  ];
  /* Lo que viene se ve con la caja del negocio (dueño y administrador). Es de
     HOY, no del mes elegido: al cambiar de mes queda la última que llegó. */
  const viene = !noVeCaja ? (caja.datos?.viene ?? null) : null;
  const conViene = !noVeCaja;

  return (
    <div className="space-y-4">
      {/* Una fila: título · Indicadores · «⋯». */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Proyección de caja</SectionTitle>
          <InfoTip
            title="Proyección de caja"
            what="Cómo seguiría tu caja las próximas 13 semanas, con lo que te van a pagar y lo que vas a pagar. Plegada abajo, la plata que entró y salió en el mes."
            affects="Lo ganado del mes está en Resultado: un aserrío cobrado en setiembre y pagado en octubre es resultado de setiembre y caja de octubre."
          />
        </div>
        {/* `justify-end`: si el titular del botón se corta, el hueco queda a la izquierda y no después del «⋯». */}
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Actualizar y tus cuentas" />
        </div>
      </div>
      {kpis.panel}

      {critica !== null && d && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 px-4 py-3 text-sm text-[var(--text-primary)]" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <strong className="font-bold text-[var(--data-error-ink)]">
            En la semana {critica} tu caja podría quedar en negativo ({montoTexto(d.weeks[critica - 1]?.closingBalance ?? null)})
          </strong>
          <InfoTip
            title="Qué hacer"
            what="Cobra fiados vencidos, conversa pagos con tus proveedores o deja para después los gastos que pueden esperar."
          />
        </div>
      )}

      {/* Lo que viene: semana a semana y, al lado, quién te paga y a quién pagas. */}
      <div className="@container">
      <div className={cn("grid items-start gap-4", conViene && "@4xl:grid-cols-2")}>
        {proy.sinPermiso ? (
          <Aviso texto="Tu usuario no ve la proyección de caja." />
        ) : proy.error && !d ? (
          <Fallo texto={proy.error} onReintentar={proy.recargar} />
        ) : !d ? (
          <LoadingState message="Proyectando las próximas 13 semanas…" />
        ) : d.weeks.length === 0 ? (
          <Aviso texto="Todavía no hay cobros, fiados ni pagos para proyectar." />
        ) : (
          <SemanasEnLista d={d} filas={filas(d)} teDebenTotal={viene?.porCobrar ?? null} />
        )}
        {conViene &&
          (caja.error && !viene ? (
            <Fallo texto={caja.error} onReintentar={caja.recargar} />
          ) : !viene ? (
            <LoadingState message="Juntando lo que te deben y lo que debes…" />
          ) : (
            <LoQueViene viene={viene} />
          ))}
      </div>
      </div>

      {d && d.weeks.length > 0 && (
        <Plegable clave="plata:caja:detalle-semanas" variante="franja" titulo="Detalle por concepto" resumen="Cada concepto, semana por semana">
          <ProyeccionSemanas d={d} />
        </Plegable>
      )}

      {/* Lo que YA pasó: la caja del mes, plegada (ADR-451). */}
      {!noVeCaja && (
        <Plegable
          clave="plata:caja:del-mes"
          variante="franja"
          titulo={`Caja de ${nombreMes(mes)}`}
          resumen={
            cajaDelMes
              ? `Entró ${montoTexto(cajaDelMes.caja.totalEntro)} · salió ${montoTexto(cajaDelMes.caja.totalSalio)}`
              : undefined
          }
          acciones={
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Mes de la caja"
              className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesConAnio(m)}
                </option>
              ))}
            </select>
          }
        >
          {caja.error && !cajaDelMes ? (
            <Fallo texto={caja.error} onReintentar={caja.recargar} />
          ) : !cajaDelMes ? (
            <LoadingState message="Juntando lo que entró y salió…" />
          ) : (
            <div className={cn("transition-opacity", caja.cargando && "opacity-70")} aria-busy={caja.cargando}>
              <CajaDelMes caja={cajaDelMes.caja} onAbrir={setAbierto} sinTitulo />
            </div>
          )}
        </Plegable>
      )}

      <DetalleRenglonModal mes={mes} fuente={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}
