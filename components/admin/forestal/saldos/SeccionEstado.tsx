"use client";

/**
 * «Cómo está hoy»: el saldo que se declara, el patio por permiso, qué madera
 * hay de cada tipo y cuánto lleva parada.
 *
 * El patio por permiso es el MISMO componente que Consumos (ADR-431): el dueño
 * que mira el balance ve el mismo número que el operador frente a la pila. Acá
 * un clic en un permiso lleva a «Qué puede salir» con ese permiso puesto.
 */

import { ArrowRight } from "@buleje/design-system/icons";
import type { CurvaSaldoData } from "./CurvaDeSaldo";
import type { SaldosData } from "@/hooks/use-ctp-saldos";
import type { ResumenAntiguedad } from "@/lib/forestal/antiguedad-por-guia";
import type { EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { DestinoExcepcion, Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import type { ResumenPorPermiso } from "@/lib/forestal/patio-resumen";
import CtpPatioAging from "../CtpPatioAging";
import CtpPatioPorPermiso from "../CtpPatioPorPermiso";
import DisponiblePorTipo from "./DisponiblePorTipo";
import KpisDeExistencias from "./KpisDeExistencias";

export default function SeccionEstado({
  data,
  period,
  curva,
  onVerMovimiento,
  onKardex,
  porPermiso,
  estadoPatio,
  permisosActivos,
  onElegirPermiso,
  antiguedad,
  especieKpi,
  onIr,
}: {
  data: SaldosData;
  period: CtpPeriod;
  curva: CurvaSaldoData | null;
  onVerMovimiento: () => void;
  onKardex: (especie: string) => void;
  porPermiso: ResumenPorPermiso;
  estadoPatio: EstadoFuente;
  /** Los permisos puestos en el recorte de la capacidad (fila activa). */
  permisosActivos: readonly string[];
  onElegirPermiso: (permiso: string) => void;
  antiguedad: { resumen: ResumenAntiguedad; estado: EstadoFuente; error: string | null };
  especieKpi: string;
  /** Recepcionar (Ingresos), ver las trozas (Consumos) y cargar costos (Rentabilidad). */
  onIr?: (vista: DestinoExcepcion, filtro?: Excepcion["filtro"]) => void;
}) {
  return (
    <>
      <KpisDeExistencias
        materiaPrima={data.materiaPrima}
        porEspecie={data.porEspecie}
        productos={data.productos}
        period={period}
        /* La trayectoria del saldo al lado del número: sale de la curva, que
           es un pedido aparte; si no llegó, el héroe se dibuja sin rastro. */
        serieSaldo={curva?.puntos.map((p) => Number(p.saldo))}
        onVerMovimiento={onVerMovimiento}
      />

      <div className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <CtpPatioPorPermiso
          compacto
          titulo="Patio por permiso: trozas que quedan"
          filas={porPermiso.filas}
          totales={porPermiso.totales}
          activos={permisosActivos}
          onElegir={onElegirPermiso}
          onRecepcionar={onIr ? () => onIr("ingresos", "pendiente") : undefined}
          cargando={estadoPatio === "cargando"}
          error={
            estadoPatio === "error" ? "No se pudo leer el patio. Usa «Recargar» arriba." : null
          }
        />
        {onIr && (
          <button
            type="button"
            onClick={() => onIr("consumos")}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
          >
            Ver las trozas en Consumos <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Cuánta madera tengo y de qué: el m³ del libro, por especie. */}
      <DisponiblePorTipo
        especies={data.porEspecie}
        productos={data.productos}
        onKardex={onKardex}
      />

      {/* Qué parte lleva demasiado tiempo parada (m³ del libro por guía). */}
      <CtpPatioAging
        resumen={antiguedad.resumen}
        estado={antiguedad.estado}
        error={antiguedad.error}
        especie={especieKpi || undefined}
        onValorizar={onIr ? () => onIr("rentabilidad") : undefined}
      />
    </>
  );
}
