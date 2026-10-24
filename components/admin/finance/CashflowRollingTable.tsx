"use client";

/**
 * Mi Plata › Movimientos › Proyección de caja: «¿cuánta plata tendré?».
 *
 * En SECCIONES (`?sub=`, Brandon 11-10: «muchos datos → secciones, una cosa a
 * la vista a la vez»). Antes, debajo de lo que viene, se apilaban dos bloques
 * plegables —el detalle por concepto y la caja del mes—. Ahora la cabecera es
 * UNA fila (título + ⓘ · secciones · Indicadores · el mes, si toca · «⋯») y
 * debajo se ve una sola:
 *
 *   Lo que viene  semana a semana, en lista, y quién te paga y a quién pagas.
 *   Por concepto  la tabla de 9 conceptos × 13 semanas (de dónde sale cada cierre).
 *   Caja del mes  lo que YA pasó: entró y salió en el mes elegido (ADR-451).
 *
 * Resultado y caja son dos preguntas: «¿cuánto gané?» vive en Resultado.
 *
 * Los datos salen de dos hooks (`use-caja-del-negocio`); un solo «Actualizar»
 * recarga los dos. Cada bloque tiene su estado: si la caja no se puede ver (el
 * rol no la ve, 403) la proyección sigue y la sección «Caja del mes» no sale;
 * si la proyección falla, la caja sigue.
 */

