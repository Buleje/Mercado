"use client";

/**
 * ListaDelDia — lo que va debajo del encabezado de la hoja del día (Brandon
 * 20-10, mejoras de Asistencia):
 *  - Feriado del Perú: una línea; ese día no se pide marca ni cuenta como día
 *    abierto (la agenda tampoco lo pide, `lib/feriados-peru.ts`).
 *  - «¿Se retiró?»: quien lleva 14 días sin venir (sólo hoy, gestión y
 *    completo): «Sí, retirado» abre el retiro con su último día; «Sigue» lo
 *    calla hasta que vuelva a marcar.
 *  - La lista de quien trabaja ese día. Los eventuales (ADR-506) sólo están si
 *    tienen marca; los demás quedan plegados en «Eventuales», listos para marcar.
 *  - «No trabajan este día» (vacaciones, licencia, antes de ingresar…).
 */
import { useState, type ReactNode } from "react";
import { CalendarOff, UserMinus } from "@buleje/design-system/icons";
import type { ColaboradorMinDTO, FechaKey } from "@/lib/rrhh/tipos";
import Plegable from "@/components/admin/shared/Plegable";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { motivoNoIncluido, noVienenHace } from "../rrhh-ui";
import { etiquetaCorta } from "@/lib/rrhh/fechas";

const CLAVE_SIGUE = "rrhh-sigue-viniendo";

interface Props {
  fecha: FechaKey;
  esHoy: boolean;
  feriado: { nombre: string } | null;
  /** Quien trabaja ese día y no es eventual sin marca. */
  fijos: readonly ColaboradorMinDTO[];
  eventualesSinMarca: readonly ColaboradorMinDTO[];
  noIncluidos: readonly ColaboradorMinDTO[];
  ultimaVino: Readonly<Record<string, FechaKey>>;
  editable: boolean;
  fila: (c: ColaboradorMinDTO) => ReactNode;
  onMarcarVacaciones: (c: ColaboradorMinDTO) => void;
  /** Gestión y completo: abrir el retiro con el último día propuesto. */
  onRetirar?: (c: ColaboradorMinDTO, ultimoDia: FechaKey) => void;
}

/** «15/09», o «11/03/2024» si es de otro año. */
const conAnio = (f: FechaKey, hoy: FechaKey) => (f.slice(0, 4) === hoy.slice(0, 4) ? etiquetaCorta(f) : `${etiquetaCorta(f)}/${f.slice(0, 4)}`);

function leerSigue(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(CLAVE_SIGUE) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export default function ListaDelDia({ fecha, esHoy, feriado, fijos, eventualesSinMarca, noIncluidos, ultimaVino, editable, fila, onMarcarVacaciones, onRetirar }: Props) {
  /* «Sigue»: se calla mientras su último día sea el mismo (si vuelve y deja de venir, se pregunta de nuevo). */
  const [sigue, setSigue] = useState<Record<string, string>>(() => (typeof window === "undefined" ? {} : leerSigue()));
  const porId = new Map(fijos.map((c) => [c.id, c]));
  const noVienen =
    esHoy && onRetirar ? noVienenHace(fijos, ultimaVino, fecha).filter((n) => sigue[n.id] !== n.desde && porId.has(n.id)) : [];

  const decirQueSigue = (id: string, desde: string) => {
    const nuevo = { ...sigue, [id]: desde };
    setSigue(nuevo);
    try {
      window.localStorage.setItem(CLAVE_SIGUE, JSON.stringify(nuevo));
    } catch {
      /* modo privado: se pregunta otra vez la próxima */
    }
  };

  return (
    <>
      {feriado && (
        <AvisoRrhh tono="neutro" icono={CalendarOff}>
          Feriado: {feriado.nombre}. Si nadie vino, no hace falta marcar: no cuenta como día sin marcar.
        </AvisoRrhh>
      )}

      {noVienen.length > 0 && (
        <AvisoRrhh tono="aviso" icono={UserMinus}>
          <span className="block font-semibold">{noVienen.length === 1 ? "¿Se retiró? Lleva 14 días o más sin venir:" : "¿Se retiraron? Llevan 14 días o más sin venir:"}</span>
          <ul className="mt-1 space-y-1">
            {noVienen.map((n) => {
              const c = porId.get(n.id);
              if (!c) return null;
              return (
                <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0">
                    <span className="font-semibold">{c.nombre}</span> · {n.nunca ? `nunca vino (ingresó el ${conAnio(n.desde, fecha)})` : `no viene desde el ${conAnio(n.desde, fecha)}`} · {n.dias} días
                  </span>
                  <span className="ml-auto flex gap-1">
                    <button type="button" className={BOTON.chicoPeligro} onClick={() => onRetirar?.(c, n.desde)}>
                      Sí, retirado
                    </button>
                    <button type="button" className={BOTON.chico} onClick={() => decirQueSigue(n.id, n.desde)} title="Sigue trabajando: no preguntar hasta que vuelva a marcar">
                      Sigue
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </AvisoRrhh>
      )}

      {/* Una lista, no una tarjeta por persona: filas separadas por una raya. */}
      <div className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">{fijos.map((c) => fila(c))}</div>

      {eventualesSinMarca.length > 0 && (
        <BloqueDelDia clave="eventuales" titulo={`Eventuales (${eventualesSinMarca.length})`} ayuda="Vienen algunos días: márcalos si vinieron hoy">
          <div className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">{eventualesSinMarca.map((c) => fila(c))}</div>
        </BloqueDelDia>
      )}

      {noIncluidos.length > 0 && (
        <BloqueDelDia clave="no-trabajan" titulo={`No trabajan este día (${noIncluidos.length})`}>
          <ul className="space-y-1 border-t border-[var(--rule-soft)] px-4 py-2">
            {noIncluidos.map((c) => (
              <li key={c.id} className="flex min-h-10 flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-[var(--text-primary)]">
                  {c.nombre} <span className="text-[var(--text-tertiary)]">— {motivoNoIncluido(c, fecha)}</span>
                </span>
                {/* Sólo VACACIONES tiene un mapeo directo a un estado de asistencia
                    (ADR-414 §7). LICENCIA/SUSPENDIDO se corrigen desde la ficha. */}
                {c.estado === "VACACIONES" && (
                  <button type="button" disabled={!editable} onClick={() => onMarcarVacaciones(c)} className={BOTON.chico}>
                    Marcar vacaciones
                  </button>
                )}
              </li>
            ))}
          </ul>
        </BloqueDelDia>
      )}
    </>
  );
}

/** Un bloque plegado del día: el `Plegable` recordado del panel, con la ayuda junto al título. */
function BloqueDelDia({ clave, titulo, ayuda, children }: { clave: string; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <Plegable
      clave={`rrhh:asistencia:${clave}`}
      titulo={
        <>
          {titulo}
          {ayuda && <span className="ml-2 font-normal text-[var(--text-tertiary)]">· {ayuda}</span>}
        </>
      }
    >
      {children}
    </Plegable>
  );
}