import { useMemo, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle, Landmark, Lock, RefreshCw } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
import CajaDelMes from "@/components/admin/unified/finanzas/caja/CajaDelMes";
import LoQueViene from "@/components/admin/unified/finanzas/caja/LoQueViene";
import ProyeccionSemanas, { filas } from "@/components/admin/unified/finanzas/caja/ProyeccionSemanas";
import SemanasEnLista from "@/components/admin/unified/finanzas/caja/SemanasEnLista";
import { useIndicadoresProyeccion } from "@/components/admin/unified/finanzas/caja/use-indicadores-proyeccion";
import DetalleRenglonModal from "@/components/admin/unified/finanzas/resultado/DetalleRenglonModal";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { claveMes, mesConAnio, montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { useCajaDelNegocio, useProyeccionDeCaja } from "@/hooks/use-caja-del-negocio";
import { useVeLaPlataDelNegocio } from "@/hooks/use-resultado-del-mes";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { cn, limaDateKey } from "@/lib/utils";
import type { FuenteDetalle } from "@/lib/finance/resultado-del-negocio";

/** Las secciones de la vista (`?sub=`), en el orden de la barra. */
export const SUBS_PROYECCION = ["semanas", "por-concepto", "caja-del-mes"] as const;
type SubProyeccion = (typeof SUBS_PROYECCION)[number];
const ROTULO: Record<SubProyeccion, string> = { semanas: "Lo que viene", "por-concepto": "Por concepto", "caja-del-mes": "Caja del mes" };
const MODULE_ID = "plata-proyeccion";
const ID_PANEL = "panel-plata-proyeccion";

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
      <button type="button" onClick={onReintentar} className={button({ variant: "secondary", className: "h-12 gap-2 rounded-xl" })}>
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

export default function ProyeccionDeCajaVista() {
  const hoy = limaDateKey();
  const meses = ultimosMeses(hoy);
  const [mes, setMes] = useState(meses[0] ?? hoy.slice(0, 7));
  const [abierto, setAbierto] = useState<FuenteDetalle | null>(null);
  const ve = useVeLaPlataDelNegocio();
  const noVeCaja = ve === "no";
  const { vista: pedida, irA } = useSubvistaModulo<SubProyeccion>(MODULE_ID, SUBS_PROYECCION, "semanas");
  /* La caja del negocio se pide sólo si se ve Y hace falta: «Lo que viene» la
     usa (te deben / debes) y «Caja del mes» también. «Por concepto», no. */
  const caja = useCajaDelNegocio(ve === "si" ? mes : null);
  const proy = useProyeccionDeCaja();

  const sinCaja = noVeCaja || caja.sinPermiso;
  const secciones = useMemo(
    () => SUBS_PROYECCION.filter((s) => s !== "caja-del-mes" || !sinCaja).map((clave) => ({ clave, rotulo: ROTULO[clave] })),
    [sinCaja],
  );
  const sub: SubProyeccion = secciones.some((s) => s.clave === pedida) ? pedida : "semanas";

  const cajaDelMes = caja.datos && caja.datos.caja.mes === mes ? caja.datos : null;
  const d = proy.datos;
  const critica = d?.criticalWeek ?? null;
  const kpis = useIndicadoresProyeccion(d);
  const recargar = () => {
    if (!sinCaja) caja.recargar();
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
  const viene = !sinCaja ? (caja.datos?.viene ?? null) : null;
  const conViene = !sinCaja;

  /* El mes se elige en la tarjeta de la caja, pegado a lo que filtra (en la
     fila de la cabecera empujaba el «⋯» fuera de la vista a 1280 px). */
  const elegirMes = (
      <select
        value={mes}
        onChange={(e) => setMes(e.target.value)}
        aria-label="Mes de la caja"
        className="h-12 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      >
        {meses.map((m) => (
          <option key={m} value={m}>
            {mesConAnio(m)}
          </option>
        ))}
      </select>
  );

  const proyeccion = proy.sinPermiso ? (
    <Aviso texto="Tu usuario no ve la proyección de caja." />
  ) : proy.error && !d ? (
    <Fallo texto={proy.error} onReintentar={proy.recargar} />
  ) : !d ? (
    <LoadingState message="Proyectando las próximas 13 semanas…" />
  ) : d.weeks.length === 0 ? (
    <Aviso texto="Todavía no hay cobros, fiados ni pagos para proyectar." />
  ) : null;

  return (
    <div className="space-y-4">
      <CabeceraVista
        titulo="Proyección de caja"
        ayuda={{
          what: "Cómo seguiría tu caja las próximas 13 semanas, con lo que te van a pagar y lo que vas a pagar. En «Caja del mes», la plata que entró y salió en el mes.",
          affects: "Lo ganado del mes está en Resultado: un aserrío cobrado en setiembre y pagado en octubre es resultado de setiembre y caja de octubre.",
        }}
        secciones={<BarraDeSecciones secciones={secciones} activa={sub} onCambiar={irA} etiqueta="Secciones de Proyección de caja" idPanel={ID_PANEL} />}
        indicadores={kpis.boton}
        acciones={acciones}
        tituloMenu="Actualizar y tus cuentas"
      />
      {kpis.panel}

      {critica !== null && d && sub !== "caja-del-mes" && (
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

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, sub)}>
        {/* Lo que viene: semana a semana y, al lado, quién te paga y a quién pagas. */}
        {sub === "semanas" && (
          <div className="@container">
            <div className={cn("grid items-start gap-4", conViene && "@4xl:grid-cols-2")}>
              {proyeccion ?? (d && <SemanasEnLista d={d} filas={filas(d)} teDebenTotal={viene?.porCobrar ?? null} />)}
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
        )}

        {sub === "por-concepto" && (proyeccion ?? (d && <ProyeccionSemanas d={d} />))}

        {/* Lo que YA pasó: la caja del mes (ADR-451). */}
        {sub === "caja-del-mes" &&
          (caja.error && !cajaDelMes ? (
            <Fallo texto={caja.error} onReintentar={caja.recargar} />
          ) : !cajaDelMes ? (
            <div className="space-y-3">
              <div className="flex justify-end">{elegirMes}</div>
              <LoadingState message="Juntando lo que entró y salió…" />
            </div>
          ) : (
            <div className={cn("transition-opacity", caja.cargando && "opacity-70")} aria-busy={caja.cargando}>
              <CajaDelMes caja={cajaDelMes.caja} onAbrir={setAbierto} acciones={elegirMes} />
            </div>
          ))}
      </div>

      <DetalleRenglonModal mes={mes} fuente={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}

